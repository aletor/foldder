import { forceDownloadUrl, sanitizeDownloadFilename } from "@/lib/browser-download";
import type { MediaListItem } from "./media-list-output";

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|avif)(?:\?|$)/i;
const DATA_IMAGE_MIME_RE = /^data:(image\/[^;,]+)/i;

function extensionFromMime(mime: string): string | null {
  const m = mime.toLowerCase();
  if (m.includes("png")) return ".png";
  if (m.includes("webp")) return ".webp";
  if (m.includes("gif")) return ".gif";
  if (m.includes("jpeg") || m.includes("jpg")) return ".jpg";
  if (m.includes("avif")) return ".avif";
  return null;
}

function extensionFromPath(path: string): string | null {
  const match = path.toLowerCase().match(IMAGE_EXT_RE);
  if (!match?.[1]) return null;
  const ext = match[1];
  if (ext === "jpeg") return ".jpg";
  return `.${ext}`;
}

/** Heurística: ¿esta imagen de media_list debería tratarse como PNG con alpha? */
export function mediaListImageLikelyHasTransparency(item: MediaListItem): boolean {
  if (item.mediaType !== "image") return false;
  const mime = item.mimeType?.toLowerCase() ?? "";
  if (mime.includes("png") || mime.includes("webp") || mime.includes("gif")) return true;
  const probe = [item.s3Key, item.url, item.assetId].filter(Boolean).join(" ").toLowerCase();
  if (probe.includes("data:image/png") || probe.includes("data:image/webp")) return true;
  if (/\/matte\//.test(probe) || /background[-_]?remov/i.test(probe)) return true;
  if (/\.png(?:\?|$)/i.test(probe)) return true;
  return false;
}

/** Extensión de descarga para una imagen de media_list. */
export function inferMediaListImageDownloadExtension(item: MediaListItem): string {
  const mimeExt = item.mimeType ? extensionFromMime(item.mimeType) : null;
  if (mimeExt) return mimeExt;

  for (const ref of [item.s3Key, item.url, item.assetId]) {
    if (!ref) continue;
    const dataMatch = DATA_IMAGE_MIME_RE.exec(ref.trim());
    if (dataMatch) {
      const fromData = extensionFromMime(dataMatch[1]!);
      if (fromData) return fromData;
    }
    const fromPath = extensionFromPath(ref);
    if (fromPath) return fromPath;
  }

  if (mediaListImageLikelyHasTransparency(item)) return ".png";
  return ".jpg";
}

export function inferMediaListImageMimeType(item: MediaListItem): string | undefined {
  if (item.mimeType?.trim()) return item.mimeType.trim();
  const ext = inferMediaListImageDownloadExtension(item);
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".jpg") return "image/jpeg";
  return undefined;
}

export function mediaListDownloadFilename(item: MediaListItem): string {
  const base = sanitizeDownloadFilename(item.title || item.id || "media");
  if (/\.[a-z0-9]{2,8}$/i.test(base)) return base;
  if (item.mediaType === "video") return `${base}.mp4`;
  if (item.mediaType === "audio") return `${base}.mp3`;
  if (item.mediaType === "image") return `${base}${inferMediaListImageDownloadExtension(item)}`;
  return base;
}

function clickDownloadBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = sanitizeDownloadFilename(filename);
  anchor.rel = "noreferrer";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

async function imageBlobToPng(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas_unavailable");
    ctx.drawImage(bitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((out) => (out ? resolve(out) : reject(new Error("png_encode_failed"))), "image/png");
    });
  } finally {
    bitmap.close();
  }
}

/** Descarga una imagen de media_list preservando transparencia como PNG. */
export async function downloadMediaListImageUrl(url: string, item: MediaListItem): Promise<void> {
  const filename = mediaListDownloadFilename(item);
  const wantsPng =
    mediaListImageLikelyHasTransparency(item) || inferMediaListImageDownloadExtension(item) === ".png";

  if (!wantsPng) {
    await forceDownloadUrl(url, filename);
    return;
  }

  const response = await fetch(url, { mode: "cors", credentials: "omit" });
  if (!response.ok) throw new Error(`download_failed_${response.status}`);
  const blob = await response.blob();
  const pngBlob = blob.type.includes("png") ? blob : await imageBlobToPng(blob);
  const base = sanitizeDownloadFilename(filename).replace(/\.[a-z0-9]{2,8}$/i, "") || "media";
  clickDownloadBlob(pngBlob, `${base}.png`);
}
