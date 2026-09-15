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

export type Export6kPlan = {
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
  /** Factor Real-ESRGAN (2 | 4). null = sin ML (ya es ≥ 6K o casi). */
  esrganScale: 2 | 4 | null;
  /** Tras ESRGAN (o la fuente), ¿hace falta Lanczos al target? */
  needsFinalResize: boolean;
  alreadyAtLeast6k: boolean;
};

export function chooseEsrganScale(sourceLong: number, targetLong: number): 2 | 4 | null {
  if (sourceLong <= 0) return 4;
  if (sourceLong >= targetLong) return null;
  if (sourceLong * 2 >= targetLong) return 2;
  return 4;
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
