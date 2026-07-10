import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { recordApiUsage } from "@/lib/api-usage";
import { ApiServiceDisabledError, assertApiServiceEnabled } from "@/lib/api-usage-controls";
import { estimateGeminiUsd } from "@/lib/pricing-config";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import type { GenomaStreamEvent } from "@/lib/genoma/crawl/types";
import { normalizeGenome, type Genome } from "@/lib/genoma/model/trait";
import { encodeIngestEvent, type GenomaIngestStreamEvent } from "@/lib/genoma/ingest/types";
import { ingestImageIntoGenome, ingestPdfIntoGenome, ingestSvgIntoGenome } from "@/lib/genoma/ingest/pdf-ingest-server";
import { ingestUrlIntoGenome } from "@/lib/genoma/ingest/url-ingest-server";
import { genomeHasPriorMaterial } from "@/lib/genoma/ingest/material-prompt";
import { COPY_GENOME_COMPLETE } from "@/lib/genoma/ingest/feedback-copy";
import {
  isPdfFile,
  isRasterImageFile,
  isSvgFile,
  sortIngestFiles,
} from "@/lib/genoma/ingest/ingest-file-priority";
import { parseGenomaIngestPaidOpts } from "@/lib/genoma/ingest/genoma-ingest-form";
import { runGenomaIngest, type GenomaIngestFile } from "@/lib/genoma/ingest/run-ingest";
import {
  releaseApiWalletChargeOnError,
  reserveApiWalletCharge,
  reserveUsdToMicros,
  walletGateErrorResponse,
  type ApiWalletCharge,
} from "@/lib/wallet-api-gate";

export const runtime = "nodejs";
export const maxDuration = 300;

const GENOMA_LLM_MODEL = process.env.GENOMA_LLM_GEMINI_MODEL?.trim() || "gemini-2.5-flash";

function estimateGenomaIngestLlmReserveUsd(): number {
  const textCall = estimateGeminiUsd(GENOMA_LLM_MODEL, 6500, 900);
  return Math.round((textCall * 2 + 0.008) * 1_000_000) / 1_000_000;
}

function collectUploadFiles(formData: FormData): File[] {
  const plural = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (plural.length > 0) return plural;
  return formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
}

function isLegacyGenomaIngest(formData: FormData): boolean {
  const genomeRaw = formData.get("genome");
  return typeof genomeRaw === "string" && genomeRaw.trim().length > 0;
}

async function* processLegacyFiles(
  files: File[],
  genomeSeed: Genome,
  opts: {
    userEmail?: string;
    allowMaterialPrompts?: boolean;
    allowPaidAnalysis?: boolean;
    paidAnalysisOperationId?: string;
  } = {},
): AsyncGenerator<GenomaIngestStreamEvent> {
  yield { type: "ingest_receive", fileCount: files.length };

  let genome = normalizeGenome(genomeSeed);
  const ingestOpts = {
    userEmail: opts.userEmail,
    allowMaterialPrompts: opts.allowMaterialPrompts ?? genomeHasPriorMaterial(genomeSeed),
    allowPaidAnalysis: opts.allowPaidAnalysis,
    paidAnalysisOperationId: opts.paidAnalysisOperationId,
  };

  for (const file of sortIngestFiles(files)) {
    const buffer = Buffer.from(await file.arrayBuffer());

    if (isSvgFile(file)) {
      yield { type: "ingest_reading", sourceCount: genome.sources.length + 1 };
      const { events, genome: next } = await ingestSvgIntoGenome(buffer, file.name, genome);
      genome = next;
      for (const event of events) yield event;
      continue;
    }

    if (isPdfFile(file)) {
      yield { type: "ingest_reading", sourceCount: genome.sources.length + 1 };
      for await (const event of ingestPdfIntoGenome(buffer, file.name, genome, ingestOpts)) {
        if (event.type === "genome_update") genome = normalizeGenome(event.genome);
        yield event;
      }
      continue;
    }

    if (isRasterImageFile(file)) {
      yield { type: "ingest_reading", sourceCount: genome.sources.length + 1 };
      const mime = file.type || "image/png";
      const { events, genome: next } = await ingestImageIntoGenome(buffer, file.name, mime, genome, ingestOpts);
      genome = next;
      for (const event of events) yield event;
      continue;
    }

    yield {
      type: "source_error",
      fileName: file.name,
      message: "Formato no soportado todavía",
    };
  }

  yield { type: "micro", text: COPY_GENOME_COMPLETE };
  yield { type: "genome_update", genome };
  yield { type: "done" };
}

function streamLegacyIngest(
  events: AsyncGenerator<GenomaIngestStreamEvent>,
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const event of events) {
          controller.enqueue(encoder.encode(encodeIngestEvent(event)));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error de ingesta";
        controller.enqueue(
          encoder.encode(encodeIngestEvent({ type: "source_error", fileName: "ingesta", message })),
        );
        controller.enqueue(encoder.encode(encodeIngestEvent({ type: "done" })));
      } finally {
        controller.close();
      }
    },
  });
}

function streamV2Ingest(
  files: GenomaIngestFile[],
  jobId: string,
  options: {
    userEmail: string;
    llmEnabled: boolean;
    pdfLogoVisionEnabled: boolean;
    allowLogoCropVerify: boolean;
    llmSkipReason?: string;
    pdfLogoVisionSkipReason?: string;
    onLlmCostUsd: (cost: number) => void;
    walletCharge: ApiWalletCharge | null;
  },
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: GenomaStreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      let releaseWalletOnError = true;
      let llmCostUsd = 0;

      try {
        for await (const event of runGenomaIngest(files, jobId, {
          userEmail: options.userEmail,
          llmEnabled: options.llmEnabled,
          pdfLogoVisionEnabled: options.pdfLogoVisionEnabled,
          allowLogoCropVerify: options.allowLogoCropVerify,
          llmSkipReason: options.llmSkipReason,
          pdfLogoVisionSkipReason: options.pdfLogoVisionSkipReason,
          onLlmCostUsd: (cost) => {
            llmCostUsd += cost;
            options.onLlmCostUsd(cost);
          },
        })) {
          send(event);
          if (event.type === "error") break;
        }

        releaseWalletOnError = false;
        if (options.llmEnabled && options.walletCharge) {
          await options.walletCharge.capture({
            actualCostUsd: Math.max(llmCostUsd, 0.001),
            metadata: { jobId, fileCount: files.length, llmEnabled: true },
          });
        }

        await recordApiUsage({
          provider: "aws",
          userEmail: options.userEmail,
          serviceId: "genoma-ingest",
          route: "/api/spaces/genoma/ingest",
          costUsd: 0,
          metadata: { jobId, fileCount: files.length, llm: options.llmEnabled, llmCostUsd },
        }).catch(() => undefined);
      } catch (error) {
        if (releaseWalletOnError) await releaseApiWalletChargeOnError(options.walletCharge, error);
        send({
          type: "error",
          message: error instanceof Error ? error.message : "Error de ingesta",
        });
      } finally {
        controller.close();
      }
    },
  });
}

export async function POST(req: NextRequest) {
  let walletCharge: ApiWalletCharge | null = null;
  let releaseWalletOnError = true;

  try {
    const auth = await requireSpacesAuthUser(req);
    if (!auth.ok) return auth.response;

    const formData = await req.formData();
    const paidOpts = parseGenomaIngestPaidOpts(formData);
    const urlRaw = formData.get("url");

    if (typeof urlRaw === "string" && urlRaw.trim()) {
      let genomeSeed: Genome = normalizeGenome(undefined);
      const genomeRaw = formData.get("genome");
      if (typeof genomeRaw === "string" && genomeRaw.trim()) {
        try {
          genomeSeed = normalizeGenome(JSON.parse(genomeRaw));
        } catch {
          /* vacío */
        }
      }
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          try {
            let genome = genomeSeed;
            for await (const event of ingestUrlIntoGenome(urlRaw.trim(), genome, {
              userEmail: auth.user.email,
              allowMaterialPrompts: genomeHasPriorMaterial(genomeSeed),
              allowPaidAnalysis: paidOpts.allowPaidAnalysis,
              paidAnalysisOperationId: paidOpts.paidAnalysisOperationId,
            })) {
              if (event.type === "genome_update") genome = normalizeGenome(event.genome);
              controller.enqueue(encoder.encode(encodeIngestEvent(event)));
            }
            controller.enqueue(encoder.encode(encodeIngestEvent({ type: "micro", text: COPY_GENOME_COMPLETE })));
            controller.enqueue(encoder.encode(encodeIngestEvent({ type: "done" })));
          } catch (err) {
            const message = err instanceof Error ? err.message : "Error de ingesta";
            controller.enqueue(encoder.encode(encodeIngestEvent({ type: "source_error", fileName: "url", message })));
            controller.enqueue(encoder.encode(encodeIngestEvent({ type: "done" })));
          } finally {
            controller.close();
          }
        },
      });
      return new Response(stream, {
        headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    const files = collectUploadFiles(formData);
    if (files.length === 0) {
      return new Response(JSON.stringify({ error: "No files or url" }), { status: 400 });
    }

    if (isLegacyGenomaIngest(formData)) {
      let genomeSeed: Genome = normalizeGenome(undefined);
      const genomeRaw = formData.get("genome");
      if (typeof genomeRaw === "string" && genomeRaw.trim()) {
        try {
          genomeSeed = normalizeGenome(JSON.parse(genomeRaw));
        } catch {
          /* seed vacío */
        }
      }

      return new Response(
        streamLegacyIngest(
          processLegacyFiles(files, genomeSeed, {
            userEmail: auth.user.email,
            allowMaterialPrompts: genomeHasPriorMaterial(genomeSeed),
            allowPaidAnalysis: paidOpts.allowPaidAnalysis,
            paidAnalysisOperationId: paidOpts.paidAnalysisOperationId,
          }),
        ),
        {
          headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const enableLlm = formData.get("enableLlm") !== "false";
    const hasGemini = Boolean((process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim());
    let llmEnabled = false;
    let pdfLogoVisionEnabled = enableLlm && hasGemini;
    let llmSkipReason: string | undefined;
    let pdfLogoVisionSkipReason: string | undefined;

    if (!enableLlm) {
      llmSkipReason = "IA desactivada";
      pdfLogoVisionSkipReason = llmSkipReason;
      pdfLogoVisionEnabled = false;
    } else if (!hasGemini) {
      llmSkipReason = "GEMINI_API_KEY no configurada — solo extracción determinista";
      pdfLogoVisionSkipReason = llmSkipReason;
      pdfLogoVisionEnabled = false;
    } else {
      try {
        await assertApiServiceEnabled("genoma-llm-synthesis");
        llmEnabled = true;
        walletCharge = await reserveApiWalletCharge({
          req,
          userEmail: auth.user.email,
          serviceId: "genoma-llm-synthesis",
          provider: "gemini",
          route: "/api/spaces/genoma/ingest",
          maxCostMicros: reserveUsdToMicros(estimateGenomaIngestLlmReserveUsd(), { multiplier: 1.5 }),
          metadata: { fileCount: files.length, model: GENOMA_LLM_MODEL },
        });
        releaseWalletOnError = false;
      } catch (error) {
        if (error instanceof ApiServiceDisabledError) {
          llmSkipReason = "Síntesis IA deshabilitada en administración";
        } else {
          throw error;
        }
      }
    }

    const buffers: GenomaIngestFile[] = await Promise.all(
      files.map(async (file) => ({
        name: file.name,
        mime: file.type || "application/octet-stream",
        buffer: Buffer.from(await file.arrayBuffer()),
      })),
    );

    const jobId = randomUUID();
    return new Response(
      streamV2Ingest(buffers, jobId, {
        userEmail: auth.user.email,
        llmEnabled,
        pdfLogoVisionEnabled,
        allowLogoCropVerify: pdfLogoVisionEnabled,
        llmSkipReason,
        pdfLogoVisionSkipReason,
        onLlmCostUsd: () => undefined,
        walletCharge,
      }),
      {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    if (releaseWalletOnError) await releaseApiWalletChargeOnError(walletCharge, error);
    const walletResponse = walletGateErrorResponse(error);
    if (walletResponse) return walletResponse;
    if (error instanceof ApiServiceDisabledError) {
      return Response.json({ error: "Síntesis IA de Genoma deshabilitada en administración." }, { status: 503 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Error de ingesta" }, { status: 500 });
  }
}
