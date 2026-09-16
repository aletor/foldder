/**
 * Preserve-compose · igualación óptica de la zona generada con su entorno en la base.
 *
 * El modelo de imagen tiende a devolver la zona editada nítida, limpia y con luz genérica aunque
 * el área circundante de la BASE esté fuera de foco o tenga grano. Aquí se mide, a escala de
 * análisis, la nitidez y el grano del anillo de la base justo fuera de la máscara y del interior
 * de la generada, y se deduce:
 *  - un σ de desenfoque gaussiano a aplicar a la generada (solo puede desenfocar, nunca enfocar),
 *  - una desviación de grano a inyectar dentro de la máscara,
 *  - topes adaptativos para la corrección tonal de baja frecuencia.
 *
 * Puro (typed arrays), sin llamadas de pago.
 */

import { dilateRound, erodeSquare, gaussianBlurFloat, rgbToGray } from "./analyze-change-mask";

export type OpticalMatchStats = {
  /** Anchura de borde (px, escala de análisis) del anillo de la base; null si no hay bordes fiables. */
  baseEdgeWidthPx: number | null;
  /** Ídem del interior de la generada. */
  generatedEdgeWidthPx: number | null;
  /** σ (px, escala de análisis) aplicado a la generada; 0 = sin desenfoque adicional. */
  blurSigmaPx: number;
  /** Desviación típica del grano de alta frecuencia en la base (anillo). */
  baseGrain: number;
  /** Ídem en la generada (interior). */
  generatedGrain: number;
  /** Desviación típica del grano añadido dentro de la máscara; 0 = ninguno. */
  grainAdded: number;
  /** Píxeles usados en cada medida (para descartar estimaciones con poca muestra). */
  ringPixels: number;
  innerPixels: number;
};

export type OpticalRegions = { ring: Uint8Array; inner: Uint8Array; ringPixels: number; innerPixels: number };

/** Anillo exterior (dilatación − máscara) e interior erosionado, ambos 0/255. */
export function opticalRegions(mask: Uint8Array, w: number, h: number, ringPx: number): OpticalRegions {
  const r = Math.max(2, Math.round(ringPx));
  const dilated = dilateRound(mask, w, h, r);
  const eroded = erodeSquare(mask, w, h, Math.max(1, Math.round(r / 2)));
  const ring = new Uint8Array(w * h);
  let ringPixels = 0;
  let innerPixels = 0;
  for (let i = 0; i < w * h; i++) {
    if (dilated[i] && !mask[i]) {
      ring[i] = 255;
      ringPixels++;
    }
    if (eroded[i]) innerPixels++;
  }
  let inner = eroded;
  if (innerPixels < 64) {
    inner = mask;
    innerPixels = 0;
    for (let i = 0; i < w * h; i++) if (mask[i]) innerPixels++;
  }
  return { ring, inner, ringPixels, innerPixels };
}

/** Percentil de un array numérico (ordena una copia). */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = Float64Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)))]!;
}

/**
 * Recorre una línea (fila o columna) y acumula anchuras de borde: para cada máximo local de |g|
 * por encima del umbral, la anchura es la distancia entre los puntos a ambos lados donde |g| cae
 * a la mitad del pico (FWHM). Para un escalón desenfocado con gaussiana σ, FWHM ≈ 2.35·σ, sea cual
 * sea la amplitud del escalón. Los bordes de ruido se descartan por amplitud de intensidad.
 */
function collectLineEdgeWidths(
  gray: Float32Array,
  region: Uint8Array,
  start: number,
  step: number,
  count: number,
  gradThreshold: number,
  minAmplitude: number,
  maxWidth: number,
  out: number[],
): void {
  if (count < 5) return;
  const g = new Float32Array(count);
  for (let k = 1; k < count - 1; k++) {
    g[k] = (gray[start + (k + 1) * step]! - gray[start + (k - 1) * step]!) * 0.5;
  }
  for (let k = 2; k < count - 2; k++) {
    const idx = start + k * step;
    if (!region[idx]) continue;
    const gk = Math.abs(g[k]!);
    if (gk < gradThreshold) continue;
    if (gk < Math.abs(g[k - 1]!) || gk <= Math.abs(g[k + 1]!)) continue; // no es máximo local
    const half = gk * 0.5;
    const sign = g[k]! > 0 ? 1 : -1;
    let left = k;
    while (left > 0 && k - left < maxWidth && sign * g[left - 1]! > half) left--;
    let right = k;
    while (right < count - 1 && right - k < maxWidth && sign * g[right + 1]! > half) right++;
    const width = right - left + 1;
    const amplitude = Math.abs(gray[start + right * step]! - gray[start + left * step]!);
    if (amplitude < minAmplitude) continue;
    out.push(width);
  }
}

/**
 * Índice de anchura de borde (px) de una región: percentil 25 de las anchuras FWHM de sus bordes.
 * Bajo = nítido; alto = fuera de foco. Independiente del contenido en la medida en que la región
 * tenga algún borde real; si no hay bordes fiables devuelve null (no se puede estimar).
 * El pre-suavizado σ0 elimina el ruido de píxel para que el grano no se lea como nitidez.
 */
export function edgeWidthIndex(
  gray: Float32Array,
  w: number,
  h: number,
  region: Uint8Array,
  options?: { sigma0?: number; minEdges?: number; minAmplitude?: number },
): number | null {
  const sigma0 = options?.sigma0 ?? 1.2;
  const minEdges = options?.minEdges ?? 24;
  const minAmplitude = options?.minAmplitude ?? 6;
  const smooth = sigma0 > 0 ? gaussianBlurFloat(gray, w, h, sigma0) : gray;

  // Umbral de gradiente relativo al contraste de la región (percentil 90 de |∇| en la región).
  const grads: number[] = [];
  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    for (let x = 1; x < w - 1; x++) {
      const i = row + x;
      if (!region[i]) continue;
      const gx = (smooth[i + 1]! - smooth[i - 1]!) * 0.5;
      const gy = (smooth[i + w]! - smooth[i - w]!) * 0.5;
      grads.push(Math.max(Math.abs(gx), Math.abs(gy)));
    }
  }
  if (grads.length < 64) return null;
  const gradThreshold = Math.max(1.5, percentile(grads, 0.9) * 0.4);
  const maxWidth = Math.max(8, Math.round(Math.max(w, h) * 0.04));

  const widths: number[] = [];
  for (let y = 0; y < h; y++) collectLineEdgeWidths(smooth, region, y * w, 1, w, gradThreshold, minAmplitude, maxWidth, widths);
  for (let x = 0; x < w; x++) collectLineEdgeWidths(smooth, region, x, w, h, gradThreshold, minAmplitude, maxWidth, widths);
  if (widths.length < minEdges) return null;
  return percentile(widths, 0.25);
}

/** Desviación típica del residuo de alta frecuencia (I − blur(I,1)) dentro de la región. */
export function grainStd(gray: Float32Array, w: number, h: number, region: Uint8Array): number {
  const low = gaussianBlurFloat(gray, w, h, 1);
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let i = 0; i < w * h; i++) {
    if (!region[i]) continue;
    const r = gray[i]! - low[i]!;
    sum += r;
    sumSq += r * r;
    count++;
  }
  if (count < 32) return 0;
  const mean = sum / count;
  return Math.sqrt(Math.max(0, sumSq / count - mean * mean));
}

/**
 * Busca por bisección el σ que iguala la anchura de borde de la generada (interior) a la de la
 * base (anillo). Devuelve 0 si la generada ya es igual o más borrosa que su entorno, o si en
 * algún paso no se puede medir (nunca se desenfoca "a ciegas").
 */
export function solveBlurSigma(args: {
  generatedGray: Float32Array;
  w: number;
  h: number;
  inner: Uint8Array;
  targetWidth: number;
  generatedWidth: number;
  maxSigma: number;
  /** Diferencia mínima de anchura (px) para intervenir. */
  minGap?: number;
}): number {
  const gap = args.minGap ?? 0.75;
  if (args.generatedWidth >= args.targetWidth - gap) return 0;
  // `generatedGray` llega ya pre-suavizada con el mismo σ0 que se usó para medir `targetWidth`,
  // así que aquí se mide sin suavizado adicional para mantener ambas escalas coherentes.
  const widthAt = (sigma: number) =>
    edgeWidthIndex(gaussianBlurFloat(args.generatedGray, args.w, args.h, sigma), args.w, args.h, args.inner, { sigma0: 0 });
  const target = args.targetWidth;
  let lo = 0;
  let hi = args.maxSigma;
  const atHi = widthAt(hi);
  if (atHi == null) return 0;
  if (atHi < target) return hi;
  for (let iter = 0; iter < 7; iter++) {
    const mid = (lo + hi) / 2;
    const wMid = widthAt(mid);
    if (wMid == null) return 0;
    if (wMid < target) lo = mid;
    else hi = mid;
    if (hi - lo < 0.1) break;
  }
  return Math.round(((lo + hi) / 2) * 100) / 100;
}

export function measureOpticalMatch(args: {
  base: Uint8Array;
  generated: Uint8Array;
  mask: Uint8Array;
  w: number;
  h: number;
  ringPx: number;
  maxSigma?: number;
}): OpticalMatchStats {
  const { w, h } = args;
  const n = w * h;
  const regions = opticalRegions(args.mask, w, h, args.ringPx);
  const baseGray = rgbToGray(args.base, n);
  const genGray = rgbToGray(args.generated, n);
  // Anchuras medidas sobre versiones pre-suavizadas (σ0) para neutralizar el grano; la bisección
  // del σ se hace sobre la generada pre-suavizada con el mismo σ0, así ambas escalas coinciden.
  const SIGMA0 = 1.2;
  const baseSmooth = gaussianBlurFloat(baseGray, w, h, SIGMA0);
  const genSmooth = gaussianBlurFloat(genGray, w, h, SIGMA0);
  const baseWidth = edgeWidthIndex(baseSmooth, w, h, regions.ring, { sigma0: 0 });
  const generatedWidth = edgeWidthIndex(genSmooth, w, h, regions.inner, { sigma0: 0 });
  const baseGrain = grainStd(baseGray, w, h, regions.ring);
  const generatedGrain = grainStd(genGray, w, h, regions.inner);

  const enoughSample = regions.ringPixels >= 200 && regions.innerPixels >= 100;
  const blurSigmaPx =
    enoughSample && baseWidth != null && generatedWidth != null
      ? solveBlurSigma({
          generatedGray: genSmooth,
          w,
          h,
          inner: regions.inner,
          targetWidth: baseWidth,
          generatedWidth,
          maxSigma: args.maxSigma ?? Math.max(1.5, 0.008 * Math.max(w, h)),
        })
      : 0;

  // El grano se mide sobre la generada ya desenfocada (si procede), porque el blur se lo quita.
  const genGrainAfter = blurSigmaPx > 0 ? grainStd(gaussianBlurFloat(genGray, w, h, blurSigmaPx), w, h, regions.inner) : generatedGrain;
  const grainAdded =
    enoughSample && baseGrain > genGrainAfter + 0.35
      ? Math.min(12, Math.sqrt(baseGrain * baseGrain - genGrainAfter * genGrainAfter))
      : 0;

  return {
    baseEdgeWidthPx: baseWidth == null ? null : Math.round(baseWidth * 100) / 100,
    generatedEdgeWidthPx: generatedWidth == null ? null : Math.round(generatedWidth * 100) / 100,
    blurSigmaPx,
    baseGrain: Math.round(baseGrain * 100) / 100,
    generatedGrain: Math.round(generatedGrain * 100) / 100,
    grainAdded: Math.round(grainAdded * 100) / 100,
    ringPixels: regions.ringPixels,
    innerPixels: regions.innerPixels,
  };
}

/* ───────────────────────── medición por componente ───────────────────────── */

export type OpticalComponent = {
  label: number;
  pixels: number;
  bbox: { x1: number; y1: number; x2: number; y2: number };
  stats: OpticalMatchStats;
};

export type OpticalMatchPerComponent = {
  /** Etiqueta 1..N por píxel (0 = fuera de máscara), a escala de análisis. */
  labels: Int32Array;
  components: OpticalComponent[];
  /** Resumen (σ y grano máximos) para telemetría/UI. */
  summary: OpticalMatchStats;
};

/** Etiquetado 4-conexo de los componentes de la máscara (0/255). */
export function labelMaskComponents(mask: Uint8Array, w: number, h: number): { labels: Int32Array; count: number } {
  const labels = new Int32Array(w * h);
  const stack: number[] = [];
  let count = 0;
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || labels[i]) continue;
    count++;
    labels[i] = count;
    stack.push(i);
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % w;
      const y = (p - x) / w;
      if (x > 0 && mask[p - 1] && !labels[p - 1]) { labels[p - 1] = count; stack.push(p - 1); }
      if (x < w - 1 && mask[p + 1] && !labels[p + 1]) { labels[p + 1] = count; stack.push(p + 1); }
      if (y > 0 && mask[p - w] && !labels[p - w]) { labels[p - w] = count; stack.push(p - w); }
      if (y < h - 1 && mask[p + w] && !labels[p + w]) { labels[p + w] = count; stack.push(p + w); }
    }
  }
  return { labels, count };
}

function emptyStats(): OpticalMatchStats {
  return {
    baseEdgeWidthPx: null,
    generatedEdgeWidthPx: null,
    blurSigmaPx: 0,
    baseGrain: 0,
    generatedGrain: 0,
    grainAdded: 0,
    ringPixels: 0,
    innerPixels: 0,
  };
}

/**
 * Mide cada componente de la máscara por separado (su propio anillo, su propio σ y grano): una
 * zona en el fondo desenfocado y otra en la cara enfocada no deben compartir objetivo. Cada
 * medición se hace sobre un recorte de la bbox del componente (más margen) para acotar el coste.
 */
export function measureOpticalMatchPerComponent(args: {
  base: Uint8Array;
  generated: Uint8Array;
  mask: Uint8Array;
  w: number;
  h: number;
  ringPx: number;
  maxSigma?: number;
}): OpticalMatchPerComponent {
  const { w, h } = args;
  const { labels, count } = labelMaskComponents(args.mask, w, h);
  const maxSigma = args.maxSigma ?? Math.max(1.5, 0.008 * Math.max(w, h));
  const pad = Math.ceil(args.ringPx * 2 + maxSigma * 3 + 4);

  const bboxes: Array<{ x1: number; y1: number; x2: number; y2: number; pixels: number }> = [];
  for (let k = 0; k <= count; k++) bboxes.push({ x1: w, y1: h, x2: -1, y2: -1, pixels: 0 });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = labels[y * w + x]!;
      if (!l) continue;
      const b = bboxes[l]!;
      if (x < b.x1) b.x1 = x;
      if (y < b.y1) b.y1 = y;
      if (x > b.x2) b.x2 = x;
      if (y > b.y2) b.y2 = y;
      b.pixels++;
    }
  }

  const components: OpticalComponent[] = [];
  for (let l = 1; l <= count; l++) {
    const b = bboxes[l]!;
    if (b.pixels < 48) {
      components.push({ label: l, pixels: b.pixels, bbox: { x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2 }, stats: emptyStats() });
      continue;
    }
    const cx1 = Math.max(0, b.x1 - pad);
    const cy1 = Math.max(0, b.y1 - pad);
    const cx2 = Math.min(w - 1, b.x2 + pad);
    const cy2 = Math.min(h - 1, b.y2 + pad);
    const cw = cx2 - cx1 + 1;
    const ch = cy2 - cy1 + 1;
    const subBase = new Uint8Array(cw * ch * 3);
    const subGen = new Uint8Array(cw * ch * 3);
    const subMask = new Uint8Array(cw * ch);
    for (let y = 0; y < ch; y++) {
      const srcRow = (cy1 + y) * w + cx1;
      subBase.set(args.base.subarray(srcRow * 3, (srcRow + cw) * 3), y * cw * 3);
      subGen.set(args.generated.subarray(srcRow * 3, (srcRow + cw) * 3), y * cw * 3);
      for (let x = 0; x < cw; x++) subMask[y * cw + x] = labels[srcRow + x] === l ? 255 : 0;
    }
    const stats = measureOpticalMatch({ base: subBase, generated: subGen, mask: subMask, w: cw, h: ch, ringPx: args.ringPx, maxSigma });
    components.push({ label: l, pixels: b.pixels, bbox: { x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2 }, stats });
  }

  const summary = emptyStats();
  let ringSum = 0;
  let innerSum = 0;
  for (const c of components) {
    summary.blurSigmaPx = Math.max(summary.blurSigmaPx, c.stats.blurSigmaPx);
    summary.grainAdded = Math.max(summary.grainAdded, c.stats.grainAdded);
    summary.baseGrain = Math.max(summary.baseGrain, c.stats.baseGrain);
    summary.generatedGrain = Math.max(summary.generatedGrain, c.stats.generatedGrain);
    ringSum += c.stats.ringPixels;
    innerSum += c.stats.innerPixels;
    if (c.stats.baseEdgeWidthPx != null) {
      summary.baseEdgeWidthPx = Math.max(summary.baseEdgeWidthPx ?? 0, c.stats.baseEdgeWidthPx);
    }
    if (c.stats.generatedEdgeWidthPx != null) {
      summary.generatedEdgeWidthPx = Math.min(summary.generatedEdgeWidthPx ?? Infinity, c.stats.generatedEdgeWidthPx);
    }
  }
  summary.ringPixels = ringSum;
  summary.innerPixels = innerSum;
  if (summary.generatedEdgeWidthPx === Infinity) summary.generatedEdgeWidthPx = null;
  return { labels, components, summary };
}

/**
 * Topes adaptativos para la corrección tonal de baja frecuencia: se calculan a partir de la
 * diferencia base−generada en la región sin cambio. Si el modelo ha desviado la luz de forma
 * amplia, permitimos corregir más; si la coincidencia ya es buena, mantenemos los topes estrictos.
 */
export function adaptiveToneLimits(args: {
  base: Uint8Array;
  generated: Uint8Array;
  maskSoft: Uint8Array;
  n: number;
}): { robustThreshold: number; maxCorrection: number; unchangedP90: number } {
  const diffs: number[] = [];
  for (let i = 0, j = 0; i < args.n; i++, j += 3) {
    if (args.maskSoft[i]! > 32) continue;
    const d = Math.max(
      Math.abs(args.base[j]! - args.generated[j]!),
      Math.abs(args.base[j + 1]! - args.generated[j + 1]!),
      Math.abs(args.base[j + 2]! - args.generated[j + 2]!),
    );
    diffs.push(d);
  }
  if (diffs.length < 64) return { robustThreshold: 24, maxCorrection: 32, unchangedP90: 0 };
  diffs.sort((a, b) => a - b);
  const p90 = diffs[Math.min(diffs.length - 1, Math.floor(diffs.length * 0.9))]!;
  const maxCorrection = Math.round(Math.min(96, Math.max(32, p90 * 1.5)));
  const robustThreshold = Math.round(Math.min(64, Math.max(24, p90 * 1.2)));
  return { robustThreshold, maxCorrection, unchangedP90: Math.round(p90 * 10) / 10 };
}

/** Ruido determinista (LCG + Box-Muller aproximado por suma de uniformes) para el grano. */
export function makeGrainSampler(seed: number): () => number {
  let s = seed >>> 0 || 1;
  const next = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  // Suma de 4 uniformes centradas: varianza 4/12 = 1/3 → escala √3 para σ=1.
  const scale = Math.sqrt(3);
  return () => (next() + next() + next() + next() - 2) * scale;
}
