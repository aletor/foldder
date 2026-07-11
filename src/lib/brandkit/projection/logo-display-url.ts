/**
 * URLs del logo: raster fiable en UI · vector para export/PDF.
 */

import type { CandidateDerived } from "../model/evidence";
import type { LogoValue } from "../model/trait-values";

export function isNativeVectorLogoUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  return u.startsWith("data:image/svg+xml") || u.endsWith(".svg") || u.includes("image/svg+xml");
}

export function resolveLogoRasterUrl(
  logo: LogoValue | null | undefined,
  derived?: CandidateDerived,
): string | undefined {
  const raster = derived?.rasterImageUrl?.trim();
  if (raster && !isNativeVectorLogoUrl(raster)) return raster;
  const url = logo?.imageUrl?.trim();
  if (!url || isNativeVectorLogoUrl(url)) return undefined;
  const vector = derived?.vectorUrl?.trim();
  if (vector && url === vector) return undefined;
  return url;
}

/** URL de una variante de polaridad cuando exista en logo.variants. */
export function resolveLogoVariantUrl(
  logo: LogoValue | null | undefined,
  polarity: "positive" | "negative",
): string | undefined {
  const variant = logo?.variants?.find((v) => v.variant === polarity);
  if (variant?.imageUrl?.trim()) return variant.imageUrl.trim();
  if (logo?.variant === polarity && logo.imageUrl?.trim()) return logo.imageUrl.trim();
  return logo?.imageUrl?.trim();
}

/** Cara / previews: raster primero (el SVG en S3 a menudo no pinta en `<img>`). */
export function resolveLogoDisplayUrl(
  logo: LogoValue | null | undefined,
  derived?: CandidateDerived,
): string | undefined {
  const raster = resolveLogoRasterUrl(logo, derived);
  if (raster) return raster;
  const vector = derived?.vectorUrl?.trim();
  if (vector?.startsWith("data:")) return vector;
  const raw = logo?.imageUrl?.trim();
  if (raw?.startsWith("data:image/svg+xml")) return raw;
  if (raw && !isNativeVectorLogoUrl(raw) && !raw.includes("/api/spaces/s3-file")) return raw;
  return undefined;
}

/** Export PDF / downstream: vector cuando exista. */
export function resolveLogoExportUrl(
  logo: LogoValue | null | undefined,
  derived?: CandidateDerived,
): string | undefined {
  const vector = derived?.vectorUrl?.trim();
  if (vector) return vector;
  return resolveLogoRasterUrl(logo, derived) ?? logo?.imageUrl?.trim();
}

function isUiSafeLogoUrl(url: string | undefined): url is string {
  const trimmed = url?.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("data:")) return true;
  if (trimmed.includes("/api/spaces/s3-file") && trimmed.toLowerCase().includes(".svg")) return false;
  return /^https?:\/\//i.test(trimmed) || trimmed.startsWith("/api/spaces/s3-file");
}

/** Resuelve logo visible en UI; evita SVG en S3 en `<img>` y busca raster en hermanos. */
export function resolveLogoUiFromTrait(
  candidates: Array<{ id: string; value: unknown; derived?: CandidateDerived; status: string }>,
  crownedId: string | null | undefined,
): { logo: LogoValue; derived?: CandidateDerived } | null {
  const crowned = crownedId ? candidates.find((c) => c.id === crownedId) : candidates[0];
  if (crowned?.value && typeof crowned.value === "object" && "imageUrl" in crowned.value) {
    const logo = crowned.value as LogoValue;
    const url = resolveLogoDisplayUrl(logo, crowned.derived);
    if (isUiSafeLogoUrl(url)) {
      return { logo, derived: crowned.derived };
    }
  }

  for (const candidate of candidates) {
    if (candidate.status === "archived") continue;
    if (!candidate.value || typeof candidate.value !== "object" || !("imageUrl" in candidate.value)) continue;
    const logo = candidate.value as LogoValue;
    const raster = resolveLogoRasterUrl(logo, candidate.derived);
    if (isUiSafeLogoUrl(raster)) return { logo, derived: candidate.derived };
  }

  return null;
}
