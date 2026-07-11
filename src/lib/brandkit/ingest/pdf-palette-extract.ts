/**
 * Paleta PDF para BrandKit — C1 render cuantizado; visión valida roles si está disponible.
 */

import type { BrandKitPdfVisionResult } from "./pdf-vision-types";
import { extractPdfPaletteForGenomeWithVision } from "./pdf-palette-vision";

export type { PdfPaletteExtractResult } from "./pdf-palette-vision";
export { nearestRenderHex, rankPaletteWithVision, hexExistsInRender } from "./pdf-palette-vision";

export async function extractPdfPaletteForGenome(
  buffer: Buffer,
  maxPages: number,
  vision?: BrandKitPdfVisionResult | null,
) {
  return extractPdfPaletteForGenomeWithVision(buffer, maxPages, vision);
}
