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
  resolveChangeMaskOptions,
  type ChangeMaskDecision,
  type ChangeMaskOptions,
  type ChangeMaskSensitivity,
  type ChangeMaskStats,
} from "./analyze-change-mask";
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
};

export type PreserveComposeTimings = Record<string, number>;

export type PreserveComposeResult =
  | {
      composed: true;
      png: Buffer;
      width: number;
      height: number;
      stats: ChangeMaskStats;
      maskPreviewPng: Buffer | null;
      timings: PreserveComposeTimings;
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
export function blendInPlace(args: {
  base: Buffer;
  generated: Buffer;
  maskSoft: Buffer;
  width: number;
  height: number;
  correction: Float32Array;
  correctionWidth: number;
  correctionHeight: number;
}): void {
  const { base, generated, maskSoft, width: W, height: H, correction: C, correctionWidth: cW, correctionHeight: cH } = args;
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
      for (let c = 0; c < 3; c++) {
        const corr = C[i00 + c]! * w00 + C[i01 + c]! * w01 + C[i10 + c]! * w10 + C[i11 + c]! * w11;
        const g = generated[p + c]! + corr;
        const b = base[p + c]!;
        const v = b * (1 - a) + g * a;
        base[p + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
      }
    }
  }
}

export async function preserveComposeImages(args: PreserveComposeArgs): Promise<PreserveComposeResult> {
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
  if (Math.abs(baseAspect - genAspect) / baseAspect > ASPECT_TOLERANCE) {
    return {
      composed: false,
      decision: "aspect-mismatch",
      reason: `La generada (${gw}×${gh}) no comparte relación de aspecto con la base (${W}×${H}).`,
      width: W,
      height: H,
      stats: null,
      maskPreviewPng: null,
      timings,
    };
  }

  // Escala de análisis.
  t = performance.now();
  const scale = Math.min(1, analysisMaxSide / Math.max(W, H));
  const aW = Math.max(8, Math.round(W * scale));
  const aH = Math.max(8, Math.round(H * scale));
  const [baseA, genA, priorA] = await Promise.all([
    resizeRgbRaw(base.data, W, H, aW, aH),
    sharp(args.generated, { failOn: "none" })
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

  const preview = args.wantMaskPreview ? await maskPreviewPng(analysis.mask, aW, aH) : null;

  if (analysis.stats.decision !== "compose") {
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

  // Generada a resolución completa: alineada + tono igualado.
  t = performance.now();
  const sdx = Math.round((analysis.stats.shift.dx * W) / aW);
  const sdy = Math.round((analysis.stats.shift.dy * H) / aH);
  let genPipeline = sharp(args.generated, { failOn: "none" })
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

  // Máscara suave a resolución completa.
  t = performance.now();
  const featherPx = featherPxForSize(W, H);
  const maskSoft = await upscaleSoftMask(analysis.mask, aW, aH, W, H, Math.max(0.3, featherPx * 0.5));
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
    upscaleSoftMask(analysis.mask, aW, aH, sW, sH, 0.3),
  ]);
  const correction = computeLowFrequencyCorrection({
    base: baseS,
    generated: genS,
    maskSoft: new Uint8Array(maskS.buffer, maskS.byteOffset, maskS.byteLength),
    width: sW,
    height: sH,
    sigmaPx: Math.max(1.5, 0.02 * Math.max(sW, sH)),
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
  };
}
