/**
 * Reglas puras de coronación/vectorize — sin dependencias Node (safe para cliente).
 */

import type { LogoAssetOrigin } from "../model/trait-values";

/** Gate fail-closed: vectorize solo cuando el origen es raster (xobject_native | render_crop). */
export function nativeAssetAllowsVectorize(origin: LogoAssetOrigin): boolean {
  return origin === "xobject_native" || origin === "render_crop";
}

export type WordmarkIntegrityStatus = "ok" | "failed" | "not_applicable_raster";

export function wordmarkIntegrityPasses(signals: Array<{ kind: string; detail?: string }>): boolean {
  return signals.some((s) => s.kind === "wordmark-integrity" && s.detail?.startsWith("wordmark integrity ✓"));
}

/** Tri-estado para informes — raster no implica fallo de integridad vectorial. */
export function assessWordmarkIntegrityStatus(
  origin: LogoAssetOrigin | undefined,
  signals: Array<{ kind: string; detail?: string }>,
): WordmarkIntegrityStatus {
  if (origin === "xobject_native" || origin === "render_crop") {
    return "not_applicable_raster";
  }
  if (origin !== "vector_native") return "not_applicable_raster";
  return wordmarkIntegrityPasses(signals) ? "ok" : "failed";
}
