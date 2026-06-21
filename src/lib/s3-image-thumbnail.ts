import sharp from "sharp";
import { clampCanvasThumbMaxSide, isRasterImagePathOrMime } from "@/lib/canvas-media-thumbnail";

export async function buildS3ImageThumbnailBuffer(
  input: Buffer,
  maxSide: number,
  contentType: string,
  key: string,
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
      .webp({ quality: 82 })
      .toBuffer();

    if (!resized.length) return null;
    return { buffer: resized, contentType: "image/webp" };
  } catch {
    return null;
  }
}
