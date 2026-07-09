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

  const [x0, y0, x1, y1] = input.bboxPage;
  const left = Math.max(0, Math.floor(x0 * page.width));
  const top = Math.max(0, Math.floor(y0 * page.height));
  const right = Math.min(page.width, Math.ceil(x1 * page.width));
  const bottom = Math.min(page.height, Math.ceil(y1 * page.height));
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);

  const buffer = await sharp(page.pngBuffer)
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
