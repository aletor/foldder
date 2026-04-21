/**
 * Degradado raster PhotoRoom (lineal + radial), reaplicable desde instantánea base.
 * Colores: trazo → relleno. En máscara: degradado solo entre blanco y negro.
 */

import { normalizeHexColor } from "./extract-document-colors";

export type PhotoRasterGradientTarget = "layer" | "mask";

export type PhotoRasterGradientStyle = "linear" | "radial";

export type Rgba = { r: number; g: number; b: number; a: number };

export type PhotoRasterGradientStop = {
  t: number;
  color: Rgba;
};

export type PhotoRasterGradientParams = {
  stops: PhotoRasterGradientStop[];
  opacity01: number;
  reverse: boolean;
  target: PhotoRasterGradientTarget;
};

/** Persistido en la capa / máscara para re-editar desde el panel Propiedades. */
export type PhotoRasterGradientPersistV1 = {
  surface: PhotoRasterGradientTarget;
  baseSnapshotUrl: string;
  basePixelW: number;
  basePixelH: number;
  /** Referencia del arrastre inicial (mundo); ángulo y escala se calculan respecto al punto medio. */
  startWorld: Point2;
  endWorld: Point2;
  style: PhotoRasterGradientStyle;
  angleDeg: number;
  scalePct: number;
  reverse: boolean;
  opacityPct: number;
};

export type PhotoGradientRuntimeSession = PhotoRasterGradientPersistV1 & { objectId: string };

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function luminanceFromRgb(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export function hexToRgba(hex: string, alpha = 1): Rgba {
  const n = normalizeHexColor(hex.trim()) ?? "#000000";
  const m = n.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  let a = alpha;
  if (m.length >= 8) {
    a *= parseInt(m.slice(6, 8), 16) / 255;
  }
  return { r, g, b, a: clamp01(a) };
}

/** Hex usable en canvas (fallback si «none»). */
export function gradientHexFromStrokeFill(strokeHex: string, fillHex: string): { startHex: string; endHex: string } {
  const s = strokeHex === "none" ? "#000000" : normalizeHexColor(strokeHex) ?? "#000000";
  const f = fillHex === "none" ? "#ffffff" : normalizeHexColor(fillHex) ?? "#ffffff";
  return { startHex: s, endHex: f };
}

/** Máscara: solo blanco o negro según luminancia del color. */
export function maskGradientBinaryGrays(startHex: string, endHex: string): { startGray: number; endGray: number } {
  const s = hexToRgba(startHex, 1);
  const e = hexToRgba(endHex, 1);
  const ls = luminanceFromRgb(s.r, s.g, s.b);
  const le = luminanceFromRgb(e.r, e.g, e.b);
  return {
    startGray: ls >= 127.5 ? 255 : 0,
    endGray: le >= 127.5 ? 255 : 0,
  };
}

export interface Point2 {
  x: number;
  y: number;
}

export function gradientDragToInitialAngleScale(startWorld: Point2, endWorld: Point2): { angleDeg: number; scalePct: number } {
  const dx = endWorld.x - startWorld.x;
  const dy = endWorld.y - startWorld.y;
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  return { angleDeg, scalePct: 100 };
}

/** Extremos efectivos del degradado lineal (mundo) a partir del arrastre de referencia + ángulo + escala. */
export function computeLinearWorldEndpoints(
  startWorld: Point2,
  endWorld: Point2,
  angleDeg: number,
  scalePct: number,
): { startWorld: Point2; endWorld: Point2 } {
  const cx = (startWorld.x + endWorld.x) / 2;
  const cy = (startWorld.y + endWorld.y) / 2;
  const dragHalf = Math.hypot(endWorld.x - startWorld.x, endWorld.y - startWorld.y) / 2;
  const halfLen = Math.max(1e-9, dragHalf * (scalePct / 100));
  const rad = (angleDeg * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  return {
    startWorld: { x: cx - ux * halfLen, y: cy - uy * halfLen },
    endWorld: { x: cx + ux * halfLen, y: cy + uy * halfLen },
  };
}

/** Centro = startLocal, radio = |endLocal - startLocal| × scalePct/100. */
export function computeRadialLocalParams(
  startL: Point2,
  endL: Point2,
  scalePct: number,
): { cx: number; cy: number; r: number } {
  const baseR = Math.hypot(endL.x - startL.x, endL.y - startL.y);
  const r = Math.max(1e-9, baseR * (scalePct / 100));
  return { cx: startL.x, cy: startL.y, r };
}

export function applyLinearGradientToImageData(
  data: ImageData,
  cw: number,
  ch: number,
  pixelToLocal: (ix: number, iy: number) => Point2,
  startL: Point2,
  endL: Point2,
  params: PhotoRasterGradientParams,
  startHex: string,
  endHex: string,
): void {
  const dx = endL.x - startL.x;
  const dy = endL.y - startL.y;
  const lenSq = dx * dx + dy * dy;
  const invLenSq = lenSq > 1e-18 ? 1 / lenSq : 0;

  const sRgb = hexToRgba(startHex, 1);
  const eRgb = hexToRgba(endHex, 1);
  const op = clamp01(params.opacity01);
  const { reverse, target } = params;

  const d = data.data;
  const maskBw = target === "mask" ? maskGradientBinaryGrays(startHex, endHex) : null;

  for (let iy = 0; iy < ch; iy++) {
    for (let ix = 0; ix < cw; ix++) {
      const P = pixelToLocal(ix, iy);
      let t = ((P.x - startL.x) * dx + (P.y - startL.y) * dy) * invLenSq;
      t = clamp01(t);
      if (reverse) t = 1 - t;

      const i = (iy * cw + ix) * 4;

      if (target === "mask" && maskBw) {
        const gv = lerp(maskBw.startGray, maskBw.endGray, t);
        const gray = (d[i]! + d[i + 1]! + d[i + 2]!) / 3;
        const out = lerp(gray, gv, op);
        const u8 = Math.max(0, Math.min(255, Math.round(out)));
        d[i] = u8;
        d[i + 1] = u8;
        d[i + 2] = u8;
        d[i + 3] = 255;
      } else {
        const gr = lerp(sRgb.r, eRgb.r, t);
        const gg = lerp(sRgb.g, eRgb.g, t);
        const gb = lerp(sRgb.b, eRgb.b, t);
        const or = d[i]!;
        const og = d[i + 1]!;
        const ob = d[i + 2]!;
        const oa = d[i + 3]!;
        d[i] = Math.round(lerp(or, gr, op));
        d[i + 1] = Math.round(lerp(og, gg, op));
        d[i + 2] = Math.round(lerp(ob, gb, op));
        d[i + 3] = oa;
      }
    }
  }
}

export function applyRadialGradientToImageData(
  data: ImageData,
  cw: number,
  ch: number,
  pixelToLocal: (ix: number, iy: number) => Point2,
  cx: number,
  cy: number,
  r: number,
  params: PhotoRasterGradientParams,
  startHex: string,
  endHex: string,
): void {
  const sRgb = hexToRgba(startHex, 1);
  const eRgb = hexToRgba(endHex, 1);
  const op = clamp01(params.opacity01);
  const { reverse, target } = params;
  const d = data.data;
  const maskBw = target === "mask" ? maskGradientBinaryGrays(startHex, endHex) : null;
  const invR = r > 1e-18 ? 1 / r : 0;

  for (let iy = 0; iy < ch; iy++) {
    for (let ix = 0; ix < cw; ix++) {
      const P = pixelToLocal(ix, iy);
      let t = Math.hypot(P.x - cx, P.y - cy) * invR;
      t = clamp01(t);
      if (reverse) t = 1 - t;
      const i = (iy * cw + ix) * 4;

      if (target === "mask" && maskBw) {
        const gv = lerp(maskBw.startGray, maskBw.endGray, t);
        const gray = (d[i]! + d[i + 1]! + d[i + 2]!) / 3;
        const out = lerp(gray, gv, op);
        const u8 = Math.max(0, Math.min(255, Math.round(out)));
        d[i] = u8;
        d[i + 1] = u8;
        d[i + 2] = u8;
        d[i + 3] = 255;
      } else {
        const gr = lerp(sRgb.r, eRgb.r, t);
        const gg = lerp(sRgb.g, eRgb.g, t);
        const gb = lerp(sRgb.b, eRgb.b, t);
        const or = d[i]!;
        const og = d[i + 1]!;
        const ob = d[i + 2]!;
        const oa = d[i + 3]!;
        d[i] = Math.round(lerp(or, gr, op));
        d[i + 1] = Math.round(lerp(og, gg, op));
        d[i + 2] = Math.round(lerp(ob, gb, op));
        d[i + 3] = oa;
      }
    }
  }
}

export function twoStopGradientParams(
  opacity01: number,
  reverse: boolean,
  target: PhotoRasterGradientTarget,
): PhotoRasterGradientParams {
  return {
    stops: [
      { t: 0, color: { r: 0, g: 0, b: 0, a: 1 } },
      { t: 1, color: { r: 255, g: 255, b: 255, a: 1 } },
    ],
    opacity01,
    reverse,
    target,
  };
}
