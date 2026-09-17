/**
 * Recorte seguro sobre una imagen ya auto-orientada (EXIF).
 * Sharp lanza `extract_area: bad extract area` si las coords se calculan con el tamaño
 * del archivo (antes de rotar) o si left+width se sale 1 px por redondeo.
 */

import sharp from "sharp";

export type ImageRect = { x: number; y: number; width: number; height: number };

export function clampExtractArea(crop: ImageRect, fullWidth: number, fullHeight: number): ImageRect | null {
  if (fullWidth < 8 || fullHeight < 8) return null;
  const x = Math.max(0, Math.min(fullWidth - 8, Math.round(crop.x)));
  const y = Math.max(0, Math.min(fullHeight - 8, Math.round(crop.y)));
  const width = Math.max(8, Math.min(fullWidth - x, Math.round(crop.width)));
  const height = Math.max(8, Math.min(fullHeight - y, Math.round(crop.height)));
  if (x < 0 || y < 0 || width < 8 || height < 8) return null;
  if (x + width > fullWidth || y + height > fullHeight) return null;
  return { x, y, width, height };
}

export async function orientImageBuffer(buffer: Buffer): Promise<{ png: Buffer; width: number; height: number }> {
  const png = await sharp(buffer, { failOn: "none" }).rotate().png().toBuffer();
  const meta = await sharp(png, { failOn: "none" }).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 8 || height < 8) {
    throw new Error("La imagen no tiene tamaño válido tras orientar.");
  }
  return { png, width, height };
}

export async function extractOrientedRegion(
  buffer: Buffer,
  crop: ImageRect,
): Promise<{ png: Buffer; nativeCrop: ImageRect; fullWidth: number; fullHeight: number }> {
  const oriented = await orientImageBuffer(buffer);
  const nativeCrop = clampExtractArea(crop, oriented.width, oriented.height);
  if (!nativeCrop) {
    throw new Error(
      `Recorte (${crop.x},${crop.y} ${crop.width}×${crop.height}) fuera de la base (${oriented.width}×${oriented.height}).`,
    );
  }
  const png = await sharp(oriented.png, { failOn: "none" })
    .extract({ left: nativeCrop.x, top: nativeCrop.y, width: nativeCrop.width, height: nativeCrop.height })
    .png()
    .toBuffer();
  return { png, nativeCrop, fullWidth: oriented.width, fullHeight: oriented.height };
}
