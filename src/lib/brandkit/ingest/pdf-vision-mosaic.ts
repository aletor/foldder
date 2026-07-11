/**
 * Mosaico de páginas renderizadas para el pase de visión unificado.
 */

import { renderPdfPages } from "@/lib/brain/pdf-page-render";
import type { BrandKitVisionPageImage } from "./pdf-vision-types";

export const VISION_MOSAIC_DPI = 110;
export const VISION_MOSAIC_MAX_PAGES = 6;

export async function buildPdfVisionMosaic(
  buffer: Buffer,
  maxPages = VISION_MOSAIC_MAX_PAGES,
): Promise<BrandKitVisionPageImage[]> {
  const pages = await renderPdfPages(buffer, { maxPages, dpi: VISION_MOSAIC_DPI });
  if (!pages.length) return [];

  const pick =
    pages.length <= 3
      ? pages
      : [pages[0], pages[Math.floor(pages.length / 2)], pages[pages.length - 1]].filter(Boolean);

  const unique = [...new Map(pick.map((p) => [p!.pageNumber, p!])).values()].slice(0, maxPages);

  return unique.map((page) => ({
    mimeType: "image/png",
    base64: page.pngBuffer.toString("base64"),
    pageNumber: page.pageNumber,
    width: page.width,
    height: page.height,
  }));
}
