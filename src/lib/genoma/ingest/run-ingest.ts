import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { parseBrainDocument } from "@/lib/brain-parser-utils";
import { extractVisualImagesFromPdfBuffer } from "@/lib/brain/pdf-visual-extract";
import type { Candidate, GalleryValue, LogoValue, Provenance, SlotState } from "../genoma-types";
import {
  validateValuesAgainstCorpus,
} from "../llm/genoma-llm-validate";
import {
  labelLogoCandidatesWithVision,
  synthesizeOnelinerOptions,
  synthesizeValues,
  synthesizeVoice,
  voiceValueFromLlm,
} from "../llm/genoma-llm-synthesis";
import {
  buildEssenceHeadlineAlternatives,
  buildResolvedEssenceFromIngest,
} from "../genoma-essence-headline";
import { buildLogoSlotPatch, isExplicitPdfLogoAsset } from "../genoma-logo-policy";
import { isLikelyDeckPdf } from "../genoma-pdf-deck";
import { extractLogoCandidatesFromDeckPdf } from "../genoma-pdf-logo-vision";
import {
  extractBrandManualVisualsFromPdf,
  isLikelyBrandManualPdf,
} from "../genoma-pdf-brand-manual";
import { buildPaletteValue, buildTypographyValue, rankLogoCandidates } from "../crawl/scoring";
import { hexColorsFromCss } from "../crawl/parsers";
import type { GenomaStreamEvent } from "../crawl/types";
import type { GenomaCrawlOptions } from "../crawl/crawl-options";
import { triageGenomaFilename, type GenomaIngestTriageItem } from "./triage";
import { uploadGenomaIngestFile } from "./upload-genoma-file";
import { bufferContentSha256 } from "./paid-operations-server";
import {
  releaseGenomaIngestAnalysisCharge,
  reserveGenomaIngestAnalysisCharge,
  settleGenomaIngestAnalysisCharge,
} from "./genoma-ingest-wallet";
import { inferImageFormat } from "../crawl/url-utils";

const NOW = () => new Date().toISOString();
const MAX_FILES = 12;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

export type GenomaIngestFile = {
  name: string;
  mime: string;
  buffer: Buffer;
};

function slotPatch(partial: Partial<SlotState<unknown>>): Partial<SlotState<unknown>> {
  return { updatedAt: NOW(), ...partial };
}

function fileProvenance(fileId: string, detail: string): Provenance {
  return { type: "file_upload", detail, fileId };
}

async function imageDimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
  try {
    const meta = await sharp(buffer).metadata();
    return { width: meta.width ?? 512, height: meta.height ?? 512 };
  } catch {
    return { width: 512, height: 512 };
  }
}

function logoCandidateFromUpload(
  url: string,
  fileId: string,
  format: LogoValue["format"],
  width: number,
  height: number,
  score: number,
): Candidate<LogoValue> {
  return {
    score,
    provenance: fileProvenance(fileId, "archivo subido"),
    value: {
      assetId: url,
      previewUrl: url,
      format,
      width,
      height,
      background: format === "svg" || format === "png" ? "transparent" : "solid",
      variants: [],
    },
  };
}

function rankUploadedLogoCandidates(candidates: Candidate<LogoValue>[]): Candidate<LogoValue>[] {
  const uploads = candidates.filter((candidate) => candidate.value.detectionMethod !== "vision_bbox");
  if (!uploads.length) return [];
  const ranked = rankLogoCandidates(
    uploads.map((candidate) => ({
      url: candidate.value.previewUrl ?? candidate.value.assetId,
      score: candidate.score,
      provenance: candidate.provenance,
      format: candidate.value.format,
      widthHint: candidate.value.width,
      heightHint: candidate.value.height,
    })),
  );
  return ranked.map((rankedCandidate, index) => {
    const original = uploads.find(
      (candidate) =>
        (candidate.value.previewUrl ?? candidate.value.assetId) ===
        (rankedCandidate.value.previewUrl ?? rankedCandidate.value.assetId),
    );
    return original ? { ...original, score: rankedCandidate.score } : rankedCandidate;
  });
}

function mergeRankedLogoCandidates(candidates: Candidate<LogoValue>[]): Candidate<LogoValue>[] {
  const vision = candidates
    .filter((candidate) => candidate.value.detectionMethod === "vision_bbox")
    .sort((a, b) => b.score - a.score);
  const uploads = rankUploadedLogoCandidates(candidates);
  return [...vision, ...uploads].sort((a, b) => b.score - a.score);
}

export async function* runGenomaIngest(
  files: GenomaIngestFile[],
  jobId = randomUUID(),
  options?: GenomaCrawlOptions,
): AsyncGenerator<GenomaStreamEvent> {
  if (!files.length) {
    yield { type: "error", message: "No hay archivos" };
    return;
  }
  if (files.length > MAX_FILES) {
    yield { type: "error", message: `Máximo ${MAX_FILES} archivos` };
    return;
  }

  yield {
    type: "progress",
    phase: "connect",
    step: 0,
    totalSteps: 5,
    message: "Clasificando archivos…",
  };

  const triageItems: GenomaIngestTriageItem[] = files.map((file) =>
    triageGenomaFilename(file.name, file.mime || "application/octet-stream"),
  );
  yield { type: "triage_plan", items: triageItems };

  const logoCandidates: Candidate<LogoValue>[] = [];
  const galleryItems: GalleryValue["harvested"] = [];
  const paletteSignals: { hex: string; provenance: Provenance; weight?: number }[] = [];
  const typographyFamilies: string[] = [];
  let corpusParts: string[] = [];
  let brandName: string | undefined;

  yield {
    type: "progress",
    phase: "visual",
    step: 1,
    totalSteps: 5,
    message: "Procesando archivos…",
  };

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const triage = triageItems[index];
    if (file.buffer.length > MAX_FILE_BYTES) continue;
    if (triage.kind === "unknown" || triage.kind === "presentation") continue;

    yield {
      type: "progress",
      phase: "visual",
      step: 2,
      totalSteps: 5,
      message: `Procesando ${file.name}…`,
    };

    if (triage.kind === "logo_image" || triage.kind === "gallery_image") {
      const uploaded = await uploadGenomaIngestFile({
        userEmail: options?.userEmail ?? "",
        filename: file.name,
        mime: file.mime,
        buffer: file.buffer,
      });
      yield { type: "source_added", kind: "file", ref: uploaded.fileId };

      const format = inferImageFormat(uploaded.url, file.mime);
      const dims = await imageDimensions(file.buffer);

      if (triage.kind === "logo_image") {
        logoCandidates.push(
          logoCandidateFromUpload(uploaded.url, uploaded.fileId, format, dims.width, dims.height, 0.88),
        );
      } else {
        galleryItems.push({
          assetId: uploaded.url,
          previewUrl: uploaded.url,
          included: true,
          provenance: fileProvenance(uploaded.fileId, file.name),
        });
      }
      continue;
    }

    if (triage.kind === "brand_document") {
      let sourceMeta:
        | { contentSha256: string; pdfStorageKey: string; pageCount: number }
        | undefined;

      if (file.mime === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        let trimmedText = "";
        try {
          const text = await parseBrainDocument(file.buffer, file.name, file.mime || "application/octet-stream");
          trimmedText = text.trim();
          if (trimmedText.length >= 40) corpusParts.push(trimmedText.slice(0, 12_000));
          if (!brandName) {
            const firstLine = trimmedText.split("\n").find((line) => line.trim().length > 2)?.trim();
            if (firstLine && firstLine.length <= 80) brandName = firstLine;
          }
          paletteSignals.push(...hexColorsFromCss(trimmedText, file.name).map((c) => ({ ...c, weight: 0.4 })));
        } catch {
          // scanned PDF or unsupported — gallery-only path
        }

        const likelyBrandManual = isLikelyBrandManualPdf(file.name, trimmedText);
        const likelyDeck = !likelyBrandManual && (await isLikelyDeckPdf(file.buffer, file.name, trimmedText));

        const pdfVisionOn = options?.pdfLogoVisionEnabled === true && Boolean(options?.userEmail);

        if (likelyBrandManual) {
          yield {
            type: "llm_progress",
            step: "pdf_brand_vision",
            status: "running",
            detail: pdfVisionOn ? "Analizando manual de marca…" : "Extrayendo paleta y tipografía del PDF…",
          };
          const manualSha = bufferContentSha256(file.buffer);
          let manualCharge: Awaited<ReturnType<typeof reserveGenomaIngestAnalysisCharge>> = null;
          try {
            if (pdfVisionOn) {
              manualCharge = await reserveGenomaIngestAnalysisCharge({
                userEmail: options.userEmail,
                contentSignature: manualSha,
                kind: "brand_manual",
              });
            }
            const manual = await extractBrandManualVisualsFromPdf({
              buffer: file.buffer,
              fileName: file.name,
              userEmail: options.userEmail ?? "",
              route: "/api/spaces/genoma/ingest",
              visionEnabled: pdfVisionOn,
            });
            if (pdfVisionOn) {
              await settleGenomaIngestAnalysisCharge(manualCharge, "brand_manual");
              manualCharge = null;
            }
            if (manual.logoCandidates.length) logoCandidates.push(...manual.logoCandidates);
            paletteSignals.push(...manual.paletteSignals);
            typographyFamilies.push(...manual.typographyFamilies);
            sourceMeta = {
              contentSha256: manual.contentSha256,
              pdfStorageKey: manual.pdfStorageKey,
              pageCount: manual.totalPages,
            };
            yield {
              type: "llm_progress",
              step: "pdf_brand_vision",
              status: "done",
              detail: manual.visionDetail ?? "Manual de marca procesado",
            };
          } catch (error) {
            await releaseGenomaIngestAnalysisCharge(manualCharge, error);
            console.error("[genoma/ingest/pdf_brand_vision]", error);
            yield {
              type: "llm_progress",
              step: "pdf_brand_vision",
              status: "failed",
              detail: "No pude analizar el manual de marca",
            };
          }
        }

        if (likelyDeck && !pdfVisionOn) {
          yield {
            type: "llm_progress",
            step: "pdf_logo_vision",
            status: "skipped",
            detail:
              options?.pdfLogoVisionSkipReason ??
              options?.llmSkipReason ??
              "IA desactivada — sin visión de logo en deck",
          };
        }

        const deckPdf = pdfVisionOn && likelyDeck;

        if (deckPdf) {
          yield {
            type: "llm_progress",
            step: "pdf_logo_vision",
            status: "running",
            detail: "Detectando logo en el deck…",
          };
          const deckSha = bufferContentSha256(file.buffer);
          let visionCharge: Awaited<ReturnType<typeof reserveGenomaIngestAnalysisCharge>> = null;
          try {
            visionCharge = await reserveGenomaIngestAnalysisCharge({
              userEmail: options.userEmail,
              contentSignature: deckSha,
              kind: "deck_logo",
            });
            const vision = await extractLogoCandidatesFromDeckPdf({
              buffer: file.buffer,
              fileName: file.name,
              userEmail: options.userEmail ?? "",
              route: "/api/spaces/genoma/ingest",
            });
            await settleGenomaIngestAnalysisCharge(visionCharge, "deck_logo");
            visionCharge = null;
            if (vision?.candidates.length) {
              logoCandidates.push(...vision.candidates);
            }
            if (vision) {
              sourceMeta = {
                contentSha256: vision.contentSha256,
                pdfStorageKey: vision.pdfStorageKey,
                pageCount: vision.totalPages,
              };
            }
            yield {
              type: "llm_progress",
              step: "pdf_logo_vision",
              status: "done",
              detail:
                vision?.candidates.length
                  ? (vision.visionDetail ??
                    `${vision.candidates.length} candidatos · ${vision.pagesWithLogo} pág.`)
                  : (vision?.visionDetail ?? "Sin logo claro en el deck"),
            };
          } catch (error) {
            await releaseGenomaIngestAnalysisCharge(visionCharge, error);
            console.error("[genoma/ingest/pdf_logo_vision]", error);
            yield {
              type: "llm_progress",
              step: "pdf_logo_vision",
              status: "failed",
              detail: "No pude analizar el logo del deck",
            };
          }
        }

        const pdfImages = await extractVisualImagesFromPdfBuffer(file.buffer, file.name).catch(() => []);
        for (const img of pdfImages) {
          const uploaded = await uploadGenomaIngestFile({
            userEmail: options?.userEmail ?? "",
            filename: img.name,
            mime: img.mime,
            buffer: img.buffer,
          });
          galleryItems.push({
            assetId: uploaded.url,
            previewUrl: uploaded.url,
            included: true,
            provenance: { type: "pdf_xobject", detail: img.name, fileId: uploaded.fileId },
          });
          if (isExplicitPdfLogoAsset(img.name)) {
            logoCandidates.push(
              logoCandidateFromUpload(
                uploaded.url,
                uploaded.fileId,
                inferImageFormat(uploaded.url, img.mime),
                img.width ?? 256,
                img.height ?? 256,
                0.82,
              ),
            );
          }
        }
      } else {
        try {
          const text = await parseBrainDocument(file.buffer, file.name, file.mime || "application/octet-stream");
          const trimmed = text.trim();
          if (trimmed.length >= 40) corpusParts.push(trimmed.slice(0, 12_000));
          if (!brandName) {
            const firstLine = trimmed.split("\n").find((line) => line.trim().length > 2)?.trim();
            if (firstLine && firstLine.length <= 80) brandName = firstLine;
          }
          paletteSignals.push(...hexColorsFromCss(trimmed, file.name).map((c) => ({ ...c, weight: 0.4 })));
        } catch {
          // unsupported document
        }
      }

      yield {
        type: "source_added",
        kind: "file",
        ref: file.name,
        contentSha256: sourceMeta?.contentSha256,
        pdfStorageKey: sourceMeta?.pdfStorageKey,
        pageCount: sourceMeta?.pageCount,
      };
    }
  }

  if (brandName) {
    yield {
      type: "brand_name",
      value: brandName,
      provenance: fileProvenance(files[0]?.name ?? "file", "documento"),
    };
  }

  yield { type: "progress", phase: "visual", step: 3, totalSteps: 5, message: "Logo y paleta…" };

  let rankedLogos = mergeRankedLogoCandidates(logoCandidates);

  const labelTargets = rankedLogos.filter((candidate) => candidate.value.detectionMethod !== "vision_bbox");
  if (labelTargets.length && options?.llmEnabled) {
    yield { type: "llm_progress", step: "logo_vision", status: "running", detail: "Etiquetando logos…" };
    const labeled = await labelLogoCandidatesWithVision(labelTargets, {
      userEmail: options?.userEmail,
      route: "/api/spaces/genoma/ingest",
      onLlmCostUsd: options?.onLlmCostUsd,
    });
    rankedLogos = mergeRankedLogoCandidates([
      ...rankedLogos.filter((candidate) => candidate.value.detectionMethod === "vision_bbox"),
      ...labeled,
    ]);
    yield { type: "llm_progress", step: "logo_vision", status: "done", detail: `${rankedLogos.length} candidatos` };
  }

  yield {
    type: "slot_update",
    slotId: "logo",
    patch: slotPatch(buildLogoSlotPatch(rankedLogos)),
  };

  const paletteBuilt = buildPaletteValue(paletteSignals);
  if (paletteBuilt) {
    yield {
      type: "slot_update",
      slotId: "palette",
      patch: slotPatch({
        status: "resolved",
        value: paletteBuilt.value,
        provenance: paletteBuilt.provenance,
        confidence: 0.7,
      }),
    };
  }

  const typographyBuilt = buildTypographyValue(typographyFamilies);
  if (typographyBuilt) {
    yield {
      type: "slot_update",
      slotId: "typography",
      patch: slotPatch({
        status: "resolved",
        value: typographyBuilt.value,
        provenance: typographyBuilt.provenance,
        confidence: 0.68,
      }),
    };
  }

  if (galleryItems.length) {
    yield {
      type: "slot_update",
      slotId: "gallery",
      patch: slotPatch({
        status: "resolved",
        value: { harvested: galleryItems, generated: [], stylePromptVersion: 0 } satisfies GalleryValue,
        confidence: 0.72,
        provenance: galleryItems[0]?.provenance,
      }),
    };
  }

  const corpus = corpusParts.join("\n\n").trim();
  const llmEnabled = options?.llmEnabled === true;
  const synthesisInput = {
    corpus,
    brandName,
    userEmail: options?.userEmail,
    route: "/api/spaces/genoma/ingest",
    onLlmCostUsd: options?.onLlmCostUsd,
  };

  if (llmEnabled && corpus.length >= 50) {
    yield { type: "progress", phase: "llm", step: 4, totalSteps: 5, message: "Síntesis IA…" };
    yield { type: "llm_status", status: "running" };

    yield { type: "llm_progress", step: "voice", status: "running" };
    const voiceRaw = await synthesizeVoice(synthesisInput);
    yield { type: "llm_progress", step: "voice", status: voiceRaw ? "done" : "failed" };

    yield { type: "llm_progress", step: "values", status: "running" };
    const valuesRaw = await synthesizeValues(synthesisInput);
    yield { type: "llm_progress", step: "values", status: valuesRaw ? "done" : "failed" };

    yield { type: "llm_progress", step: "oneliner", status: "running" };
    const onelinerLlm = await synthesizeOnelinerOptions(synthesisInput);
    yield { type: "llm_progress", step: "oneliner", status: onelinerLlm ? "done" : "failed" };

    yield { type: "llm_status", status: voiceRaw || valuesRaw || onelinerLlm ? "done" : "skipped" };

    if (voiceRaw) {
      yield {
        type: "slot_update",
        slotId: "voice",
        patch: slotPatch({
          status: "resolved",
          value: voiceValueFromLlm(voiceRaw),
          provenance: { type: "llm_synthesis", detail: "documentos subidos" },
          confidence: 0.65,
        }),
      };
    }

    const valuesValue = valuesRaw ? validateValuesAgainstCorpus(corpus, valuesRaw) : null;
    const beliefs =
      valuesValue?.values.map((item) => ({ label: item.label, evidence: item.evidence })) ?? [];
    const essenceValue = buildResolvedEssenceFromIngest({ beliefs, onelinerLlm, brandName });

    if (essenceValue) {
      const essenceProvenance = { type: "llm_synthesis" as const, detail: "documentos subidos" };
      const headlineAlternatives =
        onelinerLlm && onelinerLlm.options.length > 1
          ? buildEssenceHeadlineAlternatives(essenceValue, onelinerLlm, essenceProvenance)
          : [];

      yield {
        type: "slot_update",
        slotId: "essence",
        patch: slotPatch({
          status: "resolved",
          value: essenceValue,
          provenance: essenceProvenance,
          confidence: 0.68,
          candidates: headlineAlternatives,
        }),
      };
    }
  } else if (!llmEnabled) {
    yield { type: "llm_status", status: "skipped", reason: options?.llmSkipReason ?? "IA desactivada" };
  }

  yield { type: "phase_complete", phase: "finalize" };
  yield { type: "done", jobId };
}
