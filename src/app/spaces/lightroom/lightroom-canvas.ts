import type { RawImageData, RawPixelData } from "libraw-wasm";

/** Convierte píxeles RGB de LibRaw a ImageData 8-bit para canvas. */
export function librawRgbToImageData(image: RawImageData): ImageData {
  const { width, height, colors, bits, data } = image;
  if (colors !== 3) {
    throw new Error(`Solo se admite RGB (3 canales); recibido: ${colors}`);
  }
  const out = new Uint8ClampedArray(width * height * 4);
  if (bits === 8) {
    fillRgb8(out, data as Uint8Array, width, height);
  } else if (bits === 16) {
    fillRgb16(out, data as Uint16Array, width, height);
  } else {
    throw new Error(`Profundidad de bits no soportada: ${bits}`);
  }
  return new ImageData(out, width, height);
}

function fillRgb8(out: Uint8ClampedArray, rgb: Uint8Array, width: number, height: number) {
  const pixels = width * height;
  for (let i = 0; i < pixels; i += 1) {
    const si = i * 3;
    const di = i * 4;
    out[di] = rgb[si] ?? 0;
    out[di + 1] = rgb[si + 1] ?? 0;
    out[di + 2] = rgb[si + 2] ?? 0;
    out[di + 3] = 255;
  }
}

function fillRgb16(out: Uint8ClampedArray, rgb: Uint16Array, width: number, height: number) {
  const pixels = width * height;
  for (let i = 0; i < pixels; i += 1) {
    const si = i * 3;
    const di = i * 4;
    out[di] = scale16To8(rgb[si] ?? 0);
    out[di + 1] = scale16To8(rgb[si + 1] ?? 0);
    out[di + 2] = scale16To8(rgb[si + 2] ?? 0);
    out[di + 3] = 255;
  }
}

/** Escala 16-bit lineal a 8-bit display (÷256, estándar LibRaw 8-bit output). */
export function scale16To8(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v / 256)));
}

export type LibrawLinearScale = {
  /** Nivel blanco LibRaw (solo escala; sin restar black). */
  whiteLevel?: number;
};

/** Escala 16-bit LibRaw → float lineal 0…1 (LibRaw ya aplica black level internamente). */
const LINEAR_SCALE_16 = 1 / 65535;

function linearScaleFromLibrawMeta(scale?: LibrawLinearScale): number {
  if (!scale?.whiteLevel || scale.whiteLevel <= 0) return LINEAR_SCALE_16;
  /** Solo escala por blanco; no restar black (evita doble sustracción → imagen de puntos). */
  return 1 / scale.whiteLevel;
}

/** Convierte RGB LibRaw 16-bit lineal a RGBA float32 sin clip (headroom HDR). */
export function librawRgbToLinearFloat(
  image: RawImageData,
  scale?: LibrawLinearScale,
): {
  data: Float32Array;
  width: number;
  height: number;
} {
  const { width, height, colors, bits, data } = image;
  if (colors !== 3) {
    throw new Error(`Solo se admite RGB (3 canales); recibido: ${colors}`);
  }
  const out = new Float32Array(width * height * 4);
  if (bits === 16) {
    const rgb = data as Uint16Array;
    const invMax = linearScaleFromLibrawMeta(scale);
    for (let i = 0; i < width * height; i += 1) {
      const si = i * 3;
      const di = i * 4;
      out[di] = (rgb[si] ?? 0) * invMax;
      out[di + 1] = (rgb[si + 1] ?? 0) * invMax;
      out[di + 2] = (rgb[si + 2] ?? 0) * invMax;
      out[di + 3] = 1;
    }
  } else if (bits === 8) {
    fillRgb8Linear(out, data as Uint8Array, width, height);
  } else {
    throw new Error(`Profundidad de bits no soportada: ${bits}`);
  }
  return { data: out, width, height };
}

function fillRgb8Linear(out: Float32Array, rgb: Uint8Array, width: number, height: number) {
  const pixels = width * height;
  for (let i = 0; i < pixels; i += 1) {
    const si = i * 3;
    const di = i * 4;
    out[di] = srgb8ToLinear(rgb[si] ?? 0);
    out[di + 1] = srgb8ToLinear(rgb[si + 1] ?? 0);
    out[di + 2] = srgb8ToLinear(rgb[si + 2] ?? 0);
    out[di + 3] = 1;
  }
}

function srgb8ToLinear(v: number): number {
  const c = v / 255;
  if (c <= 0.04045) return c / 12.92;
  return Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Escala el pico de la escena a `targetPeak` para que altas luces entren en el rango HDR del shader. */
export function normalizeLinearScenePeak(rgba: Float32Array, targetPeak = 1.0): void {
  let peak = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    peak = Math.max(peak, rgba[i] ?? 0, rgba[i + 1] ?? 0, rgba[i + 2] ?? 0);
  }
  if (peak <= 1e-8) return;
  const gain = targetPeak / peak;
  if (Math.abs(gain - 1) < 1e-5) return;
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = (rgba[i] ?? 0) * gain;
    rgba[i + 1] = (rgba[i + 1] ?? 0) * gain;
    rgba[i + 2] = (rgba[i + 2] ?? 0) * gain;
  }
}

/** Convierte ImageData sRGB 8-bit a RGBA float lineal. */
export function imageDataToLinearFloat(imageData: ImageData): Float32Array {
  const { width, height, data } = imageData;
  const out = new Float32Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const si = i * 4;
    const di = si;
    out[di] = srgb8ToLinear(data[si] ?? 0);
    out[di + 1] = srgb8ToLinear(data[si + 1] ?? 0);
    out[di + 2] = srgb8ToLinear(data[si + 2] ?? 0);
    out[di + 3] = 1;
  }
  return out;
}

export function imageDataToPngDataUrl(imageData: ImageData): string {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D no disponible");
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("No se pudo leer el blob"));
    reader.readAsDataURL(blob);
  });
}

export async function decodeNativeImageFile(file: File): Promise<ImageData> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D no disponible");
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    return imageData;
  } finally {
    bitmap.close();
  }
}

/** Expuesto para tests unitarios. */
export function packRgb8Sample(r: number, g: number, b: number): Uint8Array {
  return new Uint8Array([r, g, b]);
}

export type { RawPixelData };
