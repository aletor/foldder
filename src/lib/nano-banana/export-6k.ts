/**
 * Export 6K · helpers de geometría y post-proceso (sin llamadas de pago).
 *
 * Flujo: (opcional) encoger entrada a tope GPU → Real-ESRGAN (×2 o ×4)
 * → Lanczos al lado largo objetivo (6144) → PNG.
 * Si la imagen ya es ≥ 6K, no hay upscale ML: solo se entrega (opcionalmente
 * recortada al tope si supera un máximo de seguridad).
 */

import sharp from "sharp";

export const EXPORT_6K_LONG_SIDE = 6144;
/** Tope absoluto para no generar PNG de cientos de MB por accidente. */
export const EXPORT_6K_MAX_LONG_SIDE = 8192;
/**
 * Tope de salida Real-ESRGAN en lucataco (A100, sin tiles).
 * 2K 3:4 ChatGPT (1920×2560) ×2 → 3840×5120 petaba CUDA; capamos a ~4K de salida.
 */
export const ESRGAN_MAX_OUTPUT_LONG = 4096;
/** Tope de píxeles de salida (~4K 3:2). El retrato 2K ×2 se pasa de esto. */
export const ESRGAN_MAX_OUTPUT_PIXELS = 4096 * 2732;

export type Export6kPlan = {
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
  /** Factor Real-ESRGAN (2 | 4). null = sin ML (ya es ≥ 6K o bump pequeño → Lanczos). */
  esrganScale: 2 | 4 | null;
  /** Tras ESRGAN (o la fuente), ¿hace falta Lanczos al target? */
  needsFinalResize: boolean;
  alreadyAtLeast6k: boolean;
};

/**
 * Elige escala ML. El recorte de entrada a GPU va aparte (`fitEsrganInput`).
 * - ×4 para fuentes ~1K.
 * - ×2 para ~2K (incluido retrato ChatGPT 3:4).
 * - Desde ~4K (cerca de 6K) solo Lanczos.
 */
export function chooseEsrganScale(sourceLong: number, targetLong: number): 2 | 4 | null {
  if (sourceLong <= 0) return 2;
  if (sourceLong >= targetLong) return null;
  // Bump pequeño (p. ej. 4K Gemini 4096 → 6K): no hace falta GPU.
  if (sourceLong * 1.5 >= targetLong) return null;
  if (sourceLong <= 1400) return 4;
  return 2;
}

export type EsrganInputFit = {
  width: number;
  height: number;
  needsShrink: boolean;
};

/**
 * Reduce la entrada (Lanczos local, sin API) para que scale × tamaño quepa en GPU.
 * Una sola llamada Replicate después; no es un reintento.
 */
export function fitEsrganInput(width: number, height: number, scale: 2 | 4): EsrganInputFit {
  const w0 = Math.max(1, Math.round(width));
  const h0 = Math.max(1, Math.round(height));
  const maxLong = Math.max(8, Math.floor(ESRGAN_MAX_OUTPUT_LONG / scale));
  const maxPixels = Math.max(64, Math.floor(ESRGAN_MAX_OUTPUT_PIXELS / (scale * scale)));
  const long = Math.max(w0, h0);
  const pixels = w0 * h0;
  const byLong = long > maxLong ? maxLong / long : 1;
  const byPixels = pixels > maxPixels ? Math.sqrt(maxPixels / pixels) : 1;
  const factor = Math.min(1, byLong, byPixels);
  if (factor >= 0.999) return { width: w0, height: h0, needsShrink: false };
  return {
    width: Math.max(8, Math.round(w0 * factor)),
    height: Math.max(8, Math.round(h0 * factor)),
    needsShrink: true,
  };
}

export function planExport6k(width: number, height: number, longSide = EXPORT_6K_LONG_SIDE): Export6kPlan {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const sourceLong = Math.max(w, h);
  const scale = longSide / sourceLong;
  const targetWidth = Math.max(1, Math.round(w * scale));
  const targetHeight = Math.max(1, Math.round(h * scale));
  const alreadyAtLeast6k = sourceLong >= longSide;
  const esrganScale = chooseEsrganScale(sourceLong, longSide);
  const afterMlLong = esrganScale ? sourceLong * esrganScale : sourceLong;
  const needsFinalResize = !alreadyAtLeast6k && afterMlLong !== longSide;
  return {
    sourceWidth: w,
    sourceHeight: h,
    targetWidth,
    targetHeight,
    esrganScale,
    needsFinalResize: alreadyAtLeast6k ? false : needsFinalResize || afterMlLong !== longSide,
    alreadyAtLeast6k,
  };
}

/**
 * Ajusta el buffer (ya upscaleado por ML o la fuente) al tamaño objetivo 6K.
 * Aplica un sharpen suave; PNG sin pérdida.
 */
export async function finalizeExport6kPng(
  buffer: Buffer,
  plan: Export6kPlan,
): Promise<{ png: Buffer; width: number; height: number }> {
  let pipeline = sharp(buffer, { failOn: "none" }).rotate();
  const meta = await pipeline.metadata();
  const curW = meta.width ?? plan.sourceWidth;
  const curH = meta.height ?? plan.sourceHeight;
  const curLong = Math.max(curW, curH);

  if (plan.alreadyAtLeast6k) {
    // Ya es ≥ 6K: entregar tal cual (cap de seguridad si supera el máximo).
    if (curLong > EXPORT_6K_MAX_LONG_SIDE) {
      const s = EXPORT_6K_MAX_LONG_SIDE / curLong;
      pipeline = pipeline.resize(Math.round(curW * s), Math.round(curH * s), {
        kernel: sharp.kernel.lanczos3,
        fit: "fill",
      });
    }
  } else if (curW !== plan.targetWidth || curH !== plan.targetHeight) {
    pipeline = pipeline.resize(plan.targetWidth, plan.targetHeight, {
      kernel: sharp.kernel.lanczos3,
      fit: "fill",
    });
  }

  const png = await pipeline
    .sharpen({ sigma: 0.6, m1: 0.5, m2: 0.4 })
    .png({ compressionLevel: 6 })
    .toBuffer();
  const outMeta = await sharp(png).metadata();
  return {
    png,
    width: outMeta.width ?? plan.targetWidth,
    height: outMeta.height ?? plan.targetHeight,
  };
}
