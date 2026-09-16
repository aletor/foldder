/**
 * Preserve-compose · pipeline servidor (sharp).
 *
 * Dada la imagen base (alta calidad), la generada por el modelo y el prior del lazo:
 *  1. normaliza geometría (auto-orient, tamaño de la base, comprobación de aspecto),
 *  2. analiza a escala reducida qué cambió de verdad (`analyzeChangeMask`),
 *  3. alinea e iguala el tono de la generada a resolución completa,
 *  4. construye la máscara suave (feather) y la corrección de costura de baja frecuencia,
 *  5. superpone la generada sobre la base SOLO donde hubo cambio y codifica PNG sin pérdida.
 *
 * Sin llamadas a APIs de pago: solo CPU.
 */

import sharp from "sharp";
import {
  analyzeChangeMask,
  dilateRound,
  resolveChangeMaskOptions,
  type ChangeMaskDecision,
  type ChangeMaskOptions,
  type ChangeMaskSensitivity,
  type ChangeMaskStats,
} from "./analyze-change-mask";
import {
  adaptiveToneLimits,
  makeGrainSampler,
  measureOpticalMatchPerComponent,
  type OpticalComponent,
  type OpticalMatchStats,
} from "./optical-match";
import { computeLowFrequencyCorrection } from "./seam-correction";

export const PRESERVE_COMPOSE_DEFAULT_ANALYSIS_SIDE = 1024;
export const PRESERVE_COMPOSE_MAX_PIXELS = 40_000_000;
const ASPECT_TOLERANCE = 0.015;

export type PreserveComposeSkip = Exclude<ChangeMaskDecision, "compose"> | "aspect-mismatch" | "too-large";

export type PreserveComposeArgs = {
  base: Buffer;
  generated: Buffer;
  /** PNG/JPEG con el lazo: alfa (o luminancia si es opaco) marca la zona. */
  priorMask: Buffer | null;
  sensitivity?: ChangeMaskSensitivity;
  optionOverrides?: Partial<ChangeMaskOptions>;
  analysisMaxSide?: number;
  maxPixels?: number;
  /** Si true, devuelve un PNG RGBA pequeño (blanco = zona compuesta) para depuración/UI. */
  wantMaskPreview?: boolean;
  /**
   * Si el análisis decide no componer (cambio global, reencuadre, sin cambio) pero hay lazo,
   * compone igualmente usando el lazo dilatado como máscara. Imprescindible cuando la generada
   * es un recorte de contexto: la salida SIEMPRE debe volver al fotograma completo.
   */
  fallbackToPrior?: boolean;
  /** Igualar nitidez/grano de la generada con el anillo de la base (por defecto true). */
  opticalMatch?: boolean;
  /**
   * Ampliación de lienzo: píxeles añadidos a cada lado de `base` (la foto original).
   * La generada cubre el lienzo ampliado; solo se pega en la zona nueva + una costura.
   */
  expand?: { left: number; top: number; right: number; bottom: number } | null;
};

export type PreserveComposeTimings = Record<string, number>;

export type PreserveComposeToneLimits = { robustThreshold: number; maxCorrection: number; unchangedP90: number };

export type PreserveComposeResult =
  | {
      composed: true;
      png: Buffer;
      width: number;
      height: number;
      stats: ChangeMaskStats;
      maskPreviewPng: Buffer | null;
      timings: PreserveComposeTimings;
      optical: OpticalMatchStats | null;
      /** Medición por componente de la máscara (cada zona con su propio σ y grano). */
      opticalComponents: OpticalComponent[];
      toneLimits: PreserveComposeToneLimits;
      usedPriorFallback: boolean;
    }
  | {
      composed: false;
      decision: PreserveComposeSkip;
      reason: string;
      width: number;
      height: number;
      stats: ChangeMaskStats | null;
      maskPreviewPng: Buffer | null;
      timings: PreserveComposeTimings;
    };

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

async function decodeRgb(buffer: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(buffer, { failOn: "none" })
    .rotate()
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 3) {
    throw new Error(`preserve-compose: se esperaban 3 canales y llegaron ${info.channels}.`);
  }
  return { data, width: info.width, height: info.height };
}

async function resizeRgbRaw(
  raw: Buffer,
  width: number,
  height: number,
  targetW: number,
  targetH: number,
): Promise<Uint8Array> {
  const out = await sharp(raw, { raw: { width, height, channels: 3 } })
    .resize(targetW, targetH, { kernel: sharp.kernel.lanczos3, fit: "fill" })
    .raw()
    .toBuffer();
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
}

/** Prior del lazo → 0/255 a escala de análisis. Usa alfa si tiene transparencia real; si no, luminancia. */
async function decodePriorMask(prior: Buffer, targetW: number, targetH: number): Promise<Uint8Array | null> {
  try {
    const { data, info } = await sharp(prior, { failOn: "none" })
      .ensureAlpha()
      .resize(targetW, targetH, { kernel: sharp.kernel.cubic, fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const n = info.width * info.height;
    let aMin = 255;
    let aMax = 0;
    for (let i = 0; i < n; i++) {
      const a = data[i * 4 + 3]!;
      if (a < aMin) aMin = a;
      if (a > aMax) aMax = a;
    }
    const useAlpha = aMin < 16 && aMax > 240;
    const mask = new Uint8Array(n);
    let any = 0;
    for (let i = 0; i < n; i++) {
      const v = useAlpha ? data[i * 4 + 3]! : (data[i * 4]! + data[i * 4 + 1]! + data[i * 4 + 2]!) / 3;
      if (v > 64) {
        mask[i] = 255;
        any = 1;
      }
    }
    return any ? mask : null;
  } catch {
    return null;
  }
}

async function maskPreviewPng(mask: Uint8Array, w: number, h: number, maxSide = 512): Promise<Buffer> {
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = 255;
    rgba[i * 4 + 1] = 255;
    rgba[i * 4 + 2] = 255;
    rgba[i * 4 + 3] = mask[i]!;
  }
  const scale = Math.min(1, maxSide / Math.max(w, h));
  return sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .resize(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)), { fit: "fill" })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** out(x,y) = src(x−dx, y−dy) con bordes replicados, vía extend + extract. */
function translatePipeline(pipeline: sharp.Sharp, dx: number, dy: number, width: number, height: number): sharp.Sharp {
  if (!dx && !dy) return pipeline;
  return pipeline
    .extend({
      top: Math.max(0, dy),
      bottom: Math.max(0, -dy),
      left: Math.max(0, dx),
      right: Math.max(0, -dx),
      extendWith: "copy",
    })
    .extract({ left: Math.max(0, -dx), top: Math.max(0, -dy), width, height });
}

/**
 * Máscara 0/255 (escala de análisis) → máscara suave 0..255 a resolución completa, 1 byte/píxel.
 * sharp emite 3 canales por defecto incluso para raw de 1 canal: se fuerza b-w y se verifica.
 */
export async function upscaleSoftMask(
  mask: Uint8Array,
  fromW: number,
  fromH: number,
  toW: number,
  toH: number,
  sigma: number,
): Promise<Buffer> {
  const { data, info } = await sharp(Buffer.from(mask.buffer, mask.byteOffset, mask.byteLength), {
    raw: { width: fromW, height: fromH, channels: 1 },
  })
    .resize(toW, toH, { kernel: sharp.kernel.mitchell, fit: "fill" })
    .blur(sigma)
    .toColourspace("b-w")
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels === 1) return data;
  const single = Buffer.alloc(toW * toH);
  for (let i = 0; i < toW * toH; i++) single[i] = data[i * info.channels]!;
  return single;
}

export function featherPxForSize(width: number, height: number): number {
  return clamp(Math.round(0.012 * Math.max(width, height)), 6, 40);
}

/**
 * Mezcla in-place: base ← base·(1−α) + (gen + C)·α, con C muestreada bilinealmente
 * desde la escala de análisis.
 */
/**
 * Etiqueta del componente en coordenadas de la máscara de análisis (vecino más próximo). En la
 * pluma exterior (máscara suave > 0 pero fuera de la máscara dura) busca en el vecindario 3×3
 * para heredar la etiqueta del componente contiguo.
 */
function labelAt(labels: Int32Array, lw: number, lh: number, fx: number, fy: number): number {
  const x = clamp(Math.floor(fx), 0, lw - 1);
  const y = clamp(Math.floor(fy), 0, lh - 1);
  const direct = labels[y * lw + x]!;
  if (direct) return direct;
  for (let r = 1; r <= 2; r++) {
    for (let dy = -r; dy <= r; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= lh) continue;
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= lw) continue;
        const l = labels[yy * lw + xx]!;
        if (l) return l;
      }
    }
  }
  return 0;
}

export function blendInPlace(args: {
  base: Buffer;
  generated: Buffer;
  maskSoft: Buffer;
  width: number;
  height: number;
  correction: Float32Array;
  correctionWidth: number;
  correctionHeight: number;
  /** Grano fotográfico a inyectar en la generada dentro de la máscara (σ en niveles 0..255). */
  grain?: { std: number; seed?: number } | null;
  /**
   * Variantes por componente: `labels` (escala de análisis, 0 = fuera) elige para cada píxel qué
   * buffer de la generada usar (`sources[sourceByLabel[label]]`, índice 0 = `generated` sin
   * desenfoque) y cuánto grano añadir (`grainByLabel[label]`).
   */
  variants?: {
    labels: Int32Array;
    labelsWidth: number;
    labelsHeight: number;
    sources: Buffer[];
    sourceByLabel: Int32Array;
    grainByLabel: Float32Array;
  } | null;
}): void {
  const { base, generated, maskSoft, width: W, height: H, correction: C, correctionWidth: cW, correctionHeight: cH } = args;
  const grainStd = args.grain && args.grain.std > 0 ? args.grain.std : 0;
  const variants = args.variants ?? null;
  const anyVariantGrain = variants ? Array.from(variants.grainByLabel).some((g) => g > 0) : false;
  const sampleGrain = grainStd > 0 || anyVariantGrain ? makeGrainSampler(args.grain?.seed ?? 0x9e3779b9) : null;
  const lsx = variants ? variants.labelsWidth / W : 0;
  const lsy = variants ? variants.labelsHeight / H : 0;
  const xIdx0 = new Int32Array(W);
  const xIdx1 = new Int32Array(W);
  const xFrac = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const fx = clamp(((x + 0.5) * cW) / W - 0.5, 0, cW - 1);
    const x0 = Math.floor(fx);
    xIdx0[x] = x0;
    xIdx1[x] = Math.min(cW - 1, x0 + 1);
    xFrac[x] = fx - x0;
  }
  for (let y = 0; y < H; y++) {
    const fy = clamp(((y + 0.5) * cH) / H - 0.5, 0, cH - 1);
    const y0 = Math.floor(fy);
    const y1 = Math.min(cH - 1, y0 + 1);
    const ty = fy - y0;
    const row0 = y0 * cW;
    const row1 = y1 * cW;
    const rowPx = y * W;
    for (let x = 0; x < W; x++) {
      const m = maskSoft[rowPx + x]!;
      if (m === 0) continue;
      const a = m / 255;
      const tx = xFrac[x]!;
      const i00 = (row0 + xIdx0[x]!) * 3;
      const i01 = (row0 + xIdx1[x]!) * 3;
      const i10 = (row1 + xIdx0[x]!) * 3;
      const i11 = (row1 + xIdx1[x]!) * 3;
      const w00 = (1 - tx) * (1 - ty);
      const w01 = tx * (1 - ty);
      const w10 = (1 - tx) * ty;
      const w11 = tx * ty;
      const p = (rowPx + x) * 3;
      // Fuente y grano del píxel: por componente si hay variantes; si no, globales.
      let src = generated;
      let pixelGrain = grainStd;
      if (variants) {
        const label = labelAt(variants.labels, variants.labelsWidth, variants.labelsHeight, x * lsx, y * lsy);
        if (label > 0) {
          src = variants.sources[variants.sourceByLabel[label] ?? 0] ?? generated;
          pixelGrain = variants.grainByLabel[label] ?? 0;
        } else {
          pixelGrain = 0;
        }
      }
      // Grano mayormente de luminancia (85 %) con una pizca de variación cromática (15 %).
      const gl = sampleGrain && pixelGrain > 0 ? sampleGrain() * pixelGrain : 0;
      for (let c = 0; c < 3; c++) {
        const corr = C[i00 + c]! * w00 + C[i01 + c]! * w01 + C[i10 + c]! * w10 + C[i11 + c]! * w11;
        const noise = sampleGrain && pixelGrain > 0 ? gl * 0.85 + sampleGrain() * pixelGrain * 0.15 : 0;
        const g = src[p + c]! + corr + noise;
        const b = base[p + c]!;
        const v = b * (1 - a) + g * a;
        base[p + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
      }
    }
  }
}

function normalizeExpandPad(expand: { left: number; top: number; right: number; bottom: number }): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} | null {
  const left = Math.max(0, Math.round(expand.left || 0));
  const top = Math.max(0, Math.round(expand.top || 0));
  const right = Math.max(0, Math.round(expand.right || 0));
  const bottom = Math.max(0, Math.round(expand.bottom || 0));
  if (left + top + right + bottom === 0) return null;
  return { left, top, right, bottom };
}

function expandWorkMask(args: {
  aW: number;
  aH: number;
  origW: number;
  origH: number;
  pad: { left: number; top: number; right: number; bottom: number };
  canvasW: number;
  canvasH: number;
}): Uint8Array {
  const { aW, aH, origW, origH, pad, canvasW, canvasH } = args;
  const sx = aW / canvasW;
  const sy = aH / canvasH;
  const photoX = Math.round(pad.left * sx);
  const photoY = Math.round(pad.top * sy);
  const photoW = Math.round(origW * sx);
  const photoH = Math.round(origH * sy);
  const seam = Math.max(2, Math.round(Math.min(photoW, photoH) * 0.025));
  const mask = new Uint8Array(aW * aH);
  mask.fill(255);
  const x0 = Math.max(0, photoX + seam);
  const y0 = Math.max(0, photoY + seam);
  const x1 = Math.min(aW, photoX + photoW - seam);
  const y1 = Math.min(aH, photoY + photoH - seam);
  for (let y = y0; y < y1; y++) {
    const row = y * aW;
    for (let x = x0; x < x1; x++) mask[row + x] = 0;
  }
  return mask;
}

async function cropGeneratedToMatchingAspect(generated: Buffer, canvasW: number, canvasH: number): Promise<Buffer> {
  const oriented = await sharp(generated, { failOn: "none" }).rotate().png().toBuffer();
  const meta = await sharp(oriented, { failOn: "none" }).metadata();
  const gw = meta.width ?? 0;
  const gh = meta.height ?? 0;
  if (gw < 8 || gh < 8) {
    throw new Error("La generada no tiene tamaño válido.");
  }
  const targetAspect = canvasW / canvasH;
  const srcAspect = gw / gh;
  if (Math.abs(srcAspect - targetAspect) / targetAspect <= ASPECT_TOLERANCE) return oriented;
  let extract = { left: 0, top: 0, width: gw, height: gh };
  if (srcAspect > targetAspect) {
    const width = Math.max(8, Math.round(gh * targetAspect));
    extract = { left: Math.max(0, Math.round((gw - width) / 2)), top: 0, width: Math.min(width, gw), height: gh };
  } else {
    const height = Math.max(8, Math.round(gw / targetAspect));
    extract = { left: 0, top: Math.max(0, Math.round((gh - height) / 2)), width: gw, height: Math.min(height, gh) };
  }
  return sharp(oriented, { failOn: "none" }).extract(extract).png().toBuffer();
}

async function cropGeneratedToCanvas(generated: Buffer, canvasW: number, canvasH: number): Promise<Buffer> {
  const matched = await cropGeneratedToMatchingAspect(generated, canvasW, canvasH);
  return sharp(matched, { failOn: "none" })
    .removeAlpha()
    .toColourspace("srgb")
    .resize(canvasW, canvasH, { kernel: sharp.kernel.lanczos3, fit: "fill" })
    .raw()
    .toBuffer();
}

async function expandComposeImages(args: PreserveComposeArgs): Promise<PreserveComposeResult> {
  const timings: PreserveComposeTimings = {};
  const mark = (label: string, start: number) => {
    timings[label] = Math.round(performance.now() - start);
  };
  const pad = normalizeExpandPad(args.expand!);
  if (!pad) {
    return preserveComposeImages({ ...args, expand: null });
  }
  const analysisMaxSide = args.analysisMaxSide ?? PRESERVE_COMPOSE_DEFAULT_ANALYSIS_SIDE;
  const maxPixels = args.maxPixels ?? PRESERVE_COMPOSE_MAX_PIXELS;

  let t = performance.now();
  const orig = await decodeRgb(args.base);
  const canvasW = orig.width + pad.left + pad.right;
  const canvasH = orig.height + pad.top + pad.bottom;
  mark("decode", t);
  if (canvasW * canvasH > maxPixels) {
    return {
      composed: false,
      decision: "too-large",
      reason: `El lienzo ampliado tiene ${Math.round((canvasW * canvasH) / 1e6)} Mpx; el máximo es ${Math.round(maxPixels / 1e6)} Mpx.`,
      width: orig.width,
      height: orig.height,
      stats: null,
      maskPreviewPng: null,
      timings,
    };
  }

  t = performance.now();
  const expanded = await sharp(orig.data, { raw: { width: orig.width, height: orig.height, channels: 3 } })
    .extend({
      left: pad.left,
      top: pad.top,
      right: pad.right,
      bottom: pad.bottom,
      extendWith: "copy",
    })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const base = { data: expanded.data, width: expanded.info.width, height: expanded.info.height };
  const W = base.width;
  const H = base.height;
  const genFull = await cropGeneratedToCanvas(args.generated, W, H);
  mark("expandCanvas", t);

  t = performance.now();
  const scale = Math.min(1, analysisMaxSide / Math.max(W, H));
  const aW = Math.max(8, Math.round(W * scale));
  const aH = Math.max(8, Math.round(H * scale));
  const [baseA, genA] = await Promise.all([
    resizeRgbRaw(base.data, W, H, aW, aH),
    resizeRgbRaw(genFull, W, H, aW, aH),
  ]);
  const workMask = expandWorkMask({
    aW,
    aH,
    origW: orig.width,
    origH: orig.height,
    pad,
    canvasW: W,
    canvasH: H,
  });
  mark("downscale", t);

  const changed = workMask.reduce((n, v) => n + (v ? 1 : 0), 0);
  const stats = {
    decision: "compose" as const,
    reason: null,
    changedFraction: changed / (aW * aH),
    rawChangedFraction: changed / (aW * aH),
    priorFraction: changed / (aW * aH),
    componentsKept: 1,
    componentsDropped: 0,
    noiseFloor: 0,
    toneGain: [1, 1, 1] as [number, number, number],
    toneOffset: [0, 0, 0] as [number, number, number],
    shift: { dx: 0, dy: 0 },
    ringRadiusPx: Math.max(3, Math.round(Math.max(aW, aH) * 0.02)),
    analysisWidth: aW,
    analysisHeight: aH,
  };
  const preview = args.wantMaskPreview ? await maskPreviewPng(workMask, aW, aH) : null;

  t = performance.now();
  const perComponent =
    args.opticalMatch === false
      ? null
      : measureOpticalMatchPerComponent({
          base: baseA,
          generated: genA,
          mask: workMask,
          w: aW,
          h: aH,
          ringPx: stats.ringRadiusPx,
        });
  const optical = perComponent?.summary ?? null;
  const opticalComponents = perComponent?.components ?? [];
  mark("optical", t);

  t = performance.now();
  const grainScale = Math.sqrt(Math.max(1, W / aW));
  let variants: NonNullable<Parameters<typeof blendInPlace>[0]["variants"]> | null = null;
  if (perComponent && perComponent.components.length > 0) {
    const labelCount = perComponent.components.length + 1;
    const sourceByLabel = new Int32Array(labelCount);
    const grainByLabel = new Float32Array(labelCount);
    const sources: Buffer[] = [genFull];
    const sigmaIndex = new Map<number, number>();
    for (const comp of perComponent.components) {
      const sigmaA = Math.round(comp.stats.blurSigmaPx * 4) / 4;
      const sigmaFull = (sigmaA * W) / aW;
      if (sigmaFull >= 0.3) {
        let idx = sigmaIndex.get(sigmaA);
        if (idx == null) {
          const blurred = await sharp(genFull, { raw: { width: W, height: H, channels: 3 } })
            .blur(Math.min(60, sigmaFull))
            .raw()
            .toBuffer();
          idx = sources.push(blurred) - 1;
          sigmaIndex.set(sigmaA, idx);
        }
        sourceByLabel[comp.label] = idx;
      }
      grainByLabel[comp.label] = comp.stats.grainAdded > 0 ? Math.min(14, comp.stats.grainAdded * grainScale) : 0;
    }
    if (sources.length > 1 || Array.from(grainByLabel).some((g) => g > 0)) {
      variants = {
        labels: perComponent.labels,
        labelsWidth: aW,
        labelsHeight: aH,
        sources,
        sourceByLabel,
        grainByLabel,
      };
    }
  }
  mark("opticalVariants", t);

  t = performance.now();
  const featherPx = featherPxForSize(W, H);
  const maskSoft = await upscaleSoftMask(workMask, aW, aH, W, H, Math.max(0.3, featherPx * 0.5));
  mark("mask", t);

  t = performance.now();
  const seamFactor = 4;
  const sW = Math.max(4, Math.floor(aW / seamFactor));
  const sH = Math.max(4, Math.floor(aH / seamFactor));
  const [baseS, genS, maskS] = await Promise.all([
    resizeRgbRaw(Buffer.from(baseA.buffer, baseA.byteOffset, baseA.byteLength), aW, aH, sW, sH),
    resizeRgbRaw(Buffer.from(genA.buffer, genA.byteOffset, genA.byteLength), aW, aH, sW, sH),
    upscaleSoftMask(workMask, aW, aH, sW, sH, 0.3),
  ]);
  const maskSArr = new Uint8Array(maskS.buffer, maskS.byteOffset, maskS.byteLength);
  const toneLimits = adaptiveToneLimits({ base: baseS, generated: genS, maskSoft: maskSArr, n: sW * sH });
  const correction = computeLowFrequencyCorrection({
    base: baseS,
    generated: genS,
    maskSoft: maskSArr,
    width: sW,
    height: sH,
    sigmaPx: Math.max(1.5, 0.02 * Math.max(sW, sH)),
    robustThreshold: toneLimits.robustThreshold,
    maxCorrection: toneLimits.maxCorrection,
  });
  mark("seam", t);

  t = performance.now();
  blendInPlace({
    base: base.data,
    generated: genFull,
    maskSoft,
    width: W,
    height: H,
    correction,
    correctionWidth: sW,
    correctionHeight: sH,
    grain: { std: 0, seed: W * 31 + H },
    variants,
  });
  mark("blend", t);

  t = performance.now();
  const png = await sharp(base.data, { raw: { width: W, height: H, channels: 3 } })
    .png({ compressionLevel: 6 })
    .toBuffer();
  mark("encode", t);

  return {
    composed: true,
    png,
    width: W,
    height: H,
    stats,
    maskPreviewPng: preview,
    timings,
    optical,
    opticalComponents,
    toneLimits,
    usedPriorFallback: false,
  };
}

export async function preserveComposeImages(args: PreserveComposeArgs): Promise<PreserveComposeResult> {
  if (args.expand && normalizeExpandPad(args.expand)) {
    return expandComposeImages(args);
  }
  const timings: PreserveComposeTimings = {};
  const mark = (label: string, start: number) => {
    timings[label] = Math.round(performance.now() - start);
  };
  const analysisMaxSide = args.analysisMaxSide ?? PRESERVE_COMPOSE_DEFAULT_ANALYSIS_SIDE;
  const maxPixels = args.maxPixels ?? PRESERVE_COMPOSE_MAX_PIXELS;

  let t = performance.now();
  const base = await decodeRgb(args.base);
  const W = base.width;
  const H = base.height;
  const genMeta = await sharp(args.generated, { failOn: "none" }).rotate().metadata();
  const gw = genMeta.width ?? 0;
  const gh = genMeta.height ?? 0;
  mark("decode", t);

  if (W < 8 || H < 8 || gw < 8 || gh < 8) {
    return {
      composed: false,
      decision: "aspect-mismatch",
      reason: "Dimensiones inválidas en base o generada.",
      width: W,
      height: H,
      stats: null,
      maskPreviewPng: null,
      timings,
    };
  }
  if (W * H > maxPixels) {
    return {
      composed: false,
      decision: "too-large",
      reason: `La base tiene ${Math.round((W * H) / 1e6)} Mpx; el máximo para componer es ${Math.round(maxPixels / 1e6)} Mpx.`,
      width: W,
      height: H,
      stats: null,
      maskPreviewPng: null,
      timings,
    };
  }
  const baseAspect = W / H;
  const genAspect = gw / gh;
  const generatedFitted =
    Math.abs(baseAspect - genAspect) / baseAspect > ASPECT_TOLERANCE
      ? await cropGeneratedToMatchingAspect(args.generated, W, H)
      : args.generated;

  // Escala de análisis.
  t = performance.now();
  const scale = Math.min(1, analysisMaxSide / Math.max(W, H));
  const aW = Math.max(8, Math.round(W * scale));
  const aH = Math.max(8, Math.round(H * scale));
  const [baseA, genA, priorA] = await Promise.all([
    resizeRgbRaw(base.data, W, H, aW, aH),
    sharp(generatedFitted, { failOn: "none" })
      .rotate()
      .removeAlpha()
      .toColourspace("srgb")
      .resize(aW, aH, { kernel: sharp.kernel.lanczos3, fit: "fill" })
      .raw()
      .toBuffer()
      .then((b) => new Uint8Array(b.buffer, b.byteOffset, b.byteLength)),
    args.priorMask ? decodePriorMask(args.priorMask, aW, aH) : Promise.resolve(null),
  ]);
  mark("downscale", t);

  t = performance.now();
  const options = resolveChangeMaskOptions(args.sensitivity ?? "auto", args.optionOverrides);
  const analysis = analyzeChangeMask({ width: aW, height: aH, base: baseA, generated: genA, prior: priorA, options });
  mark("analyze", t);

  // Máscara de trabajo: la del análisis o, como respaldo, el lazo dilatado.
  let workMask = analysis.mask;
  let usedPriorFallback = false;
  if (analysis.stats.decision !== "compose") {
    const canFallback = Boolean(args.fallbackToPrior && priorA);
    if (!canFallback) {
      const preview = args.wantMaskPreview ? await maskPreviewPng(analysis.mask, aW, aH) : null;
      return {
        composed: false,
        decision: analysis.stats.decision,
        reason: analysis.stats.reason ?? "No se compone.",
        width: W,
        height: H,
        stats: analysis.stats,
        maskPreviewPng: preview,
        timings,
      };
    }
    workMask = dilateRound(priorA!, aW, aH, Math.max(2, Math.round(Math.max(aW, aH) * 0.008)));
    usedPriorFallback = true;
  }
  const preview = args.wantMaskPreview ? await maskPreviewPng(workMask, aW, aH) : null;

  // Igualación óptica (nitidez + grano) por componente, medida a escala de análisis sobre la
  // generada ajustada. Cada zona tiene su propio anillo: una en el fondo desenfocado y otra en el
  // sujeto enfocado no comparten objetivo.
  t = performance.now();
  const perComponent =
    args.opticalMatch === false
      ? null
      : measureOpticalMatchPerComponent({
          base: baseA,
          generated: analysis.generatedAdjusted,
          mask: workMask,
          w: aW,
          h: aH,
          ringPx: Math.max(3, analysis.stats.ringRadiusPx || Math.round(Math.max(aW, aH) * 0.02)),
        });
  const optical = perComponent?.summary ?? null;
  const opticalComponents = perComponent?.components ?? [];
  mark("optical", t);

  // Generada a resolución completa: alineada + tono igualado.
  t = performance.now();
  const sdx = Math.round((analysis.stats.shift.dx * W) / aW);
  const sdy = Math.round((analysis.stats.shift.dy * H) / aH);
  let genPipeline = sharp(generatedFitted, { failOn: "none" })
    .rotate()
    .removeAlpha()
    .toColourspace("srgb")
    .resize(W, H, { kernel: sharp.kernel.lanczos3, fit: "fill" });
  genPipeline = translatePipeline(genPipeline, sdx, sdy, W, H);
  const { toneGain, toneOffset } = analysis.stats;
  if (toneGain.some((g) => g !== 1) || toneOffset.some((o) => o !== 0)) {
    genPipeline = genPipeline.linear([...toneGain], [...toneOffset]);
  }
  const genFull = await genPipeline.raw().toBuffer();
  mark("generatedFull", t);

  // Variantes desenfocadas: una por cada σ distinto (redondeado a 0.25 px de análisis) entre los
  // componentes; el blend elige la variante por etiqueta. El grano también va por componente.
  t = performance.now();
  const grainScale = Math.sqrt(Math.max(1, W / aW));
  let variants: NonNullable<Parameters<typeof blendInPlace>[0]["variants"]> | null = null;
  if (perComponent && perComponent.components.length > 0) {
    const labelCount = perComponent.components.length + 1;
    const sourceByLabel = new Int32Array(labelCount);
    const grainByLabel = new Float32Array(labelCount);
    const sources: Buffer[] = [genFull];
    const sigmaIndex = new Map<number, number>();
    for (const comp of perComponent.components) {
      const sigmaA = Math.round(comp.stats.blurSigmaPx * 4) / 4;
      const sigmaFull = (sigmaA * W) / aW;
      if (sigmaFull >= 0.3) {
        let idx = sigmaIndex.get(sigmaA);
        if (idx == null) {
          const blurred = await sharp(genFull, { raw: { width: W, height: H, channels: 3 } })
            .blur(Math.min(60, sigmaFull))
            .raw()
            .toBuffer();
          idx = sources.push(blurred) - 1;
          sigmaIndex.set(sigmaA, idx);
        }
        sourceByLabel[comp.label] = idx;
      }
      grainByLabel[comp.label] = comp.stats.grainAdded > 0 ? Math.min(14, comp.stats.grainAdded * grainScale) : 0;
    }
    if (sources.length > 1 || Array.from(grainByLabel).some((g) => g > 0)) {
      variants = {
        labels: perComponent.labels,
        labelsWidth: aW,
        labelsHeight: aH,
        sources,
        sourceByLabel,
        grainByLabel,
      };
    }
  }
  mark("opticalVariants", t);

  // Máscara suave a resolución completa.
  t = performance.now();
  const featherPx = featherPxForSize(W, H);
  const maskSoft = await upscaleSoftMask(workMask, aW, aH, W, H, Math.max(0.3, featherPx * 0.5));
  mark("mask", t);

  // Corrección de costura (baja frecuencia) a 1/4 de la escala de análisis: es un campo suave,
  // y el blend la remuestrea bilinealmente, así que no hace falta más resolución.
  t = performance.now();
  const seamFactor = 4;
  const sW = Math.max(4, Math.floor(aW / seamFactor));
  const sH = Math.max(4, Math.floor(aH / seamFactor));
  const [baseS, genS, maskS] = await Promise.all([
    resizeRgbRaw(Buffer.from(baseA.buffer, baseA.byteOffset, baseA.byteLength), aW, aH, sW, sH),
    resizeRgbRaw(
      Buffer.from(analysis.generatedAdjusted.buffer, analysis.generatedAdjusted.byteOffset, analysis.generatedAdjusted.byteLength),
      aW,
      aH,
      sW,
      sH,
    ),
    upscaleSoftMask(workMask, aW, aH, sW, sH, 0.3),
  ]);
  const maskSArr = new Uint8Array(maskS.buffer, maskS.byteOffset, maskS.byteLength);
  const toneLimits = adaptiveToneLimits({ base: baseS, generated: genS, maskSoft: maskSArr, n: sW * sH });
  const correction = computeLowFrequencyCorrection({
    base: baseS,
    generated: genS,
    maskSoft: maskSArr,
    width: sW,
    height: sH,
    sigmaPx: Math.max(1.5, 0.02 * Math.max(sW, sH)),
    robustThreshold: toneLimits.robustThreshold,
    maxCorrection: toneLimits.maxCorrection,
  });
  mark("seam", t);

  t = performance.now();
  blendInPlace({
    base: base.data,
    generated: genFull,
    maskSoft,
    width: W,
    height: H,
    correction,
    correctionWidth: sW,
    correctionHeight: sH,
    grain: { std: 0, seed: W * 31 + H },
    variants,
  });
  mark("blend", t);

  t = performance.now();
  const png = await sharp(base.data, { raw: { width: W, height: H, channels: 3 } })
    .png({ compressionLevel: 6 })
    .toBuffer();
  mark("encode", t);

  return {
    composed: true,
    png,
    width: W,
    height: H,
    stats: analysis.stats,
    maskPreviewPng: preview,
    timings,
    optical,
    opticalComponents,
    toneLimits,
    usedPriorFallback,
  };
}
