/**
 * Export 6K · geometría, coste Topaz y post-proceso (sin llamadas de pago).
 *
 * Flujo: Topaz Gigapixel (2x o 4x) → Lanczos al lado largo 6144 → PNG o JPEG.
 * Si la fuente ya es ≥ 6K o está cerca (4K), no hay API: solo se entrega.
 */

import sharp from "sharp";

export const EXPORT_6K_LONG_SIDE = 6144;
/** Tope absoluto para no generar archivos de cientos de MB por accidente. */
export const EXPORT_6K_MAX_LONG_SIDE = 8192;
/** JPEG casi sin pérdida visual (4:4:4). */
export const EXPORT_6K_JPEG_QUALITY = 96;

export type Export6kFormat = "png" | "jpeg";
export type TopazUpscaleFactor = "2x" | "4x";

export type Export6kPlan = {
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
  topazFactor: TopazUpscaleFactor | null;
  topazOutputWidth: number;
  topazOutputHeight: number;
  needsFinalResize: boolean;
  alreadyAtLeast6k: boolean;
};

/**
 * 1K class → 4x (cerca de 6K). 2K class → 2x. 4K / ya 6K → sin API.
 * Nunca 6x: desde 1K se pasa de 6144 y encarece el MP de salida.
 */
export function chooseTopazFactor(sourceLong: number, targetLong: number): TopazUpscaleFactor | null {
  if (sourceLong <= 0) return "2x";
  if (sourceLong >= targetLong) return null;
  if (sourceLong * 1.5 >= targetLong) return null;
  if (sourceLong * 4 <= targetLong * 1.15) return "4x";
  return "2x";
}

export function topazFactorNumeric(factor: TopazUpscaleFactor): 2 | 4 {
  return factor === "4x" ? 4 : 2;
}

/** Precio Replicate Topaz por megapíxel de salida. */
export function estimateTopazUpscaleUsd(outputPixels: number): number {
  const mp = outputPixels / 1_000_000;
  if (mp <= 24) return 0.05;
  if (mp <= 48) return 0.1;
  if (mp <= 60) return 0.15;
  if (mp <= 96) return 0.2;
  if (mp <= 132) return 0.24;
  if (mp <= 168) return 0.29;
  if (mp <= 336) return 0.53;
  return 0.82;
}

export function planExport6k(width: number, height: number, longSide = EXPORT_6K_LONG_SIDE): Export6kPlan {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const sourceLong = Math.max(w, h);
  const scale = longSide / sourceLong;
  const targetWidth = Math.max(1, Math.round(w * scale));
  const targetHeight = Math.max(1, Math.round(h * scale));
  const alreadyAtLeast6k = sourceLong >= longSide;
  const topazFactor = chooseTopazFactor(sourceLong, longSide);
  const mul = topazFactor ? topazFactorNumeric(topazFactor) : 1;
  const topazOutputWidth = w * mul;
  const topazOutputHeight = h * mul;
  const afterLong = Math.max(topazOutputWidth, topazOutputHeight);
  return {
    sourceWidth: w,
    sourceHeight: h,
    targetWidth,
    targetHeight,
    topazFactor,
    topazOutputWidth,
    topazOutputHeight,
    needsFinalResize: alreadyAtLeast6k ? false : afterLong !== longSide,
    alreadyAtLeast6k,
  };
}

export function coerceExport6kFormat(value: unknown): Export6kFormat {
  return value === "jpeg" || value === "jpg" ? "jpeg" : "png";
}

/**
 * Ajusta el buffer (ya upscaleado por Topaz o la fuente) al tamaño 6K.
 */
export async function finalizeExport6k(
  buffer: Buffer,
  plan: Export6kPlan,
  format: Export6kFormat = "png",
): Promise<{ bytes: Buffer; width: number; height: number; mime: string }> {
  let pipeline = sharp(buffer, { failOn: "none", limitInputPixels: false }).rotate();
  const meta = await pipeline.metadata();
  const curW = meta.width ?? plan.sourceWidth;
  const curH = meta.height ?? plan.sourceHeight;
  const curLong = Math.max(curW, curH);

  if (plan.alreadyAtLeast6k) {
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

  pipeline = pipeline.sharpen({ sigma: 0.55, m1: 0.45, m2: 0.35 });

  if (format === "jpeg") {
    const jpeg = await pipeline
      .jpeg({ quality: EXPORT_6K_JPEG_QUALITY, mozjpeg: true, chromaSubsampling: "4:4:4" })
      .toBuffer();
    const outMeta = await sharp(jpeg).metadata();
    return {
      bytes: jpeg,
      width: outMeta.width ?? plan.targetWidth,
      height: outMeta.height ?? plan.targetHeight,
      mime: "image/jpeg",
    };
  }

  const png = await pipeline.png({ compressionLevel: 6 }).toBuffer();
  const outMeta = await sharp(png).metadata();
  return {
    bytes: png,
    width: outMeta.width ?? plan.targetWidth,
    height: outMeta.height ?? plan.targetHeight,
    mime: "image/png",
  };
}
