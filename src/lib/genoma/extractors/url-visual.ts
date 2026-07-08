/**
 * Universo visual desde imágenes de una página web.
 */

import crypto from "node:crypto";
import { extractTechnicalImageFeatures } from "@/lib/brain/brand-visual-dna/technical-features";
import { createCandidate, signal, type Candidate } from "../model/evidence";
import type { ImageCategory } from "../model/trait-ids";
import type { ImageDnaValue } from "../model/trait-values";
import type { VisualExtraction } from "./visual";

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

export async function extractVisualFromFetchedImages(
  images: Array<{ buffer: Buffer; mime: string }>,
  sourceId: string,
): Promise<VisualExtraction> {
  const out: VisualExtraction = {};
  for (const image of images) {
    const meta = await import("sharp").then((m) => m.default(image.buffer).metadata());
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
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

    const imageUrl = `data:${image.mime.split(";")[0]};base64,${image.buffer.toString("base64")}`;
    const candidate = createCandidate<ImageDnaValue>({
      value: {
        axes: {
          sujeto:
            features.object_category_hint === "people"
              ? "personas"
              : features.object_category_hint === "product"
                ? "producto"
                : "escena web",
          entorno: features.background_type === "minimal_studio" ? "estudio limpio" : "web de marca",
          encuadre: encuadreFromComposition(features.composition_type, features.orientation),
          paleta: features.dominant_colors.slice(0, 3).join(", "),
          tratamiento: treatmentLabel(features.brightness_0_1, features.contrast_0_1, features.saturation_0_1),
        },
        referenceImageUrl: imageUrl,
      },
      signals: [
        signal("recurrence", { detail: "imagen en la web", sourceRef: sourceId }),
        signal("render-quantized", { sourceRef: sourceId, scale: Math.min(1, area / 400_000) }),
      ],
      signature: `web_${category}_${imageSignature(image.buffer)}`,
      sourceRefs: [sourceId],
    });

    const list = out[category] ?? [];
    if (list.length >= 2) continue;
    list.push(candidate);
    out[category] = list;
  }
  return out;
}
