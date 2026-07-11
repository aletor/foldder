/**
 * Barrido barato de páginas PDF (sin LLM) para elegir candidatas con contenido visual.
 */

import sharp from "sharp";
import { renderPdfPagesAt } from "@/lib/brain/pdf-page-render";

export const PROBE_BRAND_PDF_PAGES = 4;

const SCAN_DPI = 48;
const SCAN_LONG_EDGE = 220;
const SCAN_PAGE_LIMIT = 80;
const SCAN_MIN_SCORE = 0.14;
const EXTENDED_IMAGE_PAGES_MAX = 10;

function colorDist(
  r: number,
  g: number,
  b: number,
  br: number,
  bg: number,
  bb: number,
): number {
  const dr = r - br;
  const dg = g - bg;
  const db = b - bb;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function stdDev(values: number[]): number {
  if (!values.length) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) / values.length;
  return Math.sqrt(variance);
}

/** 0–1 — mayor score = más probable que la página tenga fotos/ilustraciones relevantes. */
export async function scorePageVisualRichness(pngBuffer: Buffer): Promise<number> {
  const { data, info } = await sharp(pngBuffer)
    .resize({
      width: SCAN_LONG_EDGE,
      height: SCAN_LONG_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const channels = info.channels;
  if (!width || !height) return 0;

  const cornerAt = (x: number, y: number): [number, number, number] => {
    const i = (y * width + x) * channels;
    return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0];
  };

  const corners: Array<[number, number, number]> = [
    cornerAt(0, 0),
    cornerAt(width - 1, 0),
    cornerAt(0, height - 1),
    cornerAt(width - 1, height - 1),
  ];
  const bg: [number, number, number] = [
    Math.round(corners.reduce((sum, c) => sum + c[0], 0) / corners.length),
    Math.round(corners.reduce((sum, c) => sum + c[1], 0) / corners.length),
    Math.round(corners.reduce((sum, c) => sum + c[2], 0) / corners.length),
  ];

  const lumas: number[] = [];
  const chroma: number[] = [];
  let foreground = 0;
  let samples = 0;
  const step = 2;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * channels;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const dist = colorDist(r, g, b, bg[0], bg[1], bg[2]);
      const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      lumas.push(luma);
      chroma.push(dist);
      if (dist > 24) foreground += 1;
      samples += 1;
    }
  }

  if (!samples) return 0;

  const fgRatio = foreground / samples;
  const lumaStd = stdDev(lumas);
  const chromaStd = stdDev(chroma);

  // Texto denso: mucho foreground pero poca variación cromática.
  const textLike = fgRatio > 0.2 && chromaStd < 22;
  if (textLike && lumaStd < 0.14) return fgRatio * 0.35;

  return Math.min(1, fgRatio * 0.55 + lumaStd * 0.9 + chromaStd / 90);
}

/** Páginas posteriores a las 4 de marca con contenido visual (máx. 10). */
export async function selectPdfPagesForExtendedImageProbe(
  buffer: Buffer,
  totalPages: number,
): Promise<number[]> {
  if (totalPages <= PROBE_BRAND_PDF_PAGES) return [];

  const scanFrom = PROBE_BRAND_PDF_PAGES + 1;
  const scanTo = Math.min(totalPages, SCAN_PAGE_LIMIT);
  const pageNumbers = Array.from(
    { length: scanTo - scanFrom + 1 },
    (_, index) => scanFrom + index,
  );
  if (!pageNumbers.length) return [];

  const rendered = await renderPdfPagesAt(buffer, pageNumbers, { dpi: SCAN_DPI, concurrency: 8 });
  const scored = await Promise.all(
    rendered.map(async (page) => ({
      pageNumber: page.pageNumber,
      score: await scorePageVisualRichness(page.pngBuffer),
    })),
  );

  return scored
    .filter((row) => row.score >= SCAN_MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, EXTENDED_IMAGE_PAGES_MAX)
    .map((row) => row.pageNumber)
    .sort((a, b) => a - b);
}

export function bboxIoU(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): number {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;
  const ix1 = Math.max(a.x, b.x);
  const iy1 = Math.max(a.y, b.y);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  if (inter <= 0) return 0;
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

export function mergeOtherImageLists<T extends { page: number | null; x: number; y: number; width: number; height: number }>(
  primary: T[],
  extra: T[],
  maxTotal: number,
): T[] {
  const merged = [...primary];
  for (const candidate of extra) {
    if (merged.length >= maxTotal) break;
    const duplicate = merged.some(
      (existing) =>
        existing.page === candidate.page && bboxIoU(existing, candidate) >= 0.4,
    );
    if (!duplicate) merged.push(candidate);
  }
  return merged;
}
