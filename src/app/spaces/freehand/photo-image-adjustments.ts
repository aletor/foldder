/**
 * Ajustes de imagen PhotoRoom (brillo/contraste, saturación, niveles), tipo Photoshop.
 * Horneado destructivo en píxeles, reaplicable desde una instantánea base (`baseSnapshotUrl`),
 * por lo que mover los sliders nunca acumula: siempre se recalcula desde el original.
 */

/** Niveles tonales (entrada/gamma/salida), por canal idéntico. */
export type PhotoLevels = {
  /** Punto negro de entrada 0..254. */
  inBlack: number;
  /** Punto blanco de entrada 1..255. */
  inWhite: number;
  /** Gamma de medios tonos 0.1..9.99 (1 = neutro; >1 aclara). */
  gamma: number;
  /** Punto negro de salida 0..255. */
  outBlack: number;
  /** Punto blanco de salida 0..255. */
  outWhite: number;
};

/**
 * Selección PhotoRoom (marquee) en coordenadas de mundo, persistida para limitar el ajuste
 * a la región seleccionada y poder re-editarlo. Estructuralmente compatible con Rect/Point/Ellipse.
 */
export type PhotoAdjSelection = {
  rects: { x: number; y: number; w: number; h: number }[];
  polys: { x: number; y: number }[][];
  ellipses: { cx: number; cy: number; rx: number; ry: number }[];
  featherPx: number;
};

export type PhotoImageAdjustments = {
  /** Instantánea de la imagen original (data URL) sobre la que se rehornea cada cambio. */
  baseSnapshotUrl: string;
  /** Brillo -100..100 (0 = neutro). */
  brightness: number;
  /** Contraste -100..100 (0 = neutro). */
  contrast: number;
  /** Saturación -100..100 (-100 = escala de grises, +100 = ×2). */
  saturation: number;
  levels: PhotoLevels;
  /** Si existe, el ajuste se aplica solo dentro de esta selección (resto = original). */
  selection?: PhotoAdjSelection | null;
};

export const NEUTRAL_LEVELS: PhotoLevels = {
  inBlack: 0,
  inWhite: 255,
  gamma: 1,
  outBlack: 0,
  outWhite: 255,
};

export function defaultPhotoImageAdjustments(baseSnapshotUrl: string): PhotoImageAdjustments {
  return {
    baseSnapshotUrl,
    brightness: 0,
    contrast: 0,
    saturation: 0,
    levels: { ...NEUTRAL_LEVELS },
  };
}

type AdjustmentValues = Pick<
  PhotoImageAdjustments,
  "brightness" | "contrast" | "saturation" | "levels"
>;

/** True si todos los controles están en su valor neutro (no modifica la imagen). */
export function isPhotoImageAdjustmentsNeutral(a: AdjustmentValues): boolean {
  const L = a.levels;
  return (
    a.brightness === 0 &&
    a.contrast === 0 &&
    a.saturation === 0 &&
    L.inBlack === 0 &&
    L.inWhite === 255 &&
    L.gamma === 1 &&
    L.outBlack === 0 &&
    L.outWhite === 255
  );
}

function clampByte(n: number): number {
  return n < 0 ? 0 : n > 255 ? 255 : n;
}

/**
 * LUT 256 entradas que combina niveles + brillo + contraste (operaciones por canal independientes).
 * Orden: niveles (entrada→gamma→salida) → brillo (offset) → contraste (factor en torno a 128).
 */
function buildToneLut(a: AdjustmentValues): Uint8ClampedArray {
  const L = a.levels;
  const inBlack = Math.min(254, Math.max(0, L.inBlack));
  const inWhite = Math.max(inBlack + 1, Math.min(255, L.inWhite));
  const inRange = inWhite - inBlack;
  const gamma = Math.min(9.99, Math.max(0.01, L.gamma));
  const invGamma = 1 / gamma;
  const outBlack = Math.min(255, Math.max(0, L.outBlack));
  const outWhite = Math.min(255, Math.max(0, L.outWhite));

  // Brillo: -100..100 → offset -127.5..127.5.
  const brightnessOffset = (a.brightness / 100) * 127.5;
  // Contraste: fórmula clásica con C en -255..255.
  const C = (a.contrast / 100) * 255;
  const contrastFactor = (259 * (C + 255)) / (255 * (259 - C));

  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    // Niveles de entrada + gamma.
    let n = (v - inBlack) / inRange;
    n = n < 0 ? 0 : n > 1 ? 1 : n;
    n = Math.pow(n, invGamma);
    // Niveles de salida.
    let out = outBlack + n * (outWhite - outBlack);
    // Brillo.
    out += brightnessOffset;
    // Contraste.
    out = contrastFactor * (out - 128) + 128;
    lut[v] = clampByte(Math.round(out));
  }
  return lut;
}

/** Valores 0..1 para `feFuncR/G/B type="table"` en filtros SVG (256 entradas). */
export function buildToneLutTableValues(a: AdjustmentValues): string {
  const lut = buildToneLut(a);
  return Array.from(lut, (v) => (v / 255).toFixed(5)).join(" ");
}

/** Matriz `feColorMatrix` para saturación (-100..100, 0 = identidad). */
export function buildSaturationColorMatrixValues(saturation: number): string {
  const s = 1 + saturation / 100;
  if (Math.abs(s - 1) < 1e-6) {
    return "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0";
  }
  const wR = 0.299;
  const wG = 0.587;
  const wB = 0.114;
  const m = (w: number) => w + (1 - w) * s;
  const o = (w: number) => w * (1 - s);
  return [
    m(wR), o(wG), o(wB), 0, 0,
    o(wR), m(wG), o(wB), 0, 0,
    o(wR), o(wG), m(wB), 0, 0,
    0, 0, 0, 1, 0,
  ].join(" ");
}

/** Aplica los ajustes in-place sobre los píxeles RGBA. */
export function applyPhotoImageAdjustmentsToImageData(
  img: ImageData,
  a: AdjustmentValues,
): void {
  const lut = buildToneLut(a);
  const satFactor = 1 + a.saturation / 100; // -100 → 0 (grises), +100 → 2
  const applySat = satFactor !== 1;
  const d = img.data;
  const len = d.length;

  for (let i = 0; i < len; i += 4) {
    let r = lut[d[i]!]!;
    let g = lut[d[i + 1]!]!;
    let b = lut[d[i + 2]!]!;

    if (applySat) {
      // Luminancia perceptual (Rec. 601), igual que el resto del pipeline raster.
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = clampByte(Math.round(gray + (r - gray) * satFactor));
      g = clampByte(Math.round(gray + (g - gray) * satFactor));
      b = clampByte(Math.round(gray + (b - gray) * satFactor));
    }

    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    // alfa intacto
  }
}

/**
 * Histograma de luminancia (256 bins) de los píxeles no transparentes.
 * Si se pasa `maskAlpha` (cobertura 0..255 por píxel), solo cuenta los de la selección.
 */
export function computeLuminanceHistogram(
  img: ImageData,
  maskAlpha?: Uint8ClampedArray | null,
): number[] {
  const h = new Array<number>(256).fill(0);
  const d = img.data;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    if (maskAlpha && maskAlpha[p]! < 8) continue;
    if (d[i + 3]! < 8) continue;
    const y = Math.round(0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!);
    h[y]!++;
  }
  return h;
}

/** Posición normalizada (0..1) del triángulo de medios tonos a partir del gamma. */
export function gammaToMidPos(gamma: number): number {
  const g = Math.min(9.99, Math.max(0.01, gamma));
  return Math.pow(0.5, g);
}

/** Gamma a partir de la posición normalizada (0..1) del triángulo de medios tonos. */
export function midPosToGamma(midPos: number): number {
  const m = Math.min(0.999, Math.max(0.001, midPos));
  const g = Math.log(m) / Math.log(0.5);
  return Math.min(9.99, Math.max(0.1, Math.round(g * 100) / 100));
}
