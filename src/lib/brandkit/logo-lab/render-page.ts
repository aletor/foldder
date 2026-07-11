import { renderPdfPages } from "@/lib/brain/pdf-page-render";
import { buildPageVisionBatchFrame } from "@/lib/brandkit/ingest/page-vision-batch-frame";
import { PAGE_VISION_NIVEL1_RENDER_DPI } from "@/lib/brandkit/ingest/page-vision-pass-version";

export type RenderedPageFrame = {
  pngBuffer: Buffer;
  width: number;
  height: number;
  dpi: number;
  frame: "vision";
};

/** Frame idéntico al JPEG del batch Nivel 1 (96 dpi → 640px → tag → jpeg → decode). */
export async function renderVisionBatchFramePng(
  buffer: Buffer,
  pageNumber: number,
): Promise<RenderedPageFrame> {
  if (pageNumber < 1) throw new Error("invalid_page_number");
  const pages = await renderPdfPages(buffer, {
    maxPages: pageNumber,
    dpi: PAGE_VISION_NIVEL1_RENDER_DPI,
  });
  const page = pages.find((p) => p.pageNumber === pageNumber);
  if (!page) throw new Error(`page_not_found:${pageNumber}`);
  const batchFrame = await buildPageVisionBatchFrame(page.pngBuffer, pageNumber);
  return {
    pngBuffer: batchFrame.modelViewPng,
    width: batchFrame.width,
    height: batchFrame.height,
    dpi: PAGE_VISION_NIVEL1_RENDER_DPI,
    frame: "vision",
  };
}
