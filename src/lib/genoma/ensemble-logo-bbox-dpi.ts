import { renderPdfPagesAt } from "@/lib/brain/pdf-page-render";
import type { BBoxPage } from "./logo-intake/bbox";
import { bboxPageToPixel } from "./genoma-brand-board-logo-regions";
import sharp from "sharp";

export type LogoBboxDpiStability = {
  bboxPage: BBoxPage;
  confidence: number;
  stable: boolean;
};

async function cropSizeAtDpi(
  pdfBuffer: Buffer,
  pageNumber: number,
  bboxPage: BBoxPage,
  dpi: number,
): Promise<{ width: number; height: number } | null> {
  const pages = await renderPdfPagesAt(pdfBuffer, [pageNumber], { dpi });
  const page = pages[0];
  if (!page) return null;
  const pixel = bboxPageToPixel(bboxPage, page.width, page.height);
  if (pixel.width < 8 || pixel.height < 8) return null;
  try {
    const meta = await sharp(page.pngBuffer)
      .extract(pixel)
      .metadata();
    return { width: meta.width ?? pixel.width, height: meta.height ?? pixel.height };
  } catch {
    return null;
  }
}

/**
 * Comprueba si un bbox normalizado produce crops de tamaño similar a varios DPI.
 * Devuelve confianza 0–1; si inestable, reduce ligeramente el bbox hacia el centro.
 */
export async function stabilizeLogoBboxAcrossDpi(input: {
  pdfBuffer: Buffer;
  pageNumber: number;
  bboxPage: BBoxPage;
  dpis?: number[];
}): Promise<LogoBboxDpiStability> {
  const dpis = input.dpis ?? [96, 144];
  const sizes: { width: number; height: number }[] = [];

  for (const dpi of dpis) {
    const size = await cropSizeAtDpi(input.pdfBuffer, input.pageNumber, input.bboxPage, dpi);
    if (size) sizes.push(size);
  }

  if (sizes.length < 2) {
    return { bboxPage: input.bboxPage, confidence: 0.55, stable: false };
  }

  const widths = sizes.map((s) => s.width);
  const heights = sizes.map((s) => s.height);
  const wSpread = (Math.max(...widths) - Math.min(...widths)) / Math.max(1, widths[0]!);
  const hSpread = (Math.max(...heights) - Math.min(...heights)) / Math.max(1, heights[0]!);
  const spread = Math.max(wSpread, hSpread);
  const confidence = Math.max(0, Math.min(1, 1 - spread * 2.2));
  const stable = confidence >= 0.72;

  if (stable) {
    return { bboxPage: input.bboxPage, confidence, stable: true };
  }

  const shrink = 0.06;
  const [x1, y1, x2, y2] = input.bboxPage;
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const halfW = ((x2 - x1) / 2) * (1 - shrink);
  const halfH = ((y2 - y1) / 2) * (1 - shrink);
  const tightened: BBoxPage = [
    Math.max(0, cx - halfW),
    Math.max(0, cy - halfH),
    Math.min(1, cx + halfW),
    Math.min(1, cy + halfH),
  ];

  return { bboxPage: tightened, confidence, stable: false };
}
