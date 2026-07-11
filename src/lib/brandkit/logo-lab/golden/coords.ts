/**
 * Conversión bbox frame batch ↔ espacio de página (Brief 0 §3).
 * El frame es la página completa reescalada (sin letterboxing); en normalizado 0–1
 * la conversión es identidad. El tag de página no altera dimensiones (composite same-size).
 */

import { renderPdfPages } from "@/lib/brain/pdf-page-render";
import { buildPageVisionBatchFrame } from "@/lib/brandkit/ingest/page-vision-batch-frame";
import { resizePngForNivel1Batch } from "@/lib/brandkit/ingest/page-vision-nivel1-resize";
import { PAGE_VISION_NIVEL1_RENDER_DPI } from "@/lib/brandkit/ingest/page-vision-pass-version";

export type PageBbox = [number, number, number, number];
export type FrameBbox = [number, number, number, number];

export function bboxIoU(a: readonly number[], b: readonly number[]): number {
  const ix1 = Math.max(a[0], b[0]);
  const iy1 = Math.max(a[1], b[1]);
  const ix2 = Math.min(a[2], b[2]);
  const iy2 = Math.min(a[3], b[3]);
  if (ix2 <= ix1 || iy2 <= iy1) return 0;
  const inter = (ix2 - ix1) * (iy2 - iy1);
  const areaA = Math.max(0, a[2] - a[0]) * Math.max(0, a[3] - a[1]);
  const areaB = Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
  const union = areaA + areaB - inter;
  return union > 0 ? inter / union : 0;
}

export function assertFrameMatchesScaledPage(
  frameWidth: number,
  frameHeight: number,
  scaledPageWidth: number,
  scaledPageHeight: number,
): void {
  if (frameWidth !== scaledPageWidth || frameHeight !== scaledPageHeight) {
    throw new Error(
      `frame_page_dim_mismatch: frame=${frameWidth}x${frameHeight} page=${scaledPageWidth}x${scaledPageHeight}`,
    );
  }
}

/** Normalizado 0–1 en frame batch → espacio de página (con aserción de dims). */
export async function frameBboxToPageBbox(
  pdfBuffer: Buffer,
  pageNumber: number,
  frameBbox: FrameBbox,
): Promise<PageBbox> {
  const pages = await renderPdfPages(pdfBuffer, {
    maxPages: pageNumber,
    dpi: PAGE_VISION_NIVEL1_RENDER_DPI,
  });
  const page = pages.find((p) => p.pageNumber === pageNumber);
  if (!page) throw new Error(`page_not_found:${pageNumber}`);

  const batchFrame = await buildPageVisionBatchFrame(page.pngBuffer, pageNumber);
  const resizedPage = await resizePngForNivel1Batch(page.pngBuffer);
  const pageMeta = await getPngDimensions(resizedPage);
  assertFrameMatchesScaledPage(
    batchFrame.width,
    batchFrame.height,
    pageMeta.width,
    pageMeta.height,
  );

  return [frameBbox[0], frameBbox[1], frameBbox[2], frameBbox[3]];
}

/** Espacio de página → frame batch (identidad en normalizado; valida dims). */
export async function pageBboxToFrameBbox(
  pdfBuffer: Buffer,
  pageNumber: number,
  pageBbox: PageBbox,
): Promise<FrameBbox> {
  await frameBboxToPageBbox(pdfBuffer, pageNumber, pageBbox);
  return [pageBbox[0], pageBbox[1], pageBbox[2], pageBbox[3]];
}

/** Overlay UI: bbox 0–1 → CSS % sobre el frame. */
export function pageBboxToCssPercent(bbox: readonly [number, number, number, number]): {
  left: string;
  top: string;
  width: string;
  height: string;
} {
  return {
    left: `${bbox[0] * 100}%`,
    top: `${bbox[1] * 100}%`,
    width: `${(bbox[2] - bbox[0]) * 100}%`,
    height: `${(bbox[3] - bbox[1]) * 100}%`,
  };
}

async function getPngDimensions(pngBuffer: Buffer): Promise<{ width: number; height: number }> {
  const sharp = (await import("sharp")).default;
  const meta = await sharp(pngBuffer).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new Error("invalid_page_png_dims");
  return { width, height };
}
