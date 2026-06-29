import type { LightroomSlider } from "./lightroom-develop-settings";
import { LIGHTROOM_SLIDER_MAX, LIGHTROOM_SLIDER_MIN, LIGHTROOM_SLIDER_SHADER_REF } from "./lightroom-develop-settings";

const EPS = 1e-6;

/** Promedia ventana (2*radius+1)² en RGB lineal camera-native (pre-WB). */
export function sampleLinearWindow(
  rgba: Float32Array,
  width: number,
  height: number,
  normX: number,
  normY: number,
  radius = 2,
): { r: number; g: number; b: number } | null {
  if (width <= 0 || height <= 0) return null;
  const cx = Math.round(clamp01(normX) * (width - 1));
  const cy = Math.round(clamp01(normY) * (height - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const px = cx + dx;
      const py = cy + dy;
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      const i = (py * width + px) * 4;
      r += rgba[i] ?? 0;
      g += rgba[i + 1] ?? 0;
      b += rgba[i + 2] ?? 0;
      n += 1;
    }
  }
  if (n === 0) return null;
  return { r: r / n, g: g / n, b: b / n };
}

/** Multiplicadores WB para neutralizar el píxel (g como referencia). */
export function wbMultipliersFromLinearRgb(r: number, g: number, b: number): { mR: number; mG: number; mB: number } {
  if (r < EPS || g < EPS || b < EPS) return { mR: 1, mG: 1, mB: 1 };
  return { mR: g / r, mG: 1, mB: g / b };
}

/** Espejo de applyWhiteBalance del shader (temp/tint en −100…+140). */
export function wbMultipliersFromSliders(temp: number, tint: number): { mR: number; mG: number; mB: number } {
  const t = (temp / LIGHTROOM_SLIDER_SHADER_REF) * 0.35;
  const g = (tint / LIGHTROOM_SLIDER_SHADER_REF) * 0.25;
  return {
    mR: (1 + t) * (1 - g * 0.35),
    mG: 1 + g,
    mB: (1 - t) * (1 + g * 0.35),
  };
}

export function applyWbMultipliers(r: number, g: number, b: number, mR: number, mG: number, mB: number) {
  return { r: r * mR, g: g * mG, b: b * mB };
}

/** Convierte multiplicadores objetivo → sliders UI (búsqueda sobre el modelo del shader). */
export function wbSlidersFromMultipliers(
  mR: number,
  mG: number,
  mB: number,
): { temp: LightroomSlider; tint: LightroomSlider } {
  let bestTemp = 0;
  let bestTint = 0;
  let bestErr = Infinity;
  for (let temp = LIGHTROOM_SLIDER_MIN; temp <= LIGHTROOM_SLIDER_MAX; temp += 1) {
    for (let tint = LIGHTROOM_SLIDER_MIN; tint <= LIGHTROOM_SLIDER_MAX; tint += 1) {
      const m = wbMultipliersFromSliders(temp, tint);
      const err =
        (Math.log(m.mR / Math.max(mR, EPS)) ** 2 +
          Math.log(m.mG / Math.max(mG, EPS)) ** 2 +
          Math.log(m.mB / Math.max(mB, EPS)) ** 2) as number;
      if (err < bestErr) {
        bestErr = err;
        bestTemp = temp;
        bestTint = tint;
      }
    }
  }
  return { temp: bestTemp, tint: bestTint };
}

/** Pipeline cuentagotas: muestra lineal → temp/tint. */
export function wbSlidersFromLinearSample(r: number, g: number, b: number): { temp: LightroomSlider; tint: LightroomSlider } {
  const { mR, mG, mB } = wbMultipliersFromLinearRgb(r, g, b);
  return wbSlidersFromMultipliers(mR, mG, mB);
}

/**
 * Mapea clic de pantalla → norm (0…1) sobre el canvas con object-fit: contain.
 * Devuelve null si el clic cae en letterboxing.
 */
export function pointerToImageNorm(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect();
  const cw = canvas.width;
  const ch = canvas.height;
  if (!cw || !ch || rect.width <= 0 || rect.height <= 0) return null;

  const scale = Math.min(rect.width / cw, rect.height / ch);
  const displayW = cw * scale;
  const displayH = ch * scale;
  const offsetX = rect.left + (rect.width - displayW) / 2;
  const offsetY = rect.top + (rect.height - displayH) / 2;

  const x = (clientX - offsetX) / displayW;
  const y = (clientY - offsetY) / displayH;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x: clamp01(x), y: clamp01(y) };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
