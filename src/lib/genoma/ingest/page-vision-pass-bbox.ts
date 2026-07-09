/**
 * Bbox unificado [x1, y1, x2, y2] normalizado 0–1.
 * Branded type para impedir mezcla con legacy xywh en compilación.
 */

import { z } from "zod";

declare const bboxXYXYBrand: unique symbol;

/** Esquinas opuestas normalizadas; invariante x2 > x1 && y2 > y1. */
export type BBoxXYXY = readonly [number, number, number, number] & {
  readonly [bboxXYXYBrand]: true;
};

const BBOX_EPS = 1e-6;

function brandBBoxXYXY(tuple: readonly [number, number, number, number]): BBoxXYXY {
  return tuple as BBoxXYXY;
}

export function bboxAreaXYXY(bbox: BBoxXYXY): number {
  return (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]);
}

export function bboxOverlapRatioXYXY(a: BBoxXYXY, b: BBoxXYXY): number {
  const ix1 = Math.max(a[0], b[0]);
  const iy1 = Math.max(a[1], b[1]);
  const ix2 = Math.min(a[2], b[2]);
  const iy2 = Math.min(a[3], b[3]);
  if (ix2 <= ix1 + BBOX_EPS || iy2 <= iy1 + BBOX_EPS) return 0;
  const intersection = (ix2 - ix1) * (iy2 - iy1);
  const minArea = Math.min(bboxAreaXYXY(a), bboxAreaXYXY(b));
  if (minArea <= BBOX_EPS) return 0;
  return intersection / minArea;
}

/** Expande bbox normalizado por ratio relativo al span (p. ej. 0.18 = +18%). */
export function expandBBoxXYXY(bbox: BBoxXYXY, padRatio: number): BBoxXYXY {
  const spanW = bbox[2] - bbox[0];
  const spanH = bbox[3] - bbox[1];
  const padX = spanW * padRatio;
  const padY = spanH * padRatio;
  return brandBBoxXYXY([
    Math.max(0, bbox[0] - padX),
    Math.max(0, bbox[1] - padY),
    Math.min(1, bbox[2] + padX),
    Math.min(1, bbox[3] + padY),
  ]);
}

export function unionBBoxXYXY(boxes: readonly BBoxXYXY[]): BBoxXYXY | null {
  if (!boxes.length) return null;
  let x1 = 1;
  let y1 = 1;
  let x2 = 0;
  let y2 = 0;
  for (const b of boxes) {
    x1 = Math.min(x1, b[0]);
    y1 = Math.min(y1, b[1]);
    x2 = Math.max(x2, b[2]);
    y2 = Math.max(y2, b[3]);
  }
  if (x2 <= x1 + BBOX_EPS || y2 <= y1 + BBOX_EPS) return null;
  return brandBBoxXYXY([x1, y1, x2, y2]);
}

/** Convierte legacy [x, y, width, height] → BBoxXYXY en la frontera del pipeline antiguo. */
export function convertLegacyXYWHToXYXY(
  x: number,
  y: number,
  width: number,
  height: number,
): BBoxXYXY | null {
  if (width <= 0 || height <= 0) return null;
  if (x < 0 || y < 0 || x + width > 1 + BBOX_EPS || y + height > 1 + BBOX_EPS) return null;
  return brandBBoxXYXY([x, y, x + width, y + height]);
}

/** Escala Gemini 0–1000 → 0–1 cuando el máximo lo indica (p. ej. 864, no 1.05). */
export const GEMINI_BBOX_SCALE_MAX = 1000;
const GEMINI_BBOX_SCALE_MIN = 10;

/** Semilla demasiado pequeña para rescatar logo (franja fina / coordenada corrupta). */
export const LOGO_BBOX_MIN_AREA = 0.0015;
export const LOGO_BBOX_MIN_SPAN = 0.005;

export function isViableLogoHarvestBbox(bbox: BBoxXYXY | readonly [number, number, number, number]): boolean {
  const width = bbox[2] - bbox[0];
  const height = bbox[3] - bbox[1];
  if (width < LOGO_BBOX_MIN_SPAN || height < LOGO_BBOX_MIN_SPAN) return false;
  return bboxAreaXYXY(bbox as BBoxXYXY) >= LOGO_BBOX_MIN_AREA;
}

function shouldScaleGeminiBboxUniform(nums: number[]): boolean {
  const max = Math.max(...nums);
  if (max <= 1.001 || max > GEMINI_BBOX_SCALE_MAX) return false;
  if (!nums.every((n) => n >= GEMINI_BBOX_SCALE_MIN)) return false;
  return true;
}

/** Repara tuplas ya guardadas tras un /1000 global sobre escala mixta. */
function repairDividedScaleCorruption(nums: number[]): number[] {
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  if (max < 1 && min > 0 && min < 0.01) {
    return nums.map((n) => n * GEMINI_BBOX_SCALE_MAX);
  }
  return nums.map((n) => (n > 0 && n < 0.01 ? n * GEMINI_BBOX_SCALE_MAX : n));
}

function coalesceAmbiguousScale(nums: number[]): number[] {
  const hasHigh = nums.some((n) => n >= GEMINI_BBOX_SCALE_MIN);
  if (!hasHigh) return nums;
  return nums.map((n) => {
    if (n >= GEMINI_BBOX_SCALE_MIN) return n;
    if (n > 1.001 && n < GEMINI_BBOX_SCALE_MIN) return n * 100;
    if (n > 0 && n <= 1.001) {
      const upscaled = n * 100;
      if (upscaled >= GEMINI_BBOX_SCALE_MIN) return upscaled;
    }
    return n;
  });
}

/**
 * Escala 0–1000 → 0–1.
 * Si la tupla mezcla ejes ya normalizados (≤1) con otros en 0–1000, solo divide los >1.
 */
function scaleGeminiBboxComponents(nums: number[]): number[] {
  const max = Math.max(...nums);
  if (max <= 1.001 || max > GEMINI_BBOX_SCALE_MAX) return nums;

  const hasUnitInterval = nums.some((n) => n <= 1.001);
  const hasScale1000 = nums.some((n) => n >= GEMINI_BBOX_SCALE_MIN);

  if (hasUnitInterval && hasScale1000) {
    return nums.map((n) =>
      n > 1.001 && n <= GEMINI_BBOX_SCALE_MAX ? n / GEMINI_BBOX_SCALE_MAX : n,
    );
  }

  if (shouldScaleGeminiBboxUniform(nums)) {
    return nums.map((n) => n / GEMINI_BBOX_SCALE_MAX);
  }

  if (nums.some((n) => n > 1.001)) {
    return nums.map((n) =>
      n > 1.001 && n <= GEMINI_BBOX_SCALE_MAX ? n / GEMINI_BBOX_SCALE_MAX : n,
    );
  }

  return nums;
}

function preprocessGeminiBboxTuple(nums: number[]): number[] {
  return scaleGeminiBboxComponents(coalesceAmbiguousScale(repairDividedScaleCorruption(nums)));
}

function tryParseXyxy(a: number, b: number, c: number, d: number): BBoxXYXY | null {
  if (a < 0 || b < 0 || c > 1 + BBOX_EPS || d > 1 + BBOX_EPS) return null;
  if (c <= a + BBOX_EPS || d <= b + BBOX_EPS) return null;
  return brandBBoxXYXY([a, b, c, d]);
}

/** Cuando xyxy y xywh son válidos, elige xywh si la tupla encaja el patrón w/h del modelo. */
export function shouldPreferXYWHOverXYXY(
  a: number,
  b: number,
  c: number,
  d: number,
): boolean {
  const spanW = c - a;
  const spanH = d - b;
  if (c <= a + BBOX_EPS || d <= b + BBOX_EPS) return true;
  if (b > 0.9 && d < b - BBOX_EPS) return true;
  // Patrón recurrente: el modelo manda [x,y,w,h] pero parece xyxy → franja fina (span ≪ c o d).
  if (spanH < 0.055 && d > spanH + BBOX_EPS) return true;
  if (spanW < 0.055 && c > spanW + BBOX_EPS) return true;
  return false;
}

/** Diagnóstico logo-lab: clasifica tupla cruda del audit. */
export function classifyModelBboxTuple(
  raw: readonly [number, number, number, number],
): "xyxy_literal" | "xywh_legacy" | "degenerate" {
  const [a, b, c, d] = raw;
  const asXyxy = tryParseXyxy(a, b, c, d);
  const asXywh = convertLegacyXYWHToXYXY(a, b, c, d);
  if (!asXyxy && !asXywh) return "degenerate";
  if (asXyxy && asXywh && shouldPreferXYWHOverXYXY(a, b, c, d)) return "xywh_legacy";
  if (!asXyxy && asXywh) return "xywh_legacy";
  return "xyxy_literal";
}

/** Contrato del modelo: [x1, y1, x2, y2] normalizado. Desambigua xywh legacy cuando aplica. */
export function normalizeModelBboxTuple(
  raw: unknown,
): { ok: true; bbox: BBoxXYXY } | { ok: false; reason: string } {
  if (!Array.isArray(raw) || raw.length !== 4) {
    return { ok: false, reason: "bbox_not_tuple4" };
  }
  let nums = raw.map((v) => Number(v));
  if (nums.some((n) => !Number.isFinite(n))) {
    return { ok: false, reason: "bbox_non_numeric" };
  }
  if (
    nums.some((n) => n > 1.001 && n < GEMINI_BBOX_SCALE_MIN) &&
    !nums.some((n) => n >= GEMINI_BBOX_SCALE_MIN)
  ) {
    return { ok: false, reason: "bbox_out_of_range" };
  }
  nums = preprocessGeminiBboxTuple(nums);
  if (nums.some((n) => n > 1 + BBOX_EPS)) {
    return { ok: false, reason: "bbox_out_of_range" };
  }
  const [a, b, c, d] = nums as [number, number, number, number];

  const asXyxy = tryParseXyxy(a, b, c, d);
  const asXywh = convertLegacyXYWHToXYXY(a, b, c, d);

  if (asXyxy && asXywh) {
    if (shouldPreferXYWHOverXYXY(a, b, c, d)) return { ok: true, bbox: asXywh };
    return { ok: true, bbox: asXyxy };
  }
  if (asXywh) return { ok: true, bbox: asXywh };
  if (asXyxy) return { ok: true, bbox: asXyxy };

  if (a < 0 || b < 0 || c > 1 + BBOX_EPS || d > 1 + BBOX_EPS) {
    return { ok: false, reason: "bbox_out_of_range" };
  }
  return { ok: false, reason: "bbox_degenerate" };
}

/** Reinterpreta tupla del audit (p. ej. cacheada pre-fix) con la misma lógica de ingesta. */
export function resolveAuditBbox(
  stored: readonly [number, number, number, number],
): BBoxXYXY {
  const parsed = normalizeModelBboxTuple(stored);
  if (parsed.ok) return parsed.bbox;
  return brandBBoxXYXY([stored[0], stored[1], stored[2], stored[3]]);
}

export function parseRawBBoxTuple(
  raw: unknown,
): { ok: true; bbox: BBoxXYXY } | { ok: false; reason: string } {
  return normalizeModelBboxTuple(raw);
}

/**
 * Heurística documentada: tupla que encaja como [x, y, w, h] legacy (p. ej. pie de página).
 * Úsala en tests y en la frontera de migración — no en el contrato crudo salvo bbox_degenerate.
 */
export function suspectedLegacyXYWH(raw: readonly [number, number, number, number]): boolean {
  const [a, b, c, d] = raw;
  if (c <= a + BBOX_EPS || d <= b + BBOX_EPS) return true;
  const asXywh = convertLegacyXYWHToXYXY(a, b, c, d);
  if (!asXywh) return false;
  return shouldPreferXYWHOverXYXY(a, b, c, d);
}

/** Una sola pasada — fallos vía ctx.addIssue + z.NEVER, sin throw. */
export const bboxXYXYSchema = z
  .tuple([z.number(), z.number(), z.number(), z.number()])
  .transform((tuple, ctx) => {
    const parsed = parseRawBBoxTuple(tuple);
    if (!parsed.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: parsed.reason });
      return z.NEVER;
    }
    return parsed.bbox;
  });
