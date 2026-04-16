/**
 * Cliente: redimensionado y recompresión para versión OPT (sin cambiar layout en página).
 */

import { fetchBlobViaSpacesProxy } from "@/lib/spaces-proxy-fetch";

const MAX_LONG_SIDE = 2000;
const JPEG_QUALITY = 0.7;

let _assetSeq = 0;
export function newDesignerAssetId(): string {
  return `ds_${Date.now()}_${++_assetSeq}_${Math.random().toString(36).slice(2, 9)}`;
}

function hasTransparencyInImageData(data: ImageData): boolean {
  const d = data.data;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i]! < 255) return true;
  }
  return false;
}

/** Muestreo rápido de alpha en bitmap escalado. */
async function bitmapHasAlpha(bmp: ImageBitmap): Promise<boolean> {
  const w = Math.min(64, bmp.width);
  const h = Math.min(64, bmp.height);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(bmp, 0, 0, w, h);
  try {
    const imgData = ctx.getImageData(0, 0, w, h);
    return hasTransparencyInImageData(imgData);
  } catch {
    return true;
  }
}

/**
 * Produce blob OPT: lado largo ≤ 2000, proporción intacta.
 * Sin alpha → JPEG 70%. Con alpha → WebP (fallback PNG).
 */
export async function optimizeImageBlobToOptFormat(blob: Blob, mimeHint: string): Promise<{ blob: Blob; ext: string }> {
  const bmp = await createImageBitmap(blob);
  try {
    const iw = bmp.width;
    const ih = bmp.height;
    const long = Math.max(iw, ih);
    const scale = long > MAX_LONG_SIDE ? MAX_LONG_SIDE / long : 1;
    const nw = Math.max(1, Math.round(iw * scale));
    const nh = Math.max(1, Math.round(ih * scale));

    const canvas = document.createElement("canvas");
    canvas.width = nw;
    canvas.height = nh;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, nw, nh);

    const mimeLower = (mimeHint || blob.type || "").toLowerCase();
    let withAlpha: boolean;
    if (mimeLower.includes("jpeg") || mimeLower.includes("jpg")) {
      withAlpha = false;
    } else if (mimeLower.includes("png") || mimeLower.includes("gif") || mimeLower.includes("webp")) {
      withAlpha = await bitmapHasAlpha(bmp);
    } else {
      withAlpha = await bitmapHasAlpha(bmp);
    }

    if (!withAlpha) {
      const out = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY);
      });
      if (!out) throw new Error("jpeg encode failed");
      return { blob: out, ext: "jpg" };
    }

    const webp = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/webp", 0.82);
    });
    if (webp && webp.size > 0) {
      return { blob: webp, ext: "webp" };
    }
    const png = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/png");
    });
    if (!png) throw new Error("png encode failed");
    return { blob: png, ext: "png" };
  } finally {
    bmp.close();
  }
}

export async function fetchBlobViaProxy(url: string): Promise<{ blob: Blob; mime: string }> {
  const blob = await fetchBlobViaSpacesProxy(url);
  return { blob, mime: blob.type || "application/octet-stream" };
}

