/**
 * Curva base tonal pragmática "tipo Canon" en espacio lineal.
 * Se aplica antes de los sliders del usuario (equivalente simplificado a ProfileToneCurve).
 */

/** Rango HDR lineal mapeado a la LUT 1D (valores >1 conservan headroom). */
export const LINEAR_HDR_MAX = 4.0;

const LUT_SIZE = 1024;

/** Curva con toe suave + hombro en altas (roll-off). */
export function canonLikeBaseCurve(linear: number): number {
  const x = Math.max(0, linear);
  const toe = Math.pow(x, 0.88) * (1.02 + 0.06 * (1 - Math.exp(-x * 3.5)));
  const shoulder = toe / (1 + toe * 0.42);
  return shoulder * 1.08;
}

export function buildBaseProfileLut(): Float32Array {
  const lut = new Float32Array(LUT_SIZE * 4);
  for (let i = 0; i < LUT_SIZE; i += 1) {
    const linearIn = (i / (LUT_SIZE - 1)) * LINEAR_HDR_MAX;
    const out = canonLikeBaseCurve(linearIn);
    lut[i * 4] = out;
    lut[i * 4 + 1] = out;
    lut[i * 4 + 2] = out;
    lut[i * 4 + 3] = 1;
  }
  return lut;
}

/** Empaqueta LUT float32 → Uint16 half-float para textura RGBA16F. */
export function packBaseProfileLutHalf(): Uint16Array {
  const f32 = buildBaseProfileLut();
  const half = new Uint16Array(f32.length);
  for (let i = 0; i < f32.length; i += 1) {
    half[i] = float32ToHalf(f32[i] ?? 0);
  }
  return half;
}

export function applyBaseProfileRgb(r: number, g: number, b: number): [number, number, number] {
  return [
    sampleBaseLut(r),
    sampleBaseLut(g),
    sampleBaseLut(b),
  ];
}

function sampleBaseLut(v: number): number {
  const x = Math.max(0, v);
  const t = Math.min(1, x / LINEAR_HDR_MAX);
  const idx = t * (LUT_SIZE - 1);
  const i0 = Math.floor(idx);
  const i1 = Math.min(LUT_SIZE - 1, i0 + 1);
  const f = idx - i0;
  const a = canonLikeBaseCurve((i0 / (LUT_SIZE - 1)) * LINEAR_HDR_MAX);
  const b = canonLikeBaseCurve((i1 / (LUT_SIZE - 1)) * LINEAR_HDR_MAX);
  return a + (b - a) * f;
}

/** sRGB OETF (display transform). */
export function linearToSrgbChannel(c: number): number {
  const v = Math.max(0, c);
  if (v <= 0.0031308) return v * 12.92;
  return 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

export function linearToSrgbRgb(r: number, g: number, b: number): [number, number, number] {
  return [linearToSrgbChannel(r), linearToSrgbChannel(g), linearToSrgbChannel(b)];
}

/** Convierte float32 lineal a PNG data URL para miniatura de tarjeta. */
export function linearFloatToPreviewDataUrl(rgba: Float32Array, width: number, height: number, profileBase = true): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D no disponible");
  const imageData = ctx.createImageData(width, height);
  const out = imageData.data;
  for (let i = 0; i < width * height; i += 1) {
    const si = i * 4;
    let r = rgba[si] ?? 0;
    let g = rgba[si + 1] ?? 0;
    let b = rgba[si + 2] ?? 0;
    if (profileBase) {
      [r, g, b] = applyBaseProfileRgb(r, g, b);
    }
    [r, g, b] = linearToSrgbRgb(r, g, b);
    out[si] = Math.round(Math.min(1, r) * 255);
    out[si + 1] = Math.round(Math.min(1, g) * 255);
    out[si + 2] = Math.round(Math.min(1, b) * 255);
    out[si + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

/** float32 → IEEE 754 half (float16). */
export function float32ToHalf(val: number): number {
  const floatView = new Float32Array(1);
  const int32View = new Int32Array(floatView.buffer);
  floatView[0] = val;
  const x = int32View[0] ?? 0;
  const bits = (x >> 16) & 0x8000;
  let m = (x >> 12) & 0x07ff;
  let e = (x >> 23) & 0xff;
  if (e < 103) return bits;
  if (e > 142) return bits | 0x7c00;
  if (e < 113) {
    m |= 0x0800;
    m >>= 113 - e;
    return bits | ((m + 0x1000) >> 13);
  }
  return bits | ((((e - 112) << 10) | (m >> 1)) + (m & 1));
}

export function float32ArrayToHalf(rgba: Float32Array): Uint16Array {
  const half = new Uint16Array(rgba.length);
  for (let i = 0; i < rgba.length; i += 1) {
    half[i] = float32ToHalf(rgba[i] ?? 0);
  }
  return half;
}
