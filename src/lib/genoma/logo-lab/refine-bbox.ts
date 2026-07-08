/**
 * Afinado determinista del bbox Gemini en logo-lab.
 * Nivel 2: snap a objetos PDF (vector + XObject). Nivel 1: snap por contraste en el frame.
 */

import sharp from "sharp";
import { configurePdfJsForNodeServer, pdfJsGetDocumentInit } from "@/lib/brain/pdfjs-server";
import {
  bboxOverlapRatioXYXY,
  expandBBoxXYXY,
  unionBBoxXYXY,
  type BBoxXYXY,
} from "@/lib/genoma/ingest/page-vision-pass-bbox";
import {
  enumeratePdfPaintObjectBboxes,
  type PdfPaintObjectRecord,
} from "@/lib/genoma/ingest/page-vision-pdf-vector-walk";

export type LogoLabRefineMethod = "pdf_object" | "contrast" | "seed_only";

export type LogoLabRefineResult = {
  seedBbox: readonly [number, number, number, number];
  refinedBbox: readonly [number, number, number, number];
  method: LogoLabRefineMethod;
  pdfObjectCount: number;
  logoCropPng: Buffer;
};

const SEARCH_PAD = 0.22;
const CONTRAST_PAD = 0.18;
const INK_THRESHOLD = 28;
/** PDFs densos (p. ej. catalogo26) pueden bloquear minutos el paint-walk completo. */
const PDF_PAINT_WALK_TIMEOUT_MS = 12_000;
const MAX_REFINED_PAGE_AREA = 0.14;
const MAX_REFINED_AREA_GROWTH = 3.5;

function bboxArea(b: BBoxXYXY): number {
  return Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
}

/** Rechaza snaps que engullen media página o crecen mucho respecto a la semilla Gemini. */
export function isRefinedBBoxPlausible(seed: BBoxXYXY, refined: BBoxXYXY): boolean {
  const seedArea = bboxArea(seed);
  const refinedArea = bboxArea(refined);
  if (refinedArea > MAX_REFINED_PAGE_AREA) return false;
  if (seedArea > 0 && refinedArea > seedArea * MAX_REFINED_AREA_GROWTH) return false;
  const overlap = bboxOverlapRatioXYXY(refined, seed);
  const dist = centerDistance(refined, seed);
  return overlap >= 0.18 || dist <= 0.07;
}

function bboxIntersects(a: BBoxXYXY, b: BBoxXYXY): boolean {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
}

function bboxCenter(b: BBoxXYXY): [number, number] {
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
}

function centerDistance(a: BBoxXYXY, b: BBoxXYXY): number {
  const [ax, ay] = bboxCenter(a);
  const [bx, by] = bboxCenter(b);
  return Math.hypot(ax - bx, ay - by);
}

function selectPdfObjectCluster(
  objects: PdfPaintObjectRecord[],
  seed: BBoxXYXY,
): BBoxXYXY | null {
  const search = expandBBoxXYXY(seed, SEARCH_PAD);
  const candidates = objects.filter((o) => bboxIntersects(o.bbox, search));
  if (!candidates.length) return null;

  const scored = candidates
    .map((o) => ({
      o,
      score: bboxOverlapRatioXYXY(o.bbox, seed) * 2.5 - centerDistance(o.bbox, seed) * 0.4,
    }))
    .sort((a, b) => b.score - a.score);

  const anchor = scored[0]!.o;
  const cluster = candidates.filter(
    (c) =>
      bboxOverlapRatioXYXY(c.bbox, anchor.bbox) > 0.015 ||
      centerDistance(c.bbox, anchor.bbox) < 0.14,
  );
  const union = unionBBoxXYXY(cluster.map((c) => c.bbox));
  const anchorBox = anchor.bbox;

  let pick: BBoxXYXY | null = null;
  if (union && isRefinedBBoxPlausible(seed, union)) pick = union;
  else if (isRefinedBBoxPlausible(seed, anchorBox)) pick = anchorBox;

  if (!pick) return null;
  if (bboxOverlapRatioXYXY(pick, seed) < 0.04 && centerDistance(pick, seed) > 0.18) return null;
  return pick;
}

function pixelRgb(data: Buffer, width: number, x: number, y: number): [number, number, number, number] {
  const i = (y * width + x) * 4;
  return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0, data[i + 3] ?? 255];
}

function colorDist(a: [number, number, number], b: [number, number, number]): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

function medianRgb(samples: [number, number, number][]): [number, number, number] {
  if (!samples.length) return [255, 255, 255];
  const mid = (arr: number[]) => {
    const sorted = [...arr].sort((x, y) => x - y);
    return sorted[Math.floor(sorted.length / 2)] ?? 0;
  };
  return [
    mid(samples.map((s) => s[0])),
    mid(samples.map((s) => s[1])),
    mid(samples.map((s) => s[2])),
  ];
}

async function snapBboxToInkContrast(
  framePng: Buffer,
  frameWidth: number,
  frameHeight: number,
  seed: BBoxXYXY,
): Promise<BBoxXYXY | null> {
  const expanded = expandBBoxXYXY(seed, CONTRAST_PAD);
  const left = Math.max(0, Math.floor(expanded[0] * frameWidth));
  const top = Math.max(0, Math.floor(expanded[1] * frameHeight));
  const right = Math.min(frameWidth, Math.ceil(expanded[2] * frameWidth));
  const bottom = Math.min(frameHeight, Math.ceil(expanded[3] * frameHeight));
  const cropW = Math.max(1, right - left);
  const cropH = Math.max(1, bottom - top);

  const { data, info } = await sharp(framePng)
    .extract({ left, top, width: cropW, height: cropH })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const border: [number, number, number][] = [];
  for (let x = 0; x < w; x += 1) {
    border.push(pixelRgb(data, w, x, 0).slice(0, 3) as [number, number, number]);
    border.push(pixelRgb(data, w, x, h - 1).slice(0, 3) as [number, number, number]);
  }
  for (let y = 1; y < h - 1; y += 1) {
    border.push(pixelRgb(data, w, 0, y).slice(0, 3) as [number, number, number]);
    border.push(pixelRgb(data, w, w - 1, y).slice(0, 3) as [number, number, number]);
  }
  const bg = medianRgb(border);

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const [r, g, b, a] = pixelRgb(data, w, x, y);
      if (a < 16) continue;
      if (colorDist([r, g, b], bg) >= INK_THRESHOLD) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;

  const pad = 2;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);

  return [
    (left + minX) / frameWidth,
    (top + minY) / frameHeight,
    (left + maxX + 1) / frameWidth,
    (top + maxY + 1) / frameHeight,
  ];
}

async function cropLogoFromFrame(
  framePng: Buffer,
  frameWidth: number,
  frameHeight: number,
  bbox: BBoxXYXY,
): Promise<Buffer> {
  const left = Math.max(0, Math.floor(bbox[0] * frameWidth));
  const top = Math.max(0, Math.floor(bbox[1] * frameHeight));
  const right = Math.min(frameWidth, Math.ceil(bbox[2] * frameWidth));
  const bottom = Math.min(frameHeight, Math.ceil(bbox[3] * frameHeight));
  return sharp(framePng)
    .extract({
      left,
      top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    })
    .png()
    .toBuffer();
}

async function listPdfPaintObjects(buffer: Buffer, pageNumber: number): Promise<PdfPaintObjectRecord[]> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<PdfPaintObjectRecord[]>((resolve) => {
    timeoutId = setTimeout(() => resolve([]), PDF_PAINT_WALK_TIMEOUT_MS);
  });

  const walk = async (): Promise<PdfPaintObjectRecord[]> => {
    const pdfjs = await configurePdfJsForNodeServer();
    const pdf = await pdfjs
      .getDocument(pdfJsGetDocumentInit(buffer) as Parameters<typeof pdfjs.getDocument>[0])
      .promise;
    try {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      return await enumeratePdfPaintObjectBboxes({
        page,
        ops: pdfjs.OPS as Record<string, number | undefined>,
        pageWidth: viewport.width,
        pageHeight: viewport.height,
      });
    } finally {
      await pdf.destroy();
    }
  };

  try {
    return await Promise.race([walk(), timedOut]);
  } catch {
    return [];
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function refineLogoLabBbox(input: {
  pdfBuffer: Buffer;
  pageNumber: number;
  seedBbox: BBoxXYXY;
  framePng: Buffer;
  frameWidth: number;
  frameHeight: number;
}): Promise<LogoLabRefineResult> {
  const seed = input.seedBbox;
  const objects = await listPdfPaintObjects(input.pdfBuffer, input.pageNumber);
  let pdfSnap = selectPdfObjectCluster(objects, seed);
  if (pdfSnap && !isRefinedBBoxPlausible(seed, pdfSnap)) pdfSnap = null;

  let refined: BBoxXYXY = seed;
  let method: LogoLabRefineMethod = "seed_only";

  if (pdfSnap) {
    refined = pdfSnap;
    method = "pdf_object";
  } else {
    const contrastSnap = await snapBboxToInkContrast(
      input.framePng,
      input.frameWidth,
      input.frameHeight,
      seed,
    );
    if (contrastSnap && isRefinedBBoxPlausible(seed, contrastSnap)) {
      refined = contrastSnap;
      method = "contrast";
    }
  }

  const logoCropPng = await cropLogoFromFrame(
    input.framePng,
    input.frameWidth,
    input.frameHeight,
    refined,
  );

  return {
    seedBbox: seed,
    refinedBbox: refined,
    method,
    pdfObjectCount: objects.length,
    logoCropPng,
  };
}
