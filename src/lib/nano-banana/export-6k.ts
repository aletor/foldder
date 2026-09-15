/**
 * Export 6K · helpers de geometría y post-proceso (sin llamadas de pago).
 *
 * Flujo: Real-ESRGAN (×2 o ×4) → Lanczos al lado largo objetivo (6144) → PNG.
 * Si la imagen ya es ≥ 6K, no hay upscale ML: solo se entrega (opcionalmente
 * recortada al tope si supera un máximo de seguridad).
 */

import sharp from "sharp";

export const EXPORT_6K_LONG_SIDE = 6144;
/** Tope absoluto para no generar PNG de cientos de MB por accidente. */
export const EXPORT_6K_MAX_LONG_SIDE = 8192;
/**
 * Tope de salida Real-ESRGAN en Replicate.
 * ×4 desde ~2K (~8K+) provoca CUDA illegal memory access en el worker.
 */
export const ESRGAN_MAX_OUTPUT_LONG = 6144;

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
 * Elige escala ML segura.
 * - ×4 solo si la salida cabe en ~6K (fuentes ~1K).
 * - Desde ~2K preferir ×2 + Lanczos (×4 tumba CUDA).
 * - Desde ~4K (cerca de 6K) solo Lanczos.
 */
export function chooseEsrganScale(sourceLong: number, targetLong: number): 2 | 4 | null {
  if (sourceLong <= 0) return 2;
  if (sourceLong >= targetLong) return null;
  // Bump pequeño (p. ej. 4K Gemini → 6K): no hace falta GPU.
  if (sourceLong * 1.25 >= targetLong) return null;

  const out2 = sourceLong * 2;
  const out4 = sourceLong * 4;

  // ×2 si nos acerca al target sin pasarnos del tope GPU.
  if (out2 <= ESRGAN_MAX_OUTPUT_LONG && out2 >= targetLong * 0.8) return 2;
  // ×4 solo para fuentes pequeñas (1K class).
  if (out4 <= ESRGAN_MAX_OUTPUT_LONG) return 4;
  if (out2 <= ESRGAN_MAX_OUTPUT_LONG) return 2;
  return null;
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
