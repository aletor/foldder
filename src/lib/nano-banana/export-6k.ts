/**
 * Export 6K · reescala local con Sharp (solo servidor, sin IA ni APIs de pago).
 *
 * Lanczos3 al lado largo 6144, sin sharpen: no inventa detalle ni añade halos.
 * Si la fuente ya es ≥ 6K se entrega tal cual (con tope de seguridad).
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
  coerceExport6kFormat,
  planExport6k,
  type Export6kFormat,
  type Export6kPlan,
} from "./export-6k-plan";

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
