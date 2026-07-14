import { randomUUID } from "node:crypto";
import type { Candidate, GalleryValue, LogoValue, Provenance, SlotState, VisualWorldValue } from "../brand-kit-types";
import { labelLogoCandidatesWithVision } from "../llm/brand-kit-llm-synthesis";
import type { BrandKitDocumentProbeContext } from "../llm/brand-kit-llm-synthesis";
import { buildCopyUnitsFromPlainCorpus, formatCopyUnitsForLlm } from "../crawl/copy-units";
import { batchLlmProvenance, buildBatchSlotPatch, synthesizeBrandKitBatch } from "../llm/brand-kit-llm-batch";
import { canResolveEssence } from "../brand-kit-essence-headline";
import { selectEvidenceCandidates } from "../brand-kit-evidence-candidates";
import type { EssenceValue } from "../brand-kit-types";
import { buildLogoSlotPatch } from "../brand-kit-logo-policy";
import { buildGalleryContextForLlm, galleryRefIds } from "../brand-kit-gallery-filter";
import { mergeBatchBriefsIntoGallery } from "../brand-kit-gallery-brief";
import { galleryBriefSourcePartsFromSynthesis } from "../brand-kit-gallery-brief-adn";
import { buildVisualWorldFromGallery } from "../brand-kit-visual-synthesis";
import { buildPaletteValue, buildTypographyValue, rankLogoCandidates } from "../crawl/scoring";
import type { BrandKitStreamEvent } from "../crawl/types";
import type { BrandKitCrawlOptions } from "../crawl/crawl-options";
import { triageBrandKitFilename, type BrandKitIngestTriageItem } from "./triage";
import { bufferContentSha256 } from "./paid-operations-server";
import {
  releaseBrandKitIngestAnalysisCharge,
  releaseUnusedBrandKitIngestAnalysisCharge,
  reserveBrandKitIngestAnalysisCharge,
  settleBrandKitIngestAnalysisCharge,
} from "./brand-kit-ingest-wallet";
import {
  extractBrandBoardVisualsFromImage,
  isLikelyBrandBoardImage,
  measureBrandBoardSignals,
} from "../brand-kit-brand-board-image";
import { extractBrandMaterialViaDocumentProbe } from "../studio/document-probe-ingest";

const NOW = () => new Date().toISOString();
const MAX_FILES = 12;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

export type BrandKitIngestFile = {
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

function canEmitIngestEssence(value: EssenceValue): boolean {
  if (canResolveEssence(value)) return true;
  const summary = value.summary?.trim() ?? "";
  const beliefCount = value.beliefs?.filter((belief) => belief.label.trim()).length ?? 0;
  return summary.length >= 24 && beliefCount >= 1;
}

function mergeRankedLogoCandidates(candidates: Candidate<LogoValue>[]): Candidate<LogoValue>[] {
  const vision = candidates
    .filter((candidate) => candidate.value.detectionMethod === "vision_bbox")
    .sort((a, b) => b.score - a.score);
  const uploads = rankUploadedLogoCandidates(candidates);
  return [...vision, ...uploads].sort((a, b) => b.score - a.score);
}

export async function* runBrandKitIngest(
  files: BrandKitIngestFile[],
  jobId: string = randomUUID(),
  options?: BrandKitCrawlOptions,
): AsyncGenerator<BrandKitStreamEvent> {
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

  const triageItems: BrandKitIngestTriageItem[] = files.map((file) =>
    triageBrandKitFilename(file.name, file.mime || "application/octet-stream"),
  );
  yield { type: "triage_plan", items: triageItems };

  const logoCandidates: Candidate<LogoValue>[] = [];
  const galleryItems: GalleryValue["harvested"] = [];
  const paletteSignals: { hex: string; provenance: Provenance; weight?: number }[] = [];
  const typographyFamilies: string[] = [];
  let corpusParts: string[] = [];
  let brandName: string | undefined;
  let probeContextForBatch: BrandKitDocumentProbeContext | undefined;
  let totalProbeLlmCalls = 0;

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
    if (file.buffer.length > MAX_FILE_BYTES) {
      yield {
        type: "source_error",
        fileName: file.name,
        message: "Archivo demasiado grande (máx. 25 MB)",
      };
      continue;
    }
    if (triage.kind === "unknown") {
      yield {
        type: "source_error",
        fileName: file.name,
        message: "Tipo de archivo no reconocido",
      };
      continue;
    }

    yield {
      type: "progress",
      phase: "visual",
      step: 2,
      totalSteps: 5,
      message: `Procesando ${file.name}…`,
    };

    if (triage.kind === "logo_image" || triage.kind === "gallery_image" || triage.kind === "brand_board_image") {
      const boardSignals = await measureBrandBoardSignals(file.buffer);
      const treatAsBrandBoard =
        triage.kind === "brand_board_image" ||
        (triage.kind === "gallery_image" && isLikelyBrandBoardImage(file.name, boardSignals));

      if (treatAsBrandBoard) {
        const boardSha = bufferContentSha256(file.buffer);
        const boardVisionOn = options?.pdfLogoVisionEnabled === true && Boolean(options?.userEmail);
        yield {
          type: "llm_progress",
          step: "brand_board_vision",
          status: "running",
          detail: boardVisionOn
            ? "Analizando brand board (logo, paleta, tipografía)…"
            : "Extrayendo paleta del brand board…",
        };
        let boardCharge: Awaited<ReturnType<typeof reserveBrandKitIngestAnalysisCharge>> = null;
        let boardFocusCharge: Awaited<ReturnType<typeof reserveBrandKitIngestAnalysisCharge>> = null;
        try {
          if (boardVisionOn) {
            boardCharge = await reserveBrandKitIngestAnalysisCharge({
              userEmail: options?.userEmail,
              contentSignature: boardSha,
              kind: "brand_board",
            });
            boardFocusCharge = await reserveBrandKitIngestAnalysisCharge({
              userEmail: options?.userEmail,
              contentSignature: `${boardSha}:logo-focus`,
              kind: "brand_board_logo_focus",
            });
          }
          const board = await extractBrandBoardVisualsFromImage({
            buffer: file.buffer,
            fileName: file.name,
            mime: file.mime,
            userEmail: options?.userEmail ?? "",
            route: "/api/spaces/brandKit/ingest",
            visionEnabled: boardVisionOn,
            allowLogoFocusVision: boardVisionOn,
          });
          if (boardVisionOn) {
            await settleBrandKitIngestAnalysisCharge(boardCharge, "brand_board");
            boardCharge = null;
            if (board.logoFocusVisionUsed) {
              await settleBrandKitIngestAnalysisCharge(boardFocusCharge, "brand_board_logo_focus");
            } else {
              await releaseUnusedBrandKitIngestAnalysisCharge(boardFocusCharge, "logo_focus_not_needed");
            }
            boardFocusCharge = null;
          }
          if (board.logoCandidates.length) logoCandidates.push(...board.logoCandidates);
          paletteSignals.push(...board.paletteSignals);
          typographyFamilies.push(...board.typographyFamilies);
          if (board.brandName && !brandName) brandName = board.brandName;
          galleryItems.push({
            assetId: board.uploadedUrl,
            previewUrl: board.uploadedUrl,
            included: true,
            provenance: fileProvenance(board.uploadedFileId, "brand board"),
          });
          if (board.logoCandidates.length) {
            const earlyLogos = mergeRankedLogoCandidates(logoCandidates);
            yield {
              type: "slot_update",
              slotId: "logo",
              patch: slotPatch(buildLogoSlotPatch(earlyLogos)),
            };
          }
          yield {
            type: "llm_progress",
            step: "brand_board_vision",
            status: "done",
            detail: board.visionDetail ?? "Brand board procesado",
          };
        } catch (error) {
          await releaseBrandKitIngestAnalysisCharge(boardCharge, error);
          await releaseBrandKitIngestAnalysisCharge(boardFocusCharge, error);
          console.error("[brandKit/ingest/brand_board_vision]", error);
          yield {
            type: "llm_progress",
            step: "brand_board_vision",
            status: "failed",
            detail: "No pude analizar el brand board",
          };
        }
        continue;
      }

      if (!options?.userEmail?.trim()) {
        yield {
          type: "source_error",
          fileName: file.name,
          message: "Sesión requerida para analizar el archivo",
        };
        continue;
      }

      yield {
        type: "llm_progress",
        step: "document_probe",
        status: "running",
        detail: "Analizando logo, paleta e imágenes…",
      };
      try {
        const artifacts = await extractBrandMaterialViaDocumentProbe({
          buffer: file.buffer,
          fileName: file.name,
          mime: file.mime || "application/octet-stream",
          userEmail: options.userEmail,
          route: "/api/spaces/brandKit/ingest",
          onLlmCostUsd: options?.onLlmCostUsd,
        });
        if (artifacts.logoCandidates.length) logoCandidates.push(...artifacts.logoCandidates);
        paletteSignals.push(...artifacts.paletteSignals);
        typographyFamilies.push(...artifacts.typographyFamilies);
        galleryItems.push(...artifacts.galleryItems);
        corpusParts.push(...artifacts.corpusParts);
        if (artifacts.brandNameHint && !brandName) brandName = artifacts.brandNameHint;
        probeContextForBatch = artifacts.probeContext;
        totalProbeLlmCalls += artifacts.probe.llmCallCount;

        yield {
          type: "llm_progress",
          step: "document_probe",
          status: "done",
          detail: `${artifacts.probe.llmCallCount} LLM · ${artifacts.logoCandidates.length} logo(s) · ${artifacts.galleryItems.length} imagen(es)`,
        };
        yield { type: "source_added", kind: "file", ref: file.name };
      } catch (error) {
        console.error("[brandKit/ingest/document_probe]", error);
        yield {
          type: "source_error",
          fileName: file.name,
          message:
            error instanceof Error
              ? error.message
              : "No pude analizar el archivo con document probe",
        };
      }
      continue;
    }

    if (triage.kind === "brand_document") {
      if (!options?.userEmail?.trim()) {
        yield {
          type: "source_error",
          fileName: file.name,
          message: "Sesión requerida para analizar el documento",
        };
        continue;
      }

      yield {
        type: "llm_progress",
        step: "document_probe",
        status: "running",
        detail: "Analizando documento (logo, paleta, tipografía, imágenes)…",
      };

      let sourceMeta:
        | { contentSha256: string; pdfStorageKey: string; pageCount: number }
        | undefined;

      try {
        const artifacts = await extractBrandMaterialViaDocumentProbe({
          buffer: file.buffer,
          fileName: file.name,
          mime: file.mime || "application/octet-stream",
          userEmail: options.userEmail,
          route: "/api/spaces/brandKit/ingest",
          onLlmCostUsd: options?.onLlmCostUsd,
        });

        if (artifacts.logoCandidates.length) logoCandidates.push(...artifacts.logoCandidates);
        paletteSignals.push(...artifacts.paletteSignals);
        typographyFamilies.push(...artifacts.typographyFamilies);
        galleryItems.push(...artifacts.galleryItems);
        corpusParts.push(...artifacts.corpusParts);
        if (artifacts.brandNameHint && !brandName) brandName = artifacts.brandNameHint;
        probeContextForBatch = artifacts.probeContext;
        totalProbeLlmCalls += artifacts.probe.llmCallCount;
        sourceMeta = artifacts.sourceMeta;

        yield {
          type: "llm_progress",
          step: "document_probe",
          status: "done",
          detail: `${artifacts.probe.llmCallCount} LLM · ${artifacts.probe.pdfTotalPages ?? 1} pág.`,
        };
      } catch (error) {
        console.error("[brandKit/ingest/document_probe]", error);
        yield {
          type: "source_error",
          fileName: file.name,
          message:
            error instanceof Error
              ? error.message
              : "No pude analizar el documento",
        };
        continue;
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
      route: "/api/spaces/brandKit/ingest",
      onLlmCostUsd: options?.onLlmCostUsd,
    });
    rankedLogos = mergeRankedLogoCandidates([
      ...rankedLogos.filter((candidate) => candidate.value.detectionMethod === "vision_bbox"),
      ...labeled,
    ]);
    yield { type: "llm_progress", step: "logo_vision", status: "done", detail: `${rankedLogos.length} candidatos` };
  }

  const emitLogoSlot = () =>
    ({
      type: "slot_update",
      slotId: "logo",
      patch: slotPatch(buildLogoSlotPatch(rankedLogos)),
    }) satisfies BrandKitStreamEvent;

  yield emitLogoSlot();

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

  let galleryValue: GalleryValue = {
    harvested: galleryItems,
    generated: [],
    stylePromptVersion: 0,
  };

  if (galleryItems.length) {
    yield {
      type: "slot_update",
      slotId: "gallery",
      patch: slotPatch({
        status: "resolved",
        value: galleryValue,
        confidence: 0.72,
        provenance: galleryItems[0]?.provenance,
      }),
    };
  }

  const corpusBase = corpusParts.join("\n\n").trim();
  const probeLines = probeContextForBatch?.textSummary.filter((line) => line.trim()) ?? [];
  const corpus = [corpusBase, ...probeLines].filter(Boolean).join("\n\n").trim();
  const llmEnabled = options?.llmEnabled === true;
  const ingestProv = batchLlmProvenance(files[0]?.name);
  const copyUnits = buildCopyUnitsFromPlainCorpus(
    corpusBase || corpus,
    files[0]?.name ?? "document",
    probeLines,
  );
  const evidenceCandidates = selectEvidenceCandidates(copyUnits, 20, 2);
  const synthesisInput = {
    corpus,
    structuredCorpus: copyUnits.length ? formatCopyUnitsForLlm(copyUnits) : undefined,
    evidenceCandidates: evidenceCandidates.length ? evidenceCandidates : undefined,
    brandName,
    galleryContext: buildGalleryContextForLlm(galleryValue) || undefined,
    probeContext: probeContextForBatch,
    userEmail: options?.userEmail,
    route: "/api/spaces/brandKit/ingest",
    onLlmCostUsd: options?.onLlmCostUsd,
  };
  const corpusReadyForLlm =
    corpus.length >= 50 || (corpus.length >= 24 && Boolean(probeContextForBatch));

  if (llmEnabled && corpusReadyForLlm) {
    yield { type: "progress", phase: "llm", step: 4, totalSteps: 5, message: "Síntesis IA…" };
    yield { type: "llm_status", status: "running" };

    yield {
      type: "llm_progress",
      step: "batch",
      status: "running",
      substep: "essence",
      detail: "Esencia, voz y mundo visual…",
    };
    const batch = await synthesizeBrandKitBatch(synthesisInput, {
      allowSlotRetries: false,
      gallery: galleryValue,
    });

    const essenceValue = batch.essence
      ? {
          ...batch.essence,
          headline: batch.essence.headline,
          headlineOrigin: batch.essence.headline ? ("generated" as const) : undefined,
        }
      : null;

    yield {
      type: "llm_progress",
      step: "batch",
      substep: "essence",
      status: essenceValue && canEmitIngestEssence(essenceValue) ? "done" : "failed",
      detail:
        essenceValue && canEmitIngestEssence(essenceValue)
          ? `${essenceValue.beliefs.length} creencias`
          : "Degradado",
    };

    yield {
      type: "llm_progress",
      step: "batch",
      substep: "voice",
      status: batch.voice ? "done" : "failed",
      detail: batch.voice ? `${batch.voice.descriptors.length} descriptores` : "Degradado",
    };

    yield {
      type: "llm_progress",
      step: "batch",
      substep: "visualWorld",
      status: batch.visualWorld ? "done" : "failed",
      detail: batch.visualWorld ? `${batch.visualWorld.limits.length} límites` : "Degradado",
    };

    const llmOk = Boolean(
      (essenceValue && canEmitIngestEssence(essenceValue)) || batch.voice || batch.visualWorld,
    );
    yield {
      type: "llm_status",
      status: llmOk ? "done" : "skipped",
      reason: llmOk ? undefined : "IA sin resultados válidos",
    };

    if (essenceValue && canEmitIngestEssence(essenceValue)) {
      yield {
        type: "slot_update",
        slotId: "essence",
        patch: slotPatch(
          buildBatchSlotPatch({
            value: essenceValue,
            provenance: ingestProv,
            confidence: 0.68,
          }),
        ),
      };
    } else {
      yield {
        type: "slot_update",
        slotId: "essence",
        patch: slotPatch({ status: "needs_user", confidence: 0 }),
      };
    }

    if (batch.voice) {
      yield {
        type: "slot_update",
        slotId: "voice",
        patch: slotPatch(
          buildBatchSlotPatch({
            value: batch.voice,
            provenance: ingestProv,
            confidence: batch.voice.evidence.length >= 1 ? 0.72 : 0.68,
          }),
        ),
      };
    } else {
      yield {
        type: "slot_update",
        slotId: "voice",
        patch: slotPatch({ status: "needs_user", confidence: 0 }),
      };
    }

    if (batch.visualWorld) {
      const visualValue: VisualWorldValue = {
        ...batch.visualWorld,
        galleryRefs: galleryRefIds(galleryValue),
      };
      yield {
        type: "slot_update",
        slotId: "visualWorld",
        patch: slotPatch(
          buildBatchSlotPatch({
            value: visualValue,
            provenance: ingestProv,
            confidence: 0.66,
          }),
        ),
      };
    } else {
      const fallbackVisual = buildVisualWorldFromGallery(galleryValue, brandName);
      if (fallbackVisual) {
        yield {
          type: "slot_update",
          slotId: "visualWorld",
          patch: slotPatch({
            status: "resolved",
            value: fallbackVisual,
            provenance: {
              type: "llm_synthesis",
              detail: `síntesis visual desde galería (sin batch)`,
            },
            confidence: 0.62,
          }),
        };
      } else {
        yield {
          type: "slot_update",
          slotId: "visualWorld",
          patch: slotPatch({ status: "needs_user", confidence: 0 }),
        };
      }
    }

    if (batch.categoryBriefs?.length) {
      galleryValue = mergeBatchBriefsIntoGallery(
        galleryValue,
        batch.categoryBriefs,
        galleryBriefSourcePartsFromSynthesis({
          brandName,
          essence: batch.essence,
          voice: batch.voice,
          visualWorld: batch.visualWorld,
        }),
      );
    }

    if (galleryValue.harvested.length > 0) {
      yield {
        type: "slot_update",
        slotId: "gallery",
        patch: slotPatch({
          status: "resolved",
          value: galleryValue,
          confidence: galleryValue.categoryBriefs?.length ? 0.76 : 0.72,
          provenance: galleryItems[0]?.provenance ?? ingestProv,
        }),
      };
    }

    yield {
      type: "llm_progress",
      step: "batch",
      status: "done",
      detail: `${totalProbeLlmCalls + 1} LLM total · probe ${totalProbeLlmCalls} + batch 1`,
    };
  } else if (!llmEnabled) {
    yield { type: "llm_status", status: "skipped", reason: options?.llmSkipReason ?? "IA desactivada" };
  }

  yield { type: "phase_complete", phase: "finalize" };
  yield { type: "done", jobId };
}
