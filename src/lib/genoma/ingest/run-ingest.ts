import { randomUUID } from "node:crypto";
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
import { buildLogoSlotPatch } from "../genoma-logo-policy";
import { buildPaletteValue, buildTypographyValue, rankLogoCandidates } from "../crawl/scoring";
import type { GenomaStreamEvent } from "../crawl/types";
import type { GenomaCrawlOptions } from "../crawl/crawl-options";
import { triageGenomaFilename, type GenomaIngestTriageItem } from "./triage";
import { bufferContentSha256 } from "./paid-operations-server";
import {
  releaseGenomaIngestAnalysisCharge,
  releaseUnusedGenomaIngestAnalysisCharge,
  reserveGenomaIngestAnalysisCharge,
  settleGenomaIngestAnalysisCharge,
} from "./genoma-ingest-wallet";
import { applyLogoCropVerificationToCandidates } from "./genoma-logo-crop-verify";
import {
  extractBrandBoardVisualsFromImage,
  isLikelyBrandBoardImage,
  measureBrandBoardSignals,
} from "../genoma-brand-board-image";
import { extractBrandMaterialViaDocumentProbe } from "../studio/document-probe-ingest";
import type { VisualWorldValue } from "../genoma-types";

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
  jobId: string = randomUUID(),
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
  let visualWorldFromProbe: VisualWorldValue | null = null;

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
        let boardCharge: Awaited<ReturnType<typeof reserveGenomaIngestAnalysisCharge>> = null;
        let boardFocusCharge: Awaited<ReturnType<typeof reserveGenomaIngestAnalysisCharge>> = null;
        try {
          if (boardVisionOn) {
            boardCharge = await reserveGenomaIngestAnalysisCharge({
              userEmail: options?.userEmail,
              contentSignature: boardSha,
              kind: "brand_board",
            });
            boardFocusCharge = await reserveGenomaIngestAnalysisCharge({
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
            route: "/api/spaces/genoma/ingest",
            visionEnabled: boardVisionOn,
            allowLogoFocusVision: boardVisionOn,
          });
          if (boardVisionOn) {
            await settleGenomaIngestAnalysisCharge(boardCharge, "brand_board");
            boardCharge = null;
            if (board.logoFocusVisionUsed) {
              await settleGenomaIngestAnalysisCharge(boardFocusCharge, "brand_board_logo_focus");
            } else {
              await releaseUnusedGenomaIngestAnalysisCharge(boardFocusCharge, "logo_focus_not_needed");
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
          await releaseGenomaIngestAnalysisCharge(boardCharge, error);
          await releaseGenomaIngestAnalysisCharge(boardFocusCharge, error);
          console.error("[genoma/ingest/brand_board_vision]", error);
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
          route: "/api/spaces/genoma/ingest",
          llmEnabled: options?.llmEnabled === true,
          onLlmCostUsd: options?.onLlmCostUsd,
        });
        if (artifacts.logoCandidates.length) logoCandidates.push(...artifacts.logoCandidates);
        paletteSignals.push(...artifacts.paletteSignals);
        typographyFamilies.push(...artifacts.typographyFamilies);
        galleryItems.push(...artifacts.galleryItems);
        corpusParts.push(...artifacts.corpusParts);
        if (artifacts.brandNameHint && !brandName) brandName = artifacts.brandNameHint;
        if (artifacts.visualWorld) visualWorldFromProbe = artifacts.visualWorld;

        yield {
          type: "llm_progress",
          step: "document_probe",
          status: "done",
          detail: `${artifacts.probe.llmCallCount} LLM · ${artifacts.logoCandidates.length} logo(s) · ${artifacts.galleryItems.length} imagen(es)`,
        };
        yield { type: "source_added", kind: "file", ref: file.name };
      } catch (error) {
        console.error("[genoma/ingest/document_probe]", error);
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
          route: "/api/spaces/genoma/ingest",
          llmEnabled: options?.llmEnabled === true,
          onLlmCostUsd: options?.onLlmCostUsd,
        });

        if (artifacts.logoCandidates.length) logoCandidates.push(...artifacts.logoCandidates);
        paletteSignals.push(...artifacts.paletteSignals);
        typographyFamilies.push(...artifacts.typographyFamilies);
        galleryItems.push(...artifacts.galleryItems);
        corpusParts.push(...artifacts.corpusParts);
        if (artifacts.brandNameHint && !brandName) brandName = artifacts.brandNameHint;
        if (artifacts.visualWorld) visualWorldFromProbe = artifacts.visualWorld;
        sourceMeta = artifacts.sourceMeta;

        yield {
          type: "llm_progress",
          step: "document_probe",
          status: "done",
          detail: `${artifacts.probe.llmCallCount} LLM · ${artifacts.probe.pdfTotalPages ?? 1} pág.`,
        };
      } catch (error) {
        console.error("[genoma/ingest/document_probe]", error);
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
      route: "/api/spaces/genoma/ingest",
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
    }) satisfies GenomaStreamEvent;

  yield emitLogoSlot();

  if (options?.allowLogoCropVerify && rankedLogos.length && options?.userEmail) {
    yield {
      type: "llm_progress",
      step: "logo_crop_verify",
      status: "running",
      detail: "Verificando recorte del logo…",
    };
    const verifySha = bufferContentSha256(
      Buffer.from(JSON.stringify(rankedLogos.map((row) => row.value.previewUrl ?? row.value.assetId))),
    );
    let verifyCharge: Awaited<ReturnType<typeof reserveGenomaIngestAnalysisCharge>> = null;
    try {
      verifyCharge = await reserveGenomaIngestAnalysisCharge({
        userEmail: options.userEmail,
        contentSignature: `${verifySha}:logo-crop-verify`,
        kind: "logo_crop_verify",
      });
      const verified = await applyLogoCropVerificationToCandidates(rankedLogos, {
        userEmail: options.userEmail,
        route: "/api/spaces/genoma/ingest",
        contentSignature: verifySha,
      });
      rankedLogos = verified.candidates;
      if (verified.verifyUsed) {
        await settleGenomaIngestAnalysisCharge(verifyCharge, "logo_crop_verify");
      } else {
        await releaseUnusedGenomaIngestAnalysisCharge(verifyCharge, "logo_crop_verify_not_needed");
      }
      verifyCharge = null;
      yield {
        type: "llm_progress",
        step: "logo_crop_verify",
        status: "done",
        detail: verified.verifyUsed ? "Recorte verificado" : "Verificación omitida",
      };
      yield emitLogoSlot();
    } catch (error) {
      await releaseGenomaIngestAnalysisCharge(verifyCharge, error);
      yield {
        type: "llm_progress",
        step: "logo_crop_verify",
        status: "failed",
        detail: "No pude verificar el recorte",
      };
    }
  }

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

  if (visualWorldFromProbe) {
    yield {
      type: "slot_update",
      slotId: "visualWorld",
      patch: slotPatch({
        status: "resolved",
        value: visualWorldFromProbe,
        provenance: { type: "llm_synthesis", detail: "document probe" },
        confidence: 0.66,
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
