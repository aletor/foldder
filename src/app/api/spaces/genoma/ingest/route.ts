import { NextRequest } from "next/server";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
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

export const runtime = "nodejs";
export const maxDuration = 300;

async function* processFiles(
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

export async function POST(req: NextRequest) {
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

  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return new Response(JSON.stringify({ error: "No files or url" }), { status: 400 });
  }

  let genomeSeed: Genome = normalizeGenome(undefined);
  const genomeRaw = formData.get("genome");
  if (typeof genomeRaw === "string" && genomeRaw.trim()) {
    try {
      genomeSeed = normalizeGenome(JSON.parse(genomeRaw));
    } catch {
      /* seed vacío */
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const event of processFiles(files, genomeSeed, {
          userEmail: auth.user.email,
          allowMaterialPrompts: genomeHasPriorMaterial(genomeSeed),
          allowPaidAnalysis: paidOpts.allowPaidAnalysis,
          paidAnalysisOperationId: paidOpts.paidAnalysisOperationId,
        })) {
          controller.enqueue(encoder.encode(encodeIngestEvent(event)));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error de ingesta";
        controller.enqueue(
          encoder.encode(
            encodeIngestEvent({ type: "source_error", fileName: "ingesta", message }),
          ),
        );
        controller.enqueue(encoder.encode(encodeIngestEvent({ type: "done" })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
