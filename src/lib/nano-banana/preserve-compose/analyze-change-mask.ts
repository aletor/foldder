/**
 * Preserve-compose · análisis puro de "qué cambió de verdad" entre la imagen base y la generada.
 *
 * Trabaja sobre buffers RGB intercalados a escala de análisis (≤ ~1024 px de lado largo).
 * Sin sharp ni DOM: todo typed arrays, testeable con Vitest.
 *
 * El lazo del usuario es un PRIOR, no una máscara: baja el umbral cerca de él y lo sube lejos.
 * La máscara final es la que se usa para superponer la generación sobre la base, de modo que
 * las zonas que el modelo no tocó conservan los píxeles originales byte a byte.
 */

export type ChangeMaskSensitivity = "auto" | "strict" | "wide";

export type ChangeMaskDecision = "compose" | "skip-global" | "skip-no-change" | "skip-shift";

export type ChangeMaskOptions = {
  /** Área aceptada por encima de esta fracción del fotograma ⇒ cambio global, no se compone. */
  maxChangedFraction: number;
  /** Área aceptada por debajo de esta fracción ⇒ el modelo no cambió nada apreciable. */
  minChangedFraction: number;
  /** Desplazamiento global máximo aceptado (fracción del lado largo). */
  maxShiftFraction: number;
  /** Radio de búsqueda del desplazamiento (fracción del lado largo). */
  shiftSearchFraction: number;
  /** Multiplicadores sobre el suelo de ruido por banda. */
  insideFloorMul: number;
  ringFloorMul: number;
  farFloorMul: number;
  /** Mínimos absolutos (unidades de score normalizado) por banda. */
  insideAbsMin: number;
  ringAbsMin: number;
  farAbsMin: number;
  /** Las semillas de hysteresis necesitan score ≥ umbral de banda × seedMul. */
  seedMul: number;
  /** Área mínima de componente (fracción del fotograma) por banda. */
  ringMinArea: number;
  farMinArea: number;
  /** Morfología (px a escala de análisis). */
  openRadius: number;
  closeRadius: number;
  /** Anillo alrededor del lazo: múltiplo del lado largo del bbox del prior, acotado. */
  ringBboxMul: number;
  ringMinPx: number;
  ringMaxFraction: number;
  /** Dilatación final de la máscara (fracción del lado largo). */
  dilateFraction: number;
  /** Rellenar huecos cerrados menores que esta fracción del fotograma. */
  holeMaxFraction: number;
  /** Suavizado del mapa de score antes de umbralizar (σ px). */
  scoreBlurSigma: number;
  /**
   * Si la MEDIANA del score en la región segura supera esto, la "zona sin cambios" ya no lo es:
   * el modelo regeneró toda la imagen ⇒ skip-global (evita que un suelo de ruido alto lo oculte).
   */
  globalMedianScore: number;
};

const BASE_OPTIONS: ChangeMaskOptions = {
  maxChangedFraction: 0.65,
  minChangedFraction: 0.0005,
  maxShiftFraction: 0.015,
  shiftSearchFraction: 0.025,
  insideFloorMul: 1.15,
  ringFloorMul: 1.6,
  farFloorMul: 2.5,
  insideAbsMin: 0.25,
  ringAbsMin: 0.4,
  farAbsMin: 0.6,
  seedMul: 1.5,
  ringMinArea: 0.0005,
  farMinArea: 0.004,
  openRadius: 1,
  closeRadius: 2,
  ringBboxMul: 0.25,
  ringMinPx: 24,
  ringMaxFraction: 0.25,
  dilateFraction: 0.006,
  holeMaxFraction: 0.05,
  scoreBlurSigma: 1.5,
  globalMedianScore: 0.5,
};

export function resolveChangeMaskOptions(
  sensitivity: ChangeMaskSensitivity = "auto",
  overrides?: Partial<ChangeMaskOptions>,
): ChangeMaskOptions {
  let preset: Partial<ChangeMaskOptions> = {};
  if (sensitivity === "strict") {
    preset = {
      ringBboxMul: 0.15,
      ringFloorMul: 2,
      farFloorMul: 3.5,
      farAbsMin: 0.8,
      farMinArea: 0.01,
    };
  } else if (sensitivity === "wide") {
    preset = {
      ringBboxMul: 0.4,
      insideFloorMul: 1.05,
      ringFloorMul: 1.35,
      farFloorMul: 2,
      farAbsMin: 0.5,
      farMinArea: 0.002,
    };
  }
  return { ...BASE_OPTIONS, ...preset, ...overrides };
}

export type AnalyzeChangeMaskInput = {
  width: number;
  height: number;
  /** RGB intercalado (3 canales) a escala de análisis. */
  base: Uint8Array;
  /** RGB intercalado, mismas dimensiones que `base`. */
  generated: Uint8Array;
  /** 0/255 · unión de los lazos del usuario a escala de análisis, o null. */
  prior: Uint8Array | null;
  options?: ChangeMaskOptions;
};

export type ChangeMaskStats = {
  decision: ChangeMaskDecision;
  reason: string | null;
  /** Fracción del fotograma aceptada como cambio (máscara final, tras dilatación). */
  changedFraction: number;
  /** Fracción del fotograma que superó el umbral antes de filtrar componentes. */
  rawChangedFraction: number;
  /** Fracción del fotograma cubierta por el lazo del usuario (0 si no hay prior). */
  priorFraction: number;
  componentsKept: number;
  componentsDropped: number;
  noiseFloor: number;
  toneGain: [number, number, number];
  toneOffset: [number, number, number];
  shift: { dx: number; dy: number };
  ringRadiusPx: number;
  analysisWidth: number;
  analysisHeight: number;
};

export type AnalyzeChangeMaskResult = {
  /** 0/255 · máscara final a escala de análisis (ya dilatada). */
  mask: Uint8Array;
  /** Generada alineada y con tono igualado (misma escala), para la corrección de costura. */
  generatedAdjusted: Uint8Array;
  stats: ChangeMaskStats;
};

/* ───────────────────────────── utilidades básicas ───────────────────────────── */

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function rgbToGray(rgb: Uint8Array, n: number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 3) {
    out[i] = 0.299 * rgb[j]! + 0.587 * rgb[j + 1]! + 0.114 * rgb[j + 2]!;
  }
  return out;
}

function gaussianKernel(sigma: number): Float32Array {
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel = new Float32Array(radius * 2 + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + radius] = v;
    sum += v;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i]! /= sum;
  return kernel;
}

/** Desenfoque gaussiano separable con bordes replicados. */
export function gaussianBlurFloat(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  if (sigma <= 0) return Float32Array.from(src);
  const kernel = gaussianKernel(sigma);
  const radius = (kernel.length - 1) / 2;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = clamp(x + k, 0, w - 1);
        acc += src[row + xx]! * kernel[k + radius]!;
      }
      tmp[row + x] = acc;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = clamp(y + k, 0, h - 1);
        acc += tmp[yy * w + x]! * kernel[k + radius]!;
      }
      out[y * w + x] = acc;
    }
  }
  return out;
}

/** Media en ventana cuadrada (2r+1) con bordes replicados; separable O(n). */
export function boxMeanFloat(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const size = r * 2 + 1;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[row + clamp(k, 0, w - 1)]!;
    tmp[row] = acc / size;
    for (let x = 1; x < w; x++) {
      acc += src[row + clamp(x + r, 0, w - 1)]! - src[row + clamp(x - r - 1, 0, w - 1)]!;
      tmp[row + x] = acc / size;
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += tmp[clamp(k, 0, h - 1) * w + x]!;
    out[x] = acc / size;
    for (let y = 1; y < h; y++) {
      acc += tmp[clamp(y + r, 0, h - 1) * w + x]! - tmp[clamp(y - r - 1, 0, h - 1) * w + x]!;
      out[y * w + x] = acc / size;
    }
  }
  return out;
}

/* ───────────────────────────── desplazamiento global ───────────────────────────── */

function downsampleGray(src: Float32Array, w: number, h: number, f: number): { data: Float32Array; w: number; h: number } {
  const w2 = Math.max(1, Math.floor(w / f));
  const h2 = Math.max(1, Math.floor(h / f));
  const data = new Float32Array(w2 * h2);
  const inv = 1 / (f * f);
  for (let y = 0; y < h2; y++) {
    for (let x = 0; x < w2; x++) {
      let acc = 0;
      for (let yy = 0; yy < f; yy++) {
        const row = (y * f + yy) * w + x * f;
        for (let xx = 0; xx < f; xx++) acc += src[row + xx]!;
      }
      data[y * w2 + x] = acc * inv;
    }
  }
  return { data, w: w2, h: h2 };
}

function downsampleMaskAny(mask: Uint8Array, w: number, h: number, f: number): Uint8Array {
  const w2 = Math.max(1, Math.floor(w / f));
  const h2 = Math.max(1, Math.floor(h / f));
  const out = new Uint8Array(w2 * h2);
  for (let y = 0; y < h2; y++) {
    for (let x = 0; x < w2; x++) {
      let any = 0;
      for (let yy = 0; yy < f && !any; yy++) {
        const row = (y * f + yy) * w + x * f;
        for (let xx = 0; xx < f; xx++) {
          if (mask[row + xx]) {
            any = 1;
            break;
          }
        }
      }
      out[y * w2 + x] = any;
    }
  }
  return out;
}

/** Coste medio |a(x,y) − b(x−dx, y−dy)| sobre píxeles válidos y no excluidos. */
function shiftCost(
  a: Float32Array,
  b: Float32Array,
  w: number,
  h: number,
  exclude: Uint8Array | null,
  dx: number,
  dy: number,
): number {
  const y0 = Math.max(0, dy);
  const y1 = Math.min(h, h + dy);
  const x0 = Math.max(0, dx);
  const x1 = Math.min(w, w + dx);
  let sum = 0;
  let count = 0;
  for (let y = y0; y < y1; y++) {
    const rowA = y * w;
    const rowB = (y - dy) * w - dx;
    for (let x = x0; x < x1; x++) {
      if (exclude && exclude[rowA + x]) continue;
      sum += Math.abs(a[rowA + x]! - b[rowB + x]!);
      count++;
    }
  }
  return count > 0 ? sum / count : Number.POSITIVE_INFINITY;
}

export type ShiftEstimate = { dx: number; dy: number; improvement: number; confident: boolean };

/** Paso alto: gris menos su media local. Elimina deriva tonal/ganancia antes de alinear. */
function highPass(gray: Float32Array, w: number, h: number, radius: number): Float32Array {
  const mean = boxMeanFloat(gray, w, h, radius);
  const out = new Float32Array(gray.length);
  for (let i = 0; i < gray.length; i++) out[i] = gray[i]! - mean[i]!;
  return out;
}

/**
 * Estima la traslación global (dx,dy) tal que generated(x−dx, y−dy) ≈ base(x,y), es decir,
 * la corrección que hay que aplicar a la generada (`translateRgb(generated, dx, dy)`).
 * Se calcula sobre paso alto (insensible al tono): búsqueda gruesa a 1/4 y refinado fino
 * alrededor del mejor grueso y del origen. `exclude` marca la zona del lazo (no fiable).
 */
export function estimateGlobalShift(
  baseGray: Float32Array,
  genGray: Float32Array,
  w: number,
  h: number,
  exclude: Uint8Array | null,
  maxSearchPx: number,
): ShiftEstimate {
  const hpA = highPass(baseGray, w, h, 6);
  const hpB = highPass(genGray, w, h, 6);
  const zero = shiftCost(hpA, hpB, w, h, exclude, 0, 0);
  if (!Number.isFinite(zero) || zero <= 0 || maxSearchPx < 1) {
    return { dx: 0, dy: 0, improvement: 0, confident: false };
  }

  const f = 4;
  const coarseA = downsampleGray(hpA, w, h, f);
  const coarseB = downsampleGray(hpB, w, h, f);
  const coarseEx = exclude ? downsampleMaskAny(exclude, w, h, f) : null;
  const r4 = Math.max(1, Math.ceil(maxSearchPx / f));
  let best = { dx: 0, dy: 0, cost: shiftCost(coarseA.data, coarseB.data, coarseA.w, coarseA.h, coarseEx, 0, 0) };
  for (let dy = -r4; dy <= r4; dy++) {
    for (let dx = -r4; dx <= r4; dx++) {
      if (!dx && !dy) continue;
      const c = shiftCost(coarseA.data, coarseB.data, coarseA.w, coarseA.h, coarseEx, dx, dy);
      if (c < best.cost) best = { dx, dy, cost: c };
    }
  }

  // Refinado fino: ventana ±f alrededor del mejor grueso y ±3 alrededor del origen
  // (el grueso no resuelve desplazamientos menores que su celda).
  const candidates = new Set<number>();
  const encode = (dx: number, dy: number) => (dy + 4096) * 8192 + (dx + 4096);
  const cx = best.dx * f;
  const cy = best.dy * f;
  for (let dy = -f; dy <= f; dy++) for (let dx = -f; dx <= f; dx++) candidates.add(encode(cx + dx, cy + dy));
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) candidates.add(encode(dx, dy));

  let fine = { dx: 0, dy: 0, cost: zero };
  for (const code of candidates) {
    const sx = (code % 8192) - 4096;
    const sy = Math.floor(code / 8192) - 4096;
    if (!sx && !sy) continue;
    if (Math.abs(sx) > maxSearchPx + f || Math.abs(sy) > maxSearchPx + f) continue;
    const c = shiftCost(hpA, hpB, w, h, exclude, sx, sy);
    if (c < fine.cost) fine = { dx: sx, dy: sy, cost: c };
  }
  const improvement = 1 - fine.cost / zero;
  const confident = improvement >= 0.1 && (fine.dx !== 0 || fine.dy !== 0);
  return { dx: fine.dx, dy: fine.dy, improvement, confident };
}

/** out(x,y) = src(x−dx, y−dy) con bordes replicados. */
export function translateRgb(src: Uint8Array, w: number, h: number, dx: number, dy: number): Uint8Array {
  if (!dx && !dy) return src;
  const out = new Uint8Array(src.length);
  for (let y = 0; y < h; y++) {
    const sy = clamp(y - dy, 0, h - 1);
    for (let x = 0; x < w; x++) {
      const sx = clamp(x - dx, 0, w - 1);
      const si = (sy * w + sx) * 3;
      const di = (y * w + x) * 3;
      out[di] = src[si]!;
      out[di + 1] = src[si + 1]!;
      out[di + 2] = src[si + 2]!;
    }
  }
  return out;
}

/* ───────────────────────────── igualado tonal ───────────────────────────── */

export type ToneMatch = { gain: [number, number, number]; offset: [number, number, number] };

/**
 * Corrección lineal por canal para que `gen` se parezca a `base` en la región `safe` (1 = usar).
 * Regresión de mínimos cuadrados sobre versiones PASO BAJO de ambas imágenes: el re-render del
 * modelo pierde detalle (menor varianza), así que igualar desviaciones típicas sobreestimaría la
 * ganancia; la regresión sobre baja frecuencia solo captura deriva real de tono/exposición.
 */
export function computeToneMatch(
  base: Uint8Array,
  gen: Uint8Array,
  n: number,
  safe: Uint8Array | null,
  dims?: { width: number; height: number },
): ToneMatch {
  const gain: [number, number, number] = [1, 1, 1];
  const offset: [number, number, number] = [0, 0, 0];
  const w = dims?.width ?? n;
  const h = dims?.height ?? 1;
  const radius = dims ? Math.max(2, Math.round(Math.max(w, h) * 0.006)) : 0;
  for (let c = 0; c < 3; c++) {
    const chB = new Float32Array(n);
    const chG = new Float32Array(n);
    for (let i = 0, j = c; i < n; i++, j += 3) {
      chB[i] = base[j]!;
      chG[i] = gen[j]!;
    }
    const lowB = radius > 0 ? boxMeanFloat(chB, w, h, radius) : chB;
    const lowG = radius > 0 ? boxMeanFloat(chG, w, h, radius) : chG;
    let sumB = 0;
    let sumG = 0;
    let sumGG = 0;
    let sumGB = 0;
    let count = 0;
    for (let i = 0; i < n; i++) {
      if (safe && !safe[i]) continue;
      const b = lowB[i]!;
      const g = lowG[i]!;
      // Fuera de la regresión los píxeles saturados: la relación deja de ser lineal (recorte).
      if (b < 6 || b > 249 || g < 6 || g > 249) continue;
      sumB += b;
      sumG += g;
      sumGG += g * g;
      sumGB += g * b;
      count++;
    }
    if (count < 64) continue;
    const meanB = sumB / count;
    const meanG = sumG / count;
    const varG = sumGG / count - meanG * meanG;
    const cov = sumGB / count - meanG * meanB;
    let g = varG > 4 ? cov / varG : 1;
    g = clamp(g, 0.85, 1.18);
    let o = clamp(meanB - g * meanG, -32, 32);
    if (Math.abs(g - 1) < 0.01 && Math.abs(o) < 1) {
      g = 1;
      o = 0;
    }
    gain[c] = g;
    offset[c] = o;
  }
  return { gain, offset };
}

export function applyToneMatch(src: Uint8Array, tone: ToneMatch): Uint8Array {
  const identity = tone.gain.every((g) => g === 1) && tone.offset.every((o) => o === 0);
  if (identity) return src;
  const out = new Uint8Array(src.length);
  for (let j = 0; j < src.length; j += 3) {
    for (let c = 0; c < 3; c++) {
      out[j + c] = clamp(Math.round(src[j + c]! * tone.gain[c]! + tone.offset[c]!), 0, 255);
    }
  }
  return out;
}

/* ───────────────────────────── distancia al prior ───────────────────────────── */

const CHAMFER_INF = 1e9;

/** Distancia chamfer (3-4)/3 ≈ euclídea al píxel más cercano con mask≠0. 0 dentro. */
export function chamferDistance(mask: Uint8Array, w: number, h: number): Float32Array {
  const n = w * h;
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) d[i] = mask[i] ? 0 : CHAMFER_INF;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let v = d[i]!;
      if (v === 0) continue;
      if (x > 0) v = Math.min(v, d[i - 1]! + 3);
      if (y > 0) {
        v = Math.min(v, d[i - w]! + 3);
        if (x > 0) v = Math.min(v, d[i - w - 1]! + 4);
        if (x < w - 1) v = Math.min(v, d[i - w + 1]! + 4);
      }
      d[i] = v;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      let v = d[i]!;
      if (v === 0) continue;
      if (x < w - 1) v = Math.min(v, d[i + 1]! + 3);
      if (y < h - 1) {
        v = Math.min(v, d[i + w]! + 3);
        if (x < w - 1) v = Math.min(v, d[i + w + 1]! + 4);
        if (x > 0) v = Math.min(v, d[i + w - 1]! + 4);
      }
      d[i] = v;
    }
  }
  for (let i = 0; i < n; i++) d[i] = d[i]! >= CHAMFER_INF ? CHAMFER_INF : d[i]! / 3;
  return d;
}

/* ───────────────────────────── mapa de score ───────────────────────────── */

const SSIM_C1 = (0.01 * 255) ** 2;
const SSIM_C2 = (0.03 * 255) ** 2;
const COLOR_NORM = 0.2; // 20 % de diferencia de color ⇒ score 1
const STRUCT_NORM = 0.5; // (1 − SSIM) = 0.5 ⇒ score 1

/**
 * Score por píxel = max(color, estructura), suavizado. Color en YCbCr sobre imágenes
 * ligeramente desenfocadas; estructura = 1 − SSIM local (ventana 7×7) en gris.
 */
export function computeChangeScore(
  base: Uint8Array,
  gen: Uint8Array,
  w: number,
  h: number,
  blurSigma: number,
): Float32Array {
  const n = w * h;
  const chB: Float32Array[] = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  const chG: Float32Array[] = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let i = 0, j = 0; i < n; i++, j += 3) {
    for (let c = 0; c < 3; c++) {
      chB[c]![i] = base[j + c]!;
      chG[c]![i] = gen[j + c]!;
    }
  }
  const softB = chB.map((ch) => gaussianBlurFloat(ch, w, h, 1.2));
  const softG = chG.map((ch) => gaussianBlurFloat(ch, w, h, 1.2));

  const grayB = rgbToGray(base, n);
  const grayG = rgbToGray(gen, n);
  const r = 3;
  const muB = boxMeanFloat(grayB, w, h, r);
  const muG = boxMeanFloat(grayG, w, h, r);
  const sqB = new Float32Array(n);
  const sqG = new Float32Array(n);
  const prod = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    sqB[i] = grayB[i]! * grayB[i]!;
    sqG[i] = grayG[i]! * grayG[i]!;
    prod[i] = grayB[i]! * grayG[i]!;
  }
  const eSqB = boxMeanFloat(sqB, w, h, r);
  const eSqG = boxMeanFloat(sqG, w, h, r);
  const eProd = boxMeanFloat(prod, w, h, r);

  const score = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const yB = 0.299 * softB[0]![i]! + 0.587 * softB[1]![i]! + 0.114 * softB[2]![i]!;
    const yG = 0.299 * softG[0]![i]! + 0.587 * softG[1]![i]! + 0.114 * softG[2]![i]!;
    const cbB = softB[2]![i]! - yB;
    const cbG = softG[2]![i]! - yG;
    const crB = softB[0]![i]! - yB;
    const crG = softG[0]![i]! - yG;
    const dY = yB - yG;
    const dCb = cbB - cbG;
    const dCr = crB - crG;
    const color = Math.sqrt(dY * dY + 0.5 * (dCb * dCb + dCr * dCr)) / 255 / COLOR_NORM;

    const mb = muB[i]!;
    const mg = muG[i]!;
    const varB = Math.max(0, eSqB[i]! - mb * mb);
    const varG = Math.max(0, eSqG[i]! - mg * mg);
    const cov = eProd[i]! - mb * mg;
    const ssim = ((2 * mb * mg + SSIM_C1) * (2 * cov + SSIM_C2)) / ((mb * mb + mg * mg + SSIM_C1) * (varB + varG + SSIM_C2));
    const struct = clamp(1 - ssim, 0, 1) / STRUCT_NORM;

    score[i] = Math.max(color, struct);
  }
  return blurSigma > 0 ? gaussianBlurFloat(score, w, h, blurSigma) : score;
}

/** Suelo de ruido robusto (mediana + 3·MAD) del score en la región `safe` (1 = usar). */
export function robustNoiseFloor(score: Float32Array, safe: Uint8Array | null): { median: number; mad: number; floor: number; count: number } {
  const vals: number[] = [];
  for (let i = 0; i < score.length; i++) {
    if (safe && !safe[i]) continue;
    vals.push(score[i]!);
  }
  if (vals.length === 0) return { median: 0, mad: 0, floor: 0, count: 0 };
  vals.sort((a, b) => a - b);
  const median = vals[Math.floor(vals.length / 2)]!;
  const dev = vals.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const mad = dev[Math.floor(dev.length / 2)]! * 1.4826;
  return { median, mad, floor: median + 3 * mad, count: vals.length };
}

/* ───────────────────────────── morfología binaria ───────────────────────────── */

function separableMinMax(mask: Uint8Array, w: number, h: number, r: number, isMax: boolean): Uint8Array {
  if (r <= 0) return mask;
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let v = isMax ? 0 : 255;
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      for (let xx = x0; xx <= x1; xx++) {
        const m = mask[row + xx]!;
        if (isMax ? m > v : m < v) {
          v = m;
          if (isMax ? v === 255 : v === 0) break;
        }
      }
      tmp[row + x] = v;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let v = isMax ? 0 : 255;
      const y0 = Math.max(0, y - r);
      const y1 = Math.min(h - 1, y + r);
      for (let yy = y0; yy <= y1; yy++) {
        const m = tmp[yy * w + x]!;
        if (isMax ? m > v : m < v) {
          v = m;
          if (isMax ? v === 255 : v === 0) break;
        }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

export function dilateSquare(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  return separableMinMax(mask, w, h, r, true);
}

export function erodeSquare(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  return separableMinMax(mask, w, h, r, false);
}

export function morphOpen(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  return dilateSquare(erodeSquare(mask, w, h, r), w, h, r);
}

export function morphClose(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  return erodeSquare(dilateSquare(mask, w, h, r), w, h, r);
}

/** Dilatación redonda por distancia chamfer. */
export function dilateRound(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  if (radius <= 0) return mask;
  const d = chamferDistance(mask, w, h);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = d[i]! <= radius ? 255 : 0;
  return out;
}

/** Rellena huecos cerrados (fondo que no toca el borde) con área ≤ maxArea. */
export function fillHoles(mask: Uint8Array, w: number, h: number, maxArea: number): Uint8Array {
  const n = w * h;
  const out = Uint8Array.from(mask);
  const visited = new Uint8Array(n);
  const stack = new Int32Array(n);
  const pixels: number[] = [];
  for (let start = 0; start < n; start++) {
    if (visited[start] || out[start]) continue;
    let top = 0;
    stack[top++] = start;
    visited[start] = 1;
    pixels.length = 0;
    let touchesBorder = false;
    while (top > 0) {
      const idx = stack[--top]!;
      pixels.push(idx);
      const x = idx % w;
      const y = (idx - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesBorder = true;
      if (x > 0) {
        const i = idx - 1;
        if (!visited[i] && !out[i]) {
          visited[i] = 1;
          stack[top++] = i;
        }
      }
      if (x < w - 1) {
        const i = idx + 1;
        if (!visited[i] && !out[i]) {
          visited[i] = 1;
          stack[top++] = i;
        }
      }
      if (y > 0) {
        const i = idx - w;
        if (!visited[i] && !out[i]) {
          visited[i] = 1;
          stack[top++] = i;
        }
      }
      if (y < h - 1) {
        const i = idx + w;
        if (!visited[i] && !out[i]) {
          visited[i] = 1;
          stack[top++] = i;
        }
      }
    }
    if (!touchesBorder && pixels.length <= maxArea) {
      for (const p of pixels) out[p] = 255;
    }
  }
  return out;
}

/* ───────────────────────────── crecimiento y componentes ───────────────────────────── */

/** Expande desde `seeds` a través de píxeles `weak` (8-vecindad). Devuelve 0/255. */
export function growFromSeeds(seeds: Uint8Array, weak: Uint8Array, w: number, h: number): Uint8Array {
  const n = w * h;
  const out = new Uint8Array(n);
  const stack = new Int32Array(n);
  let top = 0;
  for (let i = 0; i < n; i++) {
    if (seeds[i]) {
      out[i] = 255;
      stack[top++] = i;
    }
  }
  while (top > 0) {
    const idx = stack[--top]!;
    const x = idx % w;
    const y = (idx - x) / w;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= h) continue;
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx;
        if (xx < 0 || xx >= w) continue;
        const i = yy * w + xx;
        if (out[i] || !weak[i]) continue;
        out[i] = 255;
        stack[top++] = i;
      }
    }
  }
  return out;
}

export type ComponentInfo = {
  area: number;
  minDist: number;
  meanScore: number;
  touchesPrior: boolean;
  pixels: Int32Array;
};

/** Componentes conexas (8-vecindad) con estadísticas frente al prior. */
export function labelComponents(
  mask: Uint8Array,
  w: number,
  h: number,
  dist: Float32Array | null,
  score: Float32Array,
): ComponentInfo[] {
  const n = w * h;
  const visited = new Uint8Array(n);
  const stack = new Int32Array(n);
  const buffer = new Int32Array(n);
  const comps: ComponentInfo[] = [];
  for (let start = 0; start < n; start++) {
    if (visited[start] || !mask[start]) continue;
    let top = 0;
    let count = 0;
    stack[top++] = start;
    visited[start] = 1;
    let minDist = CHAMFER_INF;
    let sumScore = 0;
    while (top > 0) {
      const idx = stack[--top]!;
      buffer[count++] = idx;
      sumScore += score[idx]!;
      if (dist) {
        const d = dist[idx]!;
        if (d < minDist) minDist = d;
      }
      const x = idx % w;
      const y = (idx - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const i = yy * w + xx;
          if (visited[i] || !mask[i]) continue;
          visited[i] = 1;
          stack[top++] = i;
        }
      }
    }
    comps.push({
      area: count,
      minDist: dist ? minDist : 0,
      meanScore: count ? sumScore / count : 0,
      touchesPrior: dist ? minDist === 0 : false,
      pixels: buffer.slice(0, count),
    });
  }
  return comps;
}

/* ───────────────────────────── pipeline principal ───────────────────────────── */

function priorBBoxLongSide(prior: Uint8Array, w: number, h: number): { longSide: number; area: number } {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  let area = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!prior[y * w + x]) continue;
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX) return { longSide: 0, area: 0 };
  return { longSide: Math.max(maxX - minX + 1, maxY - minY + 1), area };
}

function countNonZero(mask: Uint8Array): number {
  let c = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) c++;
  return c;
}

export function analyzeChangeMask(input: AnalyzeChangeMaskInput): AnalyzeChangeMaskResult {
  const { width: w, height: h } = input;
  const n = w * h;
  const opts = input.options ?? resolveChangeMaskOptions("auto");
  const longSide = Math.max(w, h);
  if (input.base.length < n * 3 || input.generated.length < n * 3) {
    throw new Error("analyzeChangeMask: buffers RGB incompletos.");
  }
  const priorRaw = input.prior && input.prior.length >= n ? input.prior : null;
  const priorStats = priorRaw ? priorBBoxLongSide(priorRaw, w, h) : { longSide: 0, area: 0 };
  const prior = priorRaw && priorStats.area > 0 ? priorRaw : null;

  const ringRadius = prior
    ? clamp(Math.round(priorStats.longSide * opts.ringBboxMul), opts.ringMinPx, Math.round(longSide * opts.ringMaxFraction))
    : 0;
  const dist = prior ? chamferDistance(prior, w, h) : null;

  // Región segura (donde no esperamos cambios) para ruido, tono y desplazamiento.
  const safe = new Uint8Array(n);
  let safeCount = 0;
  const safeFrom = (minDist: number) => {
    safeCount = 0;
    for (let i = 0; i < n; i++) {
      const ok = dist ? dist[i]! > minDist : true;
      safe[i] = ok ? 1 : 0;
      if (ok) safeCount++;
    }
  };
  if (dist) {
    safeFrom(ringRadius * 1.5);
    if (safeCount < n * 0.05) safeFrom(ringRadius);
    if (safeCount < n * 0.05) safeFrom(0);
    if (safeCount < n * 0.02) safeFrom(-1);
  } else {
    safeFrom(-1);
  }
  const exclude = new Uint8Array(n);
  for (let i = 0; i < n; i++) exclude[i] = safe[i] ? 0 : 1;

  // 1. Desplazamiento global.
  const grayB = rgbToGray(input.base, n);
  const grayG0 = rgbToGray(input.generated, n);
  const maxShiftPx = Math.max(1, Math.round(longSide * opts.maxShiftFraction));
  const searchPx = Math.max(maxShiftPx, Math.round(longSide * opts.shiftSearchFraction));
  const est = estimateGlobalShift(grayB, grayG0, w, h, exclude, searchPx);
  let shift = { dx: 0, dy: 0 };
  const shiftMag = Math.hypot(est.dx, est.dy);
  if (est.confident && shiftMag > maxShiftPx && est.improvement >= 0.25) {
    return {
      mask: new Uint8Array(n),
      generatedAdjusted: input.generated,
      stats: {
        decision: "skip-shift",
        reason: `Reencuadre global detectado (${est.dx}, ${est.dy} px a escala de análisis).`,
        changedFraction: 0,
        rawChangedFraction: 0,
        priorFraction: priorStats.area / n,
        componentsKept: 0,
        componentsDropped: 0,
        noiseFloor: 0,
        toneGain: [1, 1, 1],
        toneOffset: [0, 0, 0],
        shift: { dx: est.dx, dy: est.dy },
        ringRadiusPx: ringRadius,
        analysisWidth: w,
        analysisHeight: h,
      },
    };
  }
  if (est.confident && shiftMag <= maxShiftPx) shift = { dx: est.dx, dy: est.dy };
  const shifted = translateRgb(input.generated, w, h, shift.dx, shift.dy);

  // 2. Igualado tonal sobre la región segura.
  const tone = computeToneMatch(input.base, shifted, n, safe, { width: w, height: h });
  const adjusted = applyToneMatch(shifted, tone);

  // 3. Score perceptual y suelo de ruido.
  const score = computeChangeScore(input.base, adjusted, w, h, opts.scoreBlurSigma);
  const noise = robustNoiseFloor(score, safe);
  const floor = Math.max(noise.floor, 1e-4);
  if (noise.median > opts.globalMedianScore) {
    return {
      mask: new Uint8Array(n),
      generatedAdjusted: adjusted,
      stats: {
        decision: "skip-global",
        reason: "La imagen cambió también fuera de la zona marcada: se trata como regeneración global.",
        changedFraction: 0,
        rawChangedFraction: 0,
        priorFraction: priorStats.area / n,
        componentsKept: 0,
        componentsDropped: 0,
        noiseFloor: floor,
        toneGain: tone.gain,
        toneOffset: tone.offset,
        shift,
        ringRadiusPx: ringRadius,
        analysisWidth: w,
        analysisHeight: h,
      },
    };
  }

  const tInside = Math.max(floor * opts.insideFloorMul, opts.insideAbsMin);
  const tRing = Math.max(floor * opts.ringFloorMul, opts.ringAbsMin);
  const tFar = Math.max(floor * opts.farFloorMul, opts.farAbsMin);

  // 4. Semillas por banda + crecimiento uniforme (umbral de anillo) con hysteresis.
  const seeds = new Uint8Array(n);
  const weak = new Uint8Array(n);
  let rawCount = 0;
  for (let i = 0; i < n; i++) {
    const s = score[i]!;
    const d = dist ? dist[i]! : ringRadius; // sin prior: todo es "anillo"
    let seedThr: number;
    if (d === 0) seedThr = tInside;
    else if (d <= ringRadius) seedThr = tRing * opts.seedMul;
    else seedThr = tFar * opts.seedMul;
    if (s >= seedThr) seeds[i] = 1;
    const weakThr = d === 0 ? tInside : tRing;
    if (s >= weakThr) {
      weak[i] = 1;
      rawCount++;
    }
  }
  const grown = growFromSeeds(seeds, weak, w, h);
  const opened = morphOpen(grown, w, h, opts.openRadius);
  const closed = morphClose(opened, w, h, opts.closeRadius);

  // 5. Filtrado de componentes según su banda.
  const comps = labelComponents(closed, w, h, dist, score);
  const kept = new Uint8Array(n);
  let componentsKept = 0;
  let componentsDropped = 0;
  const ringMinArea = Math.max(4, Math.round(n * opts.ringMinArea));
  const farMinArea = Math.max(ringMinArea, Math.round(n * opts.farMinArea));
  for (const comp of comps) {
    let keep: boolean;
    if (!dist) keep = comp.area >= ringMinArea;
    else if (comp.touchesPrior) keep = true;
    else if (comp.minDist <= ringRadius) keep = comp.area >= ringMinArea;
    else keep = comp.area >= farMinArea && comp.meanScore >= tFar;
    if (keep) {
      componentsKept++;
      for (let k = 0; k < comp.pixels.length; k++) kept[comp.pixels[k]!] = 255;
    } else {
      componentsDropped++;
    }
  }

  // 6. Huecos y dilatación final.
  const filled = fillHoles(kept, w, h, Math.round(n * opts.holeMaxFraction));
  const acceptedFraction = countNonZero(filled) / n;
  const dilated = dilateRound(filled, w, h, Math.max(1, Math.round(longSide * opts.dilateFraction)));
  const changedFraction = countNonZero(dilated) / n;

  let decision: ChangeMaskDecision = "compose";
  let reason: string | null = null;
  if (acceptedFraction > opts.maxChangedFraction) {
    decision = "skip-global";
    reason = `El cambio afecta al ${Math.round(acceptedFraction * 100)} % de la imagen: se trata como regeneración global.`;
  } else if (acceptedFraction < opts.minChangedFraction) {
    decision = "skip-no-change";
    reason = "No se detectaron cambios apreciables respecto a la imagen base.";
  }

  return {
    mask: dilated,
    generatedAdjusted: adjusted,
    stats: {
      decision,
      reason,
      changedFraction,
      rawChangedFraction: rawCount / n,
      priorFraction: priorStats.area / n,
      componentsKept,
      componentsDropped,
      noiseFloor: floor,
      toneGain: tone.gain,
      toneOffset: tone.offset,
      shift,
      ringRadiusPx: ringRadius,
      analysisWidth: w,
      analysisHeight: h,
    },
  };
}
