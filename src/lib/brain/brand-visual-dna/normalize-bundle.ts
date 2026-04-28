import type { BrandVisualDnaStoredBundle } from "./types";

/** Normalización tolerante para persistencia en `visualReferenceAnalysis.brandVisualDnaBundle`. */
export function parseBrandVisualDnaBundle(raw: unknown): BrandVisualDnaStoredBundle | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const bvd = o.brand_visual_dna;
  if (!bvd || typeof bvd !== "object") return undefined;
  try {
    return JSON.parse(JSON.stringify(o)) as BrandVisualDnaStoredBundle;
  } catch {
    return undefined;
  }
}
