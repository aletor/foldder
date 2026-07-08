/**
 * Extractor de universo visual (§3.4): imágenes embebidas del PDF → ADN visual por categoría.
 * Reutiliza extracción Brain + señales técnicas (sharp) sin LLM.
 */

import crypto from "node:crypto";
import { extractVisualImagesFromPdfBuffer, type PdfVisualImage } from "@/lib/brain/pdf-visual-extract";
import { extractTechnicalImageFeatures } from "@/lib/brain/brand-visual-dna/technical-features";
import { createCandidate, signal, type Candidate, type SourceRef } from "../model/evidence";
import type { ImageCategory } from "../model/trait-ids";
import type { ImageDnaValue } from "../model/trait-values";
import type { GenomaPdfVisionResult } from "../ingest/pdf-vision-types";

const MAX_VISUAL_IMAGES = 8;

function imageSignature(buffer: Buffer): string {
  return crypto.createHash("sha1").update(buffer).digest("hex").slice(0, 16);
}

function treatmentLabel(brightness: number, contrast: number, saturation: number): string {
  const parts: string[] = [];
  if (brightness > 0.62) parts.push("luminoso");
  else if (brightness < 0.38) parts.push("sombrío");
  if (contrast > 0.55) parts.push("contraste alto");
  else if (contrast < 0.28) parts.push("contraste suave");
  if (saturation > 0.45) parts.push("color vivo");
  else if (saturation < 0.2) parts.push("paleta contenida");
  return parts.join(", ") || "equilibrado";
}

function encuadreFromComposition(composition: string, orientation: string): string {
  if (composition === "environmental_wide") return "amplio";
  if (composition === "center_weighted") return "centrado";
  if (composition === "rule_of_thirds") return "tercios";
  if (orientation === "portrait") return "vertical";
  if (orientation === "landscape") return "horizontal";
  return "medio";
}

function classifyCategory(input: {
  humanScore: number;
  objectHint: string;
  composition: string;
  orientation: string;
  textScore: number;
  area: number;
}): ImageCategory {
  if (input.textScore > 0.5 && input.area < 180_000) return "general";
  if (input.humanScore > 0.22 || input.objectHint === "people") return "people";
  if (input.composition === "environmental_wide" || (input.orientation === "landscape" && input.humanScore < 0.12))
    return "environments";
  if (input.objectHint === "product" || input.objectHint === "food") return "objects";
  if (input.objectHint === "abstract_graphic" || input.textScore > 0.42) return "textures";
  if (input.humanScore < 0.1 && input.area > 120_000) return "protagonists";
  return "general";
}

function axesFromFeatures(
  image: PdfVisualImage,
  features: Awaited<ReturnType<typeof extractTechnicalImageFeatures>>,
): ImageDnaValue {
  const palette = features.dominant_colors.slice(0, 3).join(", ");
  return {
    axes: {
      sujeto:
        features.object_category_hint === "people"
          ? "personas"
          : features.object_category_hint === "product"
            ? "producto o objeto"
            : features.object_category_hint === "food"
              ? "alimento"
              : "escena de marca",
      entorno:
        features.background_type === "busy_environment"
          ? "entorno con contexto"
          : features.background_type === "minimal_studio"
            ? "estudio limpio"
            : "fondo neutro",
      encuadre: encuadreFromComposition(features.composition_type, features.orientation),
      paleta: palette,
      tratamiento: treatmentLabel(features.brightness_0_1, features.contrast_0_1, features.saturation_0_1),
    },
  };
}

export type VisualExtraction = Partial<Record<ImageCategory, Candidate<ImageDnaValue>[]>>;

export async function extractVisualFromPdf(
  buffer: Buffer,
  fileName: string,
  opts: { sources?: SourceRef[]; maxImages?: number } = {},
): Promise<VisualExtraction> {
  const sourceId = opts.sources?.[0]?.id ?? "pdf";
  const images = (await extractVisualImagesFromPdfBuffer(buffer, fileName)).slice(0, opts.maxImages ?? MAX_VISUAL_IMAGES);
  const out: VisualExtraction = {};

  for (const image of images) {
    const width = image.width ?? 0;
    const height = image.height ?? 0;
    const area = width * height;
    if (area < 12_000) continue;

    const features = await extractTechnicalImageFeatures(imageSignature(image.buffer), image.buffer);
    if (features.text_presence_score_0_1 > 0.55 && area < 250_000) continue;

    const category = classifyCategory({
      humanScore: features.human_presence_score_0_1,
      objectHint: features.object_category_hint,
      composition: features.composition_type,
      orientation: features.orientation,
      textScore: features.text_presence_score_0_1,
      area,
    });

    const imageUrl = `data:${image.mime};base64,${image.buffer.toString("base64")}`;
    const candidate = createCandidate<ImageDnaValue>({
      value: {
        ...axesFromFeatures(image, features),
        referenceImageUrl: imageUrl,
      },
      signals: [
        signal("recurrence", { detail: image.name, sourceRef: sourceId }),
        signal("render-quantized", { sourceRef: sourceId, scale: Math.min(1, area / 400_000) }),
      ],
      signature: `img_${category}_${imageSignature(image.buffer)}`,
      sourceRefs: [sourceId],
    });

    const list = out[category] ?? [];
    if (list.length >= 2) continue;
    list.push(candidate);
    out[category] = list;
  }

  return out;
}

export function visualTerritoryCount(extraction: VisualExtraction): number {
  return Object.values(extraction).reduce((n, list) => n + (list?.length ?? 0), 0);
}

function visionEntryToCandidate(
  entry: GenomaPdfVisionResult["visual"][number],
  sourceId: string,
  index: number,
  referenceImageUrl?: string,
): Candidate<ImageDnaValue> {
  return createCandidate<ImageDnaValue>({
    value: {
      axes: {
        sujeto: entry.description.slice(0, 120),
        entorno: entry.category === "environments" ? "entorno de marca" : "contexto visual",
        encuadre: entry.category === "protagonists" ? "protagonista" : "referencia",
        paleta: "",
        tratamiento: entry.description.slice(0, 80),
      },
      ...(referenceImageUrl ? { referenceImageUrl } : {}),
    },
    signals: [
      signal("llm-vision", {
        detail: entry.description,
        sourceRef: sourceId,
        scale: 0.45,
      }),
    ],
    signature: `vision_${entry.category}_${index}_${textSignature(entry.description)}`,
    sourceRefs: [sourceId],
  });
}

function textSignature(text: string): string {
  return crypto.createHash("sha1").update(text).digest("hex").slice(0, 12);
}

/** Clasificación del pase de visión unificado — complementa o sustituye heurística embebida. */
export function buildVisualExtractionFromVisionPass(
  vision: GenomaPdfVisionResult,
  sourceId: string,
  embeddedImages: PdfVisualImage[] = [],
): VisualExtraction {
  const out: VisualExtraction = {};
  for (let i = 0; i < vision.visual.length; i += 1) {
    const entry = vision.visual[i];
    if (!entry) continue;
    const ref =
      entry.imageRefIndex !== undefined && embeddedImages[entry.imageRefIndex]
        ? `data:${embeddedImages[entry.imageRefIndex]!.mime};base64,${embeddedImages[entry.imageRefIndex]!.buffer.toString("base64")}`
        : undefined;
    const candidate = visionEntryToCandidate(entry, sourceId, i, ref);
    const list = out[entry.category] ?? [];
    if (list.length >= 2) continue;
    list.push(candidate);
    out[entry.category] = list;
  }
  return out;
}

export function mergeVisualExtractions(
  heuristic: VisualExtraction,
  vision: VisualExtraction,
): VisualExtraction {
  const out: VisualExtraction = { ...heuristic };
  for (const [category, candidates] of Object.entries(vision) as Array<
    [ImageCategory, Candidate<ImageDnaValue>[]]
  >) {
    const existing = out[category] ?? [];
    if (existing.length >= 2) continue;
    const room = 2 - existing.length;
    out[category] = [...existing, ...candidates.slice(0, room)];
  }
  return out;
}
