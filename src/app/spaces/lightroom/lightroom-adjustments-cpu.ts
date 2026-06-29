import type { CurvePoint, DevelopSettings } from "./lightroom-develop-settings";
import { LIGHTROOM_SLIDER_SHADER_REF } from "./lightroom-develop-settings";

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x >= edge1 ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function sliderNorm(v: number): number {
  return v / LIGHTROOM_SLIDER_SHADER_REF;
}

/** Interpola puntos de curva (x,y en 0…1) con spline lineal por tramos. */
export function evaluateCurvePoints(x: number, points: CurvePoint[]): number {
  const px = clamp01(x);
  if (points.length === 0) return px;
  const sorted = [...points].sort((a, b) => a.x - b.x);
  if (px <= sorted[0]!.x) return clamp01(sorted[0]!.y);
  if (px >= sorted[sorted.length - 1]!.x) return clamp01(sorted[sorted.length - 1]!.y);
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (px >= a.x && px <= b.x) {
      const t = b.x === a.x ? 0 : (px - a.x) / (b.x - a.x);
      return clamp01(a.y + t * (b.y - a.y));
    }
  }
  return px;
}

/** Ajuste paramétrico (sombras / oscuros / claros / altas) en espacio 0…1. */
export function applyParametricTone(
  v: number,
  shadows: number,
  darks: number,
  lights: number,
  highlights: number,
): number {
  let out = v;
  const s = sliderNorm(shadows);
  const d = sliderNorm(darks);
  const l = sliderNorm(lights);
  const h = sliderNorm(highlights);

  if (v < 0.25) out += s * (0.25 - v) * 1.35;

  if (v >= 0.12 && v < 0.55) {
    const w = Math.max(0, 1 - Math.abs(v - 0.32) / 0.22);
    out += d * w * 0.55;
  }

  if (v >= 0.4 && v < 0.82) {
    const w = Math.max(0, 1 - Math.abs(v - 0.58) / 0.22);
    out += l * w * 0.55;
  }

  if (v > 0.55) {
    const hiW = smoothstep(0.55, 0.92, v);
    if (h < 0) {
      const pivot = 0.68;
      const t = Math.max(0, v - pivot);
      const compress = Math.abs(h) * 0.65 * hiW;
      const newV = pivot + t / (1 + compress * 5.5);
      out -= (v - newV) * hiW;
    } else if (h > 0) {
      out += h * hiW * (v - 0.55) * 0.75;
    }
  }

  return Math.max(0, Math.min(1.25, out));
}

/** Evalúa curva paramétrica + puntos master/RGB en x∈0…1 (preview UI + LUT). */
export function evaluateToneCurveAt(
  x: number,
  toneCurve: DevelopSettings["toneCurve"],
  channel: "master" | "r" | "g" | "b" = "master",
): number {
  let v = clamp01(x);
  v = applyParametricTone(
    v,
    toneCurve.paramShadows,
    toneCurve.paramDarks,
    toneCurve.paramLights,
    toneCurve.paramHighlights,
  );
  v = evaluateCurvePoints(v, toneCurve.masterPoints);
  if (channel === "master") return clamp01(v);
  return clamp01(evaluateCurvePoints(v, toneCurve.rgbPoints[channel]));
}

export type RgbLut = { r: Uint8Array; g: Uint8Array; b: Uint8Array };

/** Construye LUTs RGB 256 entradas a partir de curva paramétrica + puntos master/RGB. */
export function buildToneCurveLuts(toneCurve: DevelopSettings["toneCurve"]): RgbLut {
  const r = new Uint8Array(256);
  const g = new Uint8Array(256);
  const b = new Uint8Array(256);
  const hasRgbCurve =
    toneCurve.rgbPoints.r.length > 2 ||
    toneCurve.rgbPoints.g.length > 2 ||
    toneCurve.rgbPoints.b.length > 2 ||
    !pointsAreLinear(toneCurve.rgbPoints.r) ||
    !pointsAreLinear(toneCurve.rgbPoints.g) ||
    !pointsAreLinear(toneCurve.rgbPoints.b);

  for (let i = 0; i < 256; i += 1) {
    const v = evaluateToneCurveAt(i / 255, toneCurve, "master");
    const vr = evaluateToneCurveAt(i / 255, toneCurve, "r");
    const vg = evaluateToneCurveAt(i / 255, toneCurve, "g");
    const vb = evaluateToneCurveAt(i / 255, toneCurve, "b");
    if (hasRgbCurve) {
      r[i] = Math.round(clamp01(vr) * 255);
      g[i] = Math.round(clamp01(vg) * 255);
      b[i] = Math.round(clamp01(vb) * 255);
    } else {
      const byte = Math.round(clamp01(v) * 255);
      r[i] = byte;
      g[i] = byte;
      b[i] = byte;
    }
  }
  return { r, g, b };
}

function pointsAreLinear(points: CurvePoint[]): boolean {
  if (points.length !== 2) return false;
  const [a, b] = points;
  return a?.x === 0 && a?.y === 0 && b?.x === 1 && b?.y === 1;
}

/** Empaqueta LUTs RGB en textura 256×1 RGBA8 (R,G,B por píxel). */
export function packRgbLutTextureData(lut: RgbLut): Uint8Array {
  const out = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i += 1) {
    out[i * 4] = lut.r[i] ?? 0;
    out[i * 4 + 1] = lut.g[i] ?? 0;
    out[i * 4 + 2] = lut.b[i] ?? 0;
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** Índices de canal HSL alineados con el shader (8 canales). */
export const HSL_CHANNEL_HUE_CENTERS = [0, 30, 55, 90, 165, 210, 275, 320] as const;

export function packHslUniforms(hsl: DevelopSettings["hsl"]): {
  hue: Float32Array;
  sat: Float32Array;
  lum: Float32Array;
} {
  const channels = ["red", "orange", "yellow", "green", "aqua", "blue", "purple", "magenta"] as const;
  const hue = new Float32Array(8);
  const sat = new Float32Array(8);
  const lum = new Float32Array(8);
  channels.forEach((ch, i) => {
    hue[i] = (hsl[ch]?.hue ?? 0) / 100;
    sat[i] = (hsl[ch]?.saturation ?? 0) / 100;
    lum[i] = (hsl[ch]?.luminance ?? 0) / 100;
  });
  return { hue, sat, lum };
}

export function packBasicUniforms(basic: DevelopSettings["basic"]): Float32Array {
  return new Float32Array([
    basic.temp / 100,
    basic.tint / 100,
    basic.exposure / 100,
    basic.contrast / 100,
    basic.highlights / 100,
    basic.shadows / 100,
    basic.whites / 100,
    basic.blacks / 100,
    basic.texture / 100,
    basic.clarity / 100,
    basic.dehaze / 100,
    basic.vibrance / 100,
    basic.saturation / 100,
  ]);
}

export function packDetailUniforms(detail: DevelopSettings["detail"], texelSize: [number, number]): Float32Array {
  return new Float32Array([
    detail.sharpenAmount / 100,
    detail.sharpenRadius / 100,
    detail.sharpenDetail / 100,
    detail.sharpenMasking / 100,
    detail.noiseLuminance / 100,
    detail.noiseColor / 100,
    texelSize[0],
    texelSize[1],
  ]);
}
