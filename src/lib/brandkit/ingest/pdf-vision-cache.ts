/**
 * Cache en memoria del pase de visión unificado — idempotencia por hash del documento.
 */

import type { BrandKitPdfVisionResult } from "./pdf-vision-types";
import { BRAND_KIT_PDF_VISION_PASS_VERSION } from "./pdf-vision-types";

const cache = new Map<string, BrandKitPdfVisionResult | null>();

export function pdfVisionCacheKey(contentSha256: string): string {
  return `${contentSha256}:${BRAND_KIT_PDF_VISION_PASS_VERSION}`;
}

export function getCachedPdfVisionPass(key: string): BrandKitPdfVisionResult | null | undefined {
  if (!cache.has(key)) return undefined;
  return cache.get(key) ?? null;
}

export function setCachedPdfVisionPass(key: string, result: BrandKitPdfVisionResult | null): void {
  cache.set(key, result);
}

/** Solo tests — evita fugas entre casos. */
export function clearPdfVisionCacheForTests(): void {
  cache.clear();
}
