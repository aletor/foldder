import sharp from "sharp";
import {
  PAGE_VISION_NIVEL1_JPEG_QUALITY,
  PAGE_VISION_NIVEL1_MAX_LONG_EDGE,
} from "./page-vision-pass-version";

export async function resizePngForNivel1Batch(
  pngBuffer: Buffer,
  maxLongEdge: number = PAGE_VISION_NIVEL1_MAX_LONG_EDGE,
): Promise<Buffer> {
  const meta = await sharp(pngBuffer).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height || Math.max(width, height) <= maxLongEdge) return pngBuffer;
  return sharp(pngBuffer)
    .resize({
      width: width >= height ? maxLongEdge : undefined,
      height: height > width ? maxLongEdge : undefined,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
}

/** PNG redimensionado → JPEG para reducir payload del batch (~5–10× vs PNG 1024). */
export async function encodeJpegForNivel1Batch(
  pngBuffer: Buffer,
  maxLongEdge: number = PAGE_VISION_NIVEL1_MAX_LONG_EDGE,
): Promise<{ buffer: Buffer; mimeType: "image/jpeg" }> {
  const resized = await resizePngForNivel1Batch(pngBuffer, maxLongEdge);
  const buffer = await sharp(resized)
    .jpeg({ quality: PAGE_VISION_NIVEL1_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
  return { buffer, mimeType: "image/jpeg" };
}
