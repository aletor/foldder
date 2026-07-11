import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import { normalizeGenome, type Genome } from "@/lib/brandkit/model/trait";
import { encodeIngestEvent, type BrandKitIngestStreamEvent } from "@/lib/brandkit/ingest/types";
import { materialBuffersFromFiles, processMaterialBuffers } from "@/lib/brandkit/ingest/material-buffers";
import { genomeHasPriorMaterial } from "@/lib/brandkit/ingest/material-prompt";
import { parseBrandKitIngestPaidOpts } from "@/lib/brandkit/ingest/brand-kit-ingest-form";
import {
  isLogoIntakeSupportedFile,
  prepareIntakeDocFromBuffer,
} from "@/lib/brandkit/logo-intake/ingest-files";
import { saveBatchDocs } from "@/lib/brandkit/logo-intake/batch-store";
import { analyzeLogoIntakeFromDocs } from "@/lib/brandkit/logo-intake/service";
import {
  applySemanticColorEntryToGenome,
  applySemanticPaletteToGenome,
} from "@/lib/brandkit/logo-intake/genome-bridge";
import type { LogoIntakePipelineEvent } from "@/lib/brandkit/logo-intake/pipeline";
import type { IntakeDocInput } from "@/lib/brandkit/logo-intake/render";

export const runtime = "nodejs";
export const maxDuration = 300;

function mapPipelineEvent(event: LogoIntakePipelineEvent): BrandKitIngestStreamEvent | null {
  switch (event.type) {
    case "pages_preparing":
    case "vision_started":
    case "vision_retrying":
    case "vision_finished":
    case "candidates_found":
    case "palette_sampling":
    case "palette_done":
      return event;
    case "color_crowned":
      return event;
    case "logo_best_ready":
      return { type: "logo_best_ready", thumb: event.thumb, proposal: event.proposal };
    default:
      return null;
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSpacesAuthUser(req);
  if (!auth.ok) return auth.response;

  const formData = await req.formData();
  const projectId = String(formData.get("projectId") ?? "").trim();
  if (!projectId) {
    return NextResponse.json({ error: "missing_project_id" }, { status: 400 });
  }

  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files" }, { status: 400 });
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

  const paidOpts = parseBrandKitIngestPaidOpts(formData);
  const buffers = await materialBuffersFromFiles(files);

  const logoDocs: IntakeDocInput[] = [];
  let logoPrepError: string | null = null;
  for (const entry of buffers) {
    if (!isLogoIntakeSupportedFile({ name: entry.fileName })) continue;
    try {
      logoDocs.push(
        await prepareIntakeDocFromBuffer({
          fileName: entry.fileName,
          buffer: entry.buffer,
        }),
      );
    } catch (error) {
      logoPrepError = error instanceof Error ? error.message : "logo_intake_prep_failed";
    }
  }

  const batchId = randomUUID();
  const logoIntakeActive = logoDocs.length > 0;
  if (logoIntakeActive) {
    saveBatchDocs({ batchId, projectId, docs: logoDocs });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const ingestStarted = Date.now();
      const enqueue = (event: Parameters<typeof encodeIngestEvent>[0]) => {
        controller.enqueue(encoder.encode(encodeIngestEvent(event)));
      };

      try {
        let latestGenome = genomeSeed;

        const logoTask = logoIntakeActive
          ? analyzeLogoIntakeFromDocs({
              projectId,
              docs: logoDocs,
              batchId,
              userEmail: auth.user.email,
              onPipelineEvent: (event) => {
                const mapped = mapPipelineEvent(event);
                if (mapped) {
                  if (mapped.type === "color_crowned") {
                    latestGenome = applySemanticColorEntryToGenome(
                      latestGenome,
                      {
                        hex: mapped.hex,
                        role: mapped.role as "primary" | "secondary" | "accent" | "background",
                        regionKind: "logo",
                        prominence: 2,
                        recurrence: 1,
                        share: 1,
                        pages: [0],
                        score: 1,
                        name: mapped.name,
                      },
                      { sourceId: "logo-intake" },
                    );
                    enqueue(mapped);
                    enqueue({ type: "genome_update", genome: latestGenome });
                    return;
                  }
                  enqueue(mapped);
                }
              },
            })
              .then((result) => ({ ok: true as const, result }))
              .catch((error) => ({
                ok: false as const,
                message: error instanceof Error ? error.message : "logo_intake_failed",
              }))
          : logoPrepError
            ? Promise.resolve({ ok: false as const, message: logoPrepError })
            : null;

        for await (const event of processMaterialBuffers(buffers, genomeSeed, {
          userEmail: auth.user.email,
          allowMaterialPrompts: genomeHasPriorMaterial(genomeSeed),
          allowPaidAnalysis: paidOpts.allowPaidAnalysis,
          paidAnalysisOperationId: paidOpts.paidAnalysisOperationId,
          skipClassicLogoExtraction: logoIntakeActive,
        })) {
          if (event.type === "genome_update") latestGenome = normalizeGenome(event.genome);
          if (event.type === "done") continue;
          enqueue(event);
        }

        if (logoTask) {
          const logo = await logoTask;
          if (logo.ok && !logo.result.locked) {
            const palette = logo.result.proposal.semanticPalette;
            if (palette?.entries.length && palette.semanticChromaticCount > 0) {
              latestGenome = applySemanticPaletteToGenome(latestGenome, palette, {
                sourceId: "logo-intake",
              });
              enqueue({ type: "genome_update", genome: latestGenome });
              enqueue({
                type: "section_resolved",
                section: "palette",
                preview: {
                  kind: "palette",
                  swatches: palette.entries.map((e) => e.hex),
                },
                micro: `Paleta visual · ${palette.entries.length} colores de marca`,
              });
            }
            enqueue({ type: "logo_intake_done", result: logo.result });
          } else if (logo.ok) {
            enqueue({ type: "logo_intake_done", result: logo.result });
          } else {
            enqueue({ type: "logo_intake_error", message: logo.message });
          }
        } else if (logoPrepError) {
          enqueue({ type: "logo_intake_error", message: logoPrepError });
        }

        enqueue({ type: "genome_update", genome: latestGenome });
        enqueue({ type: "ingest_done", totalMs: Date.now() - ingestStarted });
        enqueue({ type: "done" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error de ingesta";
        enqueue({ type: "source_error", fileName: "ingesta", message });
        enqueue({ type: "ingest_done", totalMs: Date.now() - ingestStarted });
        enqueue({ type: "done" });
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
