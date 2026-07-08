import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { parseBrainDocument } from "@/lib/brain-parser-utils";
import { extractVisualImagesFromPdfBuffer } from "@/lib/brain/pdf-visual-extract";
import type { Candidate, GalleryValue, LogoValue, Provenance, SlotState } from "../genoma-types";
import {
  essenceCandidatesFromOnelinerLlm,
  validateValuesAgainstCorpus,
} from "../llm/genoma-llm-validate";
import {
  labelLogoCandidatesWithVision,
  synthesizeOnelinerOptions,
  synthesizeValues,
  synthesizeVoice,
  voiceValueFromLlm,
} from "../llm/genoma-llm-synthesis";
import { buildPaletteValue, rankLogoCandidates, shouldAutoResolveLogo } from "../crawl/scoring";
import { hexColorsFromCss } from "../crawl/parsers";
import type { GenomaStreamEvent } from "../crawl/types";
import type { GenomaCrawlOptions } from "../crawl/crawl-options";
import { triageGenomaFilename, type GenomaIngestTriageItem } from "./triage";
import { uploadGenomaIngestFile } from "./upload-genoma-file";
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
      yield { type: "source_added", kind: "file", ref: file.name };

      if (file.mime === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
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
          if (img.width && img.height && img.width >= 120 && img.height >= 120 && img.width <= 800) {
            logoCandidates.push(
              logoCandidateFromUpload(
                uploaded.url,
                uploaded.fileId,
                inferImageFormat(uploaded.url, img.mime),
                img.width,
                img.height,
                0.55,
              ),
            );
          }
        }
      }

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
        // scanned PDF or unsupported — gallery-only path
      }
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

  let rankedLogos = rankLogoCandidates(
    logoCandidates.map((c) => ({
      url: c.value.previewUrl ?? c.value.assetId,
      score: c.score,
      provenance: c.provenance,
      format: c.value.format,
      widthHint: c.value.width,
      heightHint: c.value.height,
    })),
  );

  if (rankedLogos.length && options?.llmEnabled) {
    yield { type: "llm_progress", step: "logo_vision", status: "running", detail: "Etiquetando logos…" };
    rankedLogos = await labelLogoCandidatesWithVision(rankedLogos, {
      userEmail: options?.userEmail,
      route: "/api/spaces/genoma/ingest",
      onLlmCostUsd: options?.onLlmCostUsd,
    });
    yield { type: "llm_progress", step: "logo_vision", status: "done", detail: `${rankedLogos.length} candidatos` };
  }

  const logoDecision = shouldAutoResolveLogo(rankedLogos);
  if (logoDecision.auto && logoDecision.top) {
    yield {
      type: "slot_update",
      slotId: "logo",
      patch: slotPatch({
        status: "resolved",
        value: logoDecision.top.value,
        provenance: logoDecision.top.provenance,
        confidence: logoDecision.top.score,
        candidates: rankedLogos,
      }),
    };
  } else if (rankedLogos.length) {
    yield {
      type: "slot_update",
      slotId: "logo",
      patch: slotPatch({ status: "candidates", candidates: rankedLogos, confidence: rankedLogos[0]?.score ?? 0.5 }),
    };
  } else {
    yield { type: "slot_update", slotId: "logo", patch: slotPatch({ status: "needs_user", confidence: 0 }) };
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
    if (valuesRaw) {
      const valuesValue = validateValuesAgainstCorpus(corpus, valuesRaw);
      if (valuesValue) {
        const beliefs = valuesValue.values.map((item) => ({ label: item.label, evidence: item.evidence }));
        yield {
          type: "slot_update",
          slotId: "essence",
          patch: slotPatch({
            status: "resolved",
            value: { beliefs },
            provenance: { type: "llm_synthesis", detail: "documentos" },
            confidence: 0.62,
          }),
        };
      }
    }
    if (onelinerLlm) {
      const beliefs =
        valuesRaw && validateValuesAgainstCorpus(corpus, valuesRaw)
          ? validateValuesAgainstCorpus(corpus, valuesRaw)!.values.map((item) => ({
              label: item.label,
              evidence: item.evidence,
            }))
          : [];
      yield {
        type: "slot_update",
        slotId: "essence",
        patch: slotPatch({
          status: "candidates",
          candidates: essenceCandidatesFromOnelinerLlm(onelinerLlm, beliefs),
          confidence: 0.48,
        }),
      };
    }
  } else if (!llmEnabled) {
    yield { type: "llm_status", status: "skipped", reason: options?.llmSkipReason ?? "IA desactivada" };
  }

  yield { type: "phase_complete", phase: "finalize" };
  yield { type: "done", jobId };
}
