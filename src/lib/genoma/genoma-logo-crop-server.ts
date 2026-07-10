import sharp from "sharp";
import { renderPdfPagesAt } from "@/lib/brain/pdf-page-render";
import type { NormalizedBboxPage } from "./genoma-logo-bbox";

export type { NormalizedBboxPage } from "./genoma-logo-bbox";
export { logoSourceBboxToPageTuple, pageTupleToLogoSourceBbox } from "./genoma-logo-bbox";

export async function cropLogoFromPdfPage(input: {
  pdfBuffer: Buffer;
  pageNumber: number;
  bboxPage: NormalizedBboxPage;
  dpi?: number;
}): Promise<{ buffer: Buffer; width: number; height: number }> {
  const dpi = input.dpi ?? 216;
  const pages = await renderPdfPagesAt(input.pdfBuffer, [input.pageNumber], { dpi });
  const page = pages[0];
  if (!page) throw new Error("page_not_found");

  return cropLogoFromPagePng({
    pagePng: page.pngBuffer,
    pageWidth: page.width,
    pageHeight: page.height,
    bboxPage: input.bboxPage,
  });
}

export async function cropLogoFromRasterPage(input: {
  rasterBuffer: Buffer;
  bboxPage: NormalizedBboxPage;
}): Promise<{ buffer: Buffer; width: number; height: number }> {
  const pagePng = await sharp(input.rasterBuffer, { failOn: "none" }).rotate().png().toBuffer();
  const meta = await sharp(pagePng).metadata();
  const pageWidth = meta.width ?? 0;
  const pageHeight = meta.height ?? 0;
  if (!pageWidth || !pageHeight) throw new Error("page_not_found");

  return cropLogoFromPagePng({
    pagePng,
    pageWidth,
    pageHeight,
    bboxPage: input.bboxPage,
  });
}

async function cropLogoFromPagePng(input: {
  pagePng: Buffer;
  pageWidth: number;
  pageHeight: number;
  bboxPage: NormalizedBboxPage;
}): Promise<{ buffer: Buffer; width: number; height: number }> {
  const [x0, y0, x1, y1] = input.bboxPage;
  const left = Math.max(0, Math.floor(x0 * input.pageWidth));
  const top = Math.max(0, Math.floor(y0 * input.pageHeight));
  const right = Math.min(input.pageWidth, Math.ceil(x1 * input.pageWidth));
  const bottom = Math.min(input.pageHeight, Math.ceil(y1 * input.pageHeight));
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);

  const buffer = await sharp(input.pagePng)
    .extract({ left, top, width, height })
    .png()
    .toBuffer();
  const meta = await sharp(buffer).metadata();

  return {
    buffer,
    width: meta.width ?? width,
    height: meta.height ?? height,
  };
}
