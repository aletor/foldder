"use client";

export const FOLDDER_IMAGE_OPT_MAX_LONG_SIDE = 2000;
export const FOLDDER_IMAGE_OPT_JPEG_QUALITY = 0.7;
export const FOLDDER_IMAGE_OPT_WEBP_QUALITY = 0.82;

export type FoldderOptimizedImageBlob = {
  blob: Blob;
  ext: "jpg" | "png" | "webp";
};

function efficientImageExt(mime: string): "jpg" | "webp" | null {
  const mimeLower = mime.toLowerCase();
  if (mimeLower.includes("jpeg") || mimeLower.includes("jpg")) return "jpg";
  if (mimeLower.includes("webp")) return "webp";
  return null;
}

function hasTransparencyInImageData(data: ImageData): boolean {
  const d = data.data;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i]! < 255) return true;
  }
  return false;
}

async function bitmapHasAlpha(bmp: ImageBitmap): Promise<boolean> {
  const width = Math.min(64, bmp.width);
  const height = Math.min(64, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(bmp, 0, 0, width, height);
  try {
    return hasTransparencyInImageData(ctx.getImageData(0, 0, width, height));
  } catch {
    return true;
  }
}

async function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

/**
 * Política global Foldder para imagen importada:
 * lado largo <= 2000px, JPEG 70% si es opaca, WebP 82% si conserva alpha.
 */
export async function optimizeImageBlobForFoldder(
  blob: Blob,
  mimeHint = blob.type || "image/jpeg",
): Promise<FoldderOptimizedImageBlob> {
  const bmp = await createImageBitmap(blob);
  try {
    const iw = bmp.width;
    const ih = bmp.height;
    const scale = Math.min(1, FOLDDER_IMAGE_OPT_MAX_LONG_SIDE / Math.max(iw, ih, 1));
    const width = Math.max(1, Math.round(iw * scale));
    const height = Math.max(1, Math.round(ih * scale));
    const mimeLower = (mimeHint || blob.type || "").toLowerCase();
    const passthroughExt = scale === 1 ? efficientImageExt(mimeLower) : null;
    if (passthroughExt) {
      return { blob, ext: passthroughExt };
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, width, height);

    const withAlpha =
      mimeLower.includes("jpeg") || mimeLower.includes("jpg")
        ? false
        : await bitmapHasAlpha(bmp);

    if (!withAlpha) {
      const out = await canvasToBlob(canvas, "image/jpeg", FOLDDER_IMAGE_OPT_JPEG_QUALITY);
      if (!out) throw new Error("jpeg encode failed");
      return { blob: out, ext: "jpg" };
    }

    const webp = await canvasToBlob(canvas, "image/webp", FOLDDER_IMAGE_OPT_WEBP_QUALITY);
    if (webp && webp.size > 0) {
      return { blob: webp, ext: "webp" };
    }

    const png = await canvasToBlob(canvas, "image/png");
    if (!png) throw new Error("png encode failed");
    return { blob: png, ext: "png" };
  } finally {
    bmp.close();
  }
}
