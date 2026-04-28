import type { BrandVisualDnaRawImageAnalysis } from "./types";

export const BRAND_VISUAL_DNA_EMBEDDING_DIM = 32;

function hexToRgb01(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim();
  if (h.length !== 6) return [0.5, 0.5, 0.5];
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

const COMP_ORDER = [
  "center_weighted",
  "rule_of_thirds",
  "symmetrical",
  "layered",
  "flat_lay",
  "environmental_wide",
  "mixed",
  "unknown",
] as const;

function compositionOrdinal(t: string): number {
  const i = COMP_ORDER.indexOf(t as (typeof COMP_ORDER)[number]);
  return i < 0 ? (COMP_ORDER.length - 1) / COMP_ORDER.length : i / Math.max(1, COMP_ORDER.length - 1);
}

/** Vector fijo para clustering (no es CLIP; solo geometría de color + estadísticas técnicas). */
export function buildVisualFeatureEmbedding(a: BrandVisualDnaRawImageAnalysis): number[] {
  const v: number[] = [];
  const cols = (a.dominant_colors ?? []).slice(0, 4);
  for (let i = 0; i < 4; i++) {
    v.push(...hexToRgb01(cols[i] ?? "#808080"));
  }
  v.push(
    a.brightness_0_1,
    a.contrast_0_1,
    a.saturation_0_1,
    a.text_presence_score_0_1,
    a.human_presence_score_0_1,
    a.product_presence_score_0_1,
    a.visual_density_0_1,
    compositionOrdinal(a.composition_type),
    a.orientation === "portrait" ? 1 : a.orientation === "landscape" ? 0 : a.orientation === "square" ? 0.5 : 0.25,
    a.background_type === "busy_environment" ? 1 : a.background_type === "minimal_studio" ? 0.55 : 0.2,
    a.object_category_hint === "people" ? 1 : a.object_category_hint === "product" ? 0.7 : 0.35,
  );
  while (v.length < BRAND_VISUAL_DNA_EMBEDDING_DIM) v.push(0);
  return v.slice(0, BRAND_VISUAL_DNA_EMBEDDING_DIM);
}

export function l2Normalize(vec: number[]): number[] {
  const s = Math.sqrt(vec.reduce((a, b) => a + b * b, 0)) || 1;
  return vec.map((x) => x / s);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) dot += a[i] * b[i];
  return dot;
}
