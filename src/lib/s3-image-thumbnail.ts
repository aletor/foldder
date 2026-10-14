import sharp from "sharp";
import { clampCanvasThumbMaxSide, isRasterImagePathOrMime } from "@/lib/canvas-media-thumbnail";

export async function buildS3ImageThumbnailBuffer(
  input: Buffer,
  maxSide: number,
  contentType: string,
  key: string,
  quality = 82,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const side = clampCanvasThumbMaxSide(maxSide);
  if (!isRasterImagePathOrMime(contentType) && !isRasterImagePathOrMime(key)) {
    return null;
  }

  try {
    const resized = await sharp(input, { failOn: "none" })
      .rotate()
      .resize({
        width: side,
        height: side,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: Math.max(40, Math.min(95, Math.round(quality))) })
      .toBuffer();

    if (!resized.length) return null;
    return { buffer: resized, contentType: "image/webp" };
  } catch {
    return null;
  }
}
