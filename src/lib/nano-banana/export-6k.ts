/**
 * Export 6K · post-proceso Sharp (solo servidor).
 *
 * Flujo: Topaz Gigapixel (2x o 4x) → Lanczos al lado largo 6144 → PNG o JPEG.
 * Si la fuente ya es ≥ 6K o está cerca (4K), no hay API: solo se entrega.
 */

import sharp from "sharp";
import {
  EXPORT_6K_JPEG_QUALITY,
  EXPORT_6K_MAX_LONG_SIDE,
  type Export6kFormat,
  type Export6kPlan,
} from "./export-6k-plan";

export {
  EXPORT_6K_JPEG_QUALITY,
  EXPORT_6K_LONG_SIDE,
  EXPORT_6K_MAX_LONG_SIDE,
  chooseTopazFactor,
  coerceExport6kFormat,
  estimateTopazUpscaleUsd,
  planExport6k,
  topazFactorNumeric,
  type Export6kFormat,
  type Export6kPlan,
  type TopazUpscaleFactor,
} from "./export-6k-plan";

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
