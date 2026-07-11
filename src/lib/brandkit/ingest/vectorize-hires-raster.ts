/**
 * Re-rasteriza el logo coronado desde el PDF fuente (page + bbox @ 150 DPI)
 * antes de vectorizar — evita trazar desde el crop detector (~517 px).
 */

import sharp from "sharp";
import {
  PDF_PAGE_RENDER_DEFAULT_DPI,
  renderPdfPageCrop,
  type PixelBBox,
} from "@/lib/brain/pdf-page-render";
import type { LogoVectorSourceRef } from "../model/evidence";
import { loadBrandKitSourcePdf } from "../ingest/brand-kit-source-pdf-store";

/** DPI mínimo de aceptación del brief (≥600 ppi al tamaño de colocación). */
export const VECTORIZE_RERASTER_DPI = 600;

export type HiResLogoRasterSource = "hi_res_pdf_crop" | "fallback_crop";

export type HiResLogoRasterResult = {
  buffer: Buffer;
  source: HiResLogoRasterSource;
  dpi?: number;
  pageNumber?: number;
  widthPx?: number;
  heightPx?: number;
};

function scaleBBoxToDpi(bbox: PixelBBox, targetDpi: number): PixelBBox {
  const scale = targetDpi / PDF_PAGE_RENDER_DEFAULT_DPI;
  return {
    x: Math.round(bbox.x * scale),
    y: Math.round(bbox.y * scale),
    width: Math.max(1, Math.round(bbox.width * scale)),
    height: Math.max(1, Math.round(bbox.height * scale)),
  };
}

export async function resolveHiResLogoRasterForVectorize(input: {
  userEmail: string;
  vectorSource?: LogoVectorSourceRef;
  fallbackBuffer: Buffer;
}): Promise<HiResLogoRasterResult> {
  const vs = input.vectorSource;
  if (!vs?.contentSha256?.trim() || !vs.pageNumber || !vs.bbox) {
    console.info(
      `[vectorize] hi-res skip: missing vectorSource ` +
        `sha=${Boolean(vs?.contentSha256)} page=${vs?.pageNumber ?? "—"} bbox=${Boolean(vs?.bbox)}`,
    );
    return { buffer: input.fallbackBuffer, source: "fallback_crop" };
  }

  const pdfBuffer = await loadBrandKitSourcePdf(input.userEmail, vs.contentSha256);
  if (!pdfBuffer) {
    console.info(`[vectorize] hi-res skip: pdf_not_found sha=${vs.contentSha256.slice(0, 16)}`);
    return { buffer: input.fallbackBuffer, source: "fallback_crop" };
  }

  const scaledBbox = scaleBBoxToDpi(vs.bbox as PixelBBox, VECTORIZE_RERASTER_DPI);

  try {
    const hiRes = await renderPdfPageCrop(
      pdfBuffer,
      vs.pageNumber,
      scaledBbox,
      VECTORIZE_RERASTER_DPI,
    );
    const meta = await sharp(hiRes).metadata();
    console.info(
      `[vectorize] hi-res crop: page=${vs.pageNumber} dpi=${VECTORIZE_RERASTER_DPI} ` +
        `px=${meta.width ?? 0}x${meta.height ?? 0} sha=${vs.contentSha256.slice(0, 16)}`,
    );
    return {
      buffer: hiRes,
      source: "hi_res_pdf_crop",
      dpi: VECTORIZE_RERASTER_DPI,
      pageNumber: vs.pageNumber,
      widthPx: meta.width,
      heightPx: meta.height,
    };
  } catch (error) {
    console.warn(
      `[vectorize] hi-res crop failed sha=${vs.contentSha256.slice(0, 16)}`,
      error instanceof Error ? error.message : error,
    );
    return { buffer: input.fallbackBuffer, source: "fallback_crop" };
  }
}
