import { stableKnowledgeFileUrlFromKey, tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";

/** Máx. lado del thumb en nodos del lienzo (coincide con maxWidth 960 del nodo). */
export const FOLDDER_CANVAS_THUMB_MAX_SIDE = 960;

const THUMB_MIN_SIDE = 64;
const THUMB_MAX_SIDE = 2048;

export function clampCanvasThumbMaxSide(value: number): number {
  if (!Number.isFinite(value)) return FOLDDER_CANVAS_THUMB_MAX_SIDE;
  return Math.max(THUMB_MIN_SIDE, Math.min(THUMB_MAX_SIDE, Math.round(value)));
}

export function parseCanvasThumbMaxSideParam(value: string | null | undefined): number | null {
  if (!value?.trim()) return null;
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < THUMB_MIN_SIDE || parsed > THUMB_MAX_SIDE) return null;
  return parsed;
}

export function isDataImageUrl(value: unknown): value is string {
  return typeof value === "string" && /^data:image\/[^;,]+(?:;[^,]*)?;base64,/i.test(value);
}

export function isRasterImagePathOrMime(keyOrMime: string): boolean {
  const value = keyOrMime.trim().toLowerCase();
  if (!value) return false;
  if (value.includes("svg")) return false;
  if (value.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp|gif|avif|heic|heif|bmp|tiff?)$/i.test(value);
}

export function stableKnowledgeFileThumbnailUrlFromKey(
  key: string,
  maxSide: number = FOLDDER_CANVAS_THUMB_MAX_SIDE,
): string | null {
  const base = stableKnowledgeFileUrlFromKey(key);
  if (!base) return null;
  const side = clampCanvasThumbMaxSide(maxSide);
  return `${base}&thumb=${side}`;
}

/** URL de preview en lienzo; conserva data:/blob:/https externas sin tocar. */
export function resolveCanvasThumbnailMediaUrl(
  src?: string | null,
  s3Key?: string | null,
  maxSide: number = FOLDDER_CANVAS_THUMB_MAX_SIDE,
): string | undefined {
  const key = (s3Key?.trim() || tryExtractKnowledgeFilesKeyFromUrl(src || "") || "").trim();
  if (key) return stableKnowledgeFileThumbnailUrlFromKey(key, maxSide) ?? undefined;
  const trimmed = src?.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:") || /^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return trimmed;
}

/** URL completa sin thumb (studio, export, descarga). */
export function resolveFullQualityMediaUrl(
  src?: string | null,
  s3Key?: string | null,
): string | undefined {
  const key = (s3Key?.trim() || tryExtractKnowledgeFilesKeyFromUrl(src || "") || "").trim();
  if (key) return stableKnowledgeFileUrlFromKey(key) ?? undefined;
  const trimmed = src?.trim();
  return trimmed || undefined;
}

export function loadImageElement(src: string, options?: { crossOrigin?: boolean }): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (options?.crossOrigin && !src.startsWith("data:") && !src.startsWith("blob:")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image for canvas thumbnail."));
    img.src = src;
  });
}

/** Genera blob URL reducida para data:/blob: en cliente (preview del lienzo). */
export async function createClientCanvasThumbnailUrl(
  src: string,
  maxSide: number = FOLDDER_CANVAS_THUMB_MAX_SIDE,
): Promise<string | null> {
  if (typeof document === "undefined") return null;
  const side = clampCanvasThumbMaxSide(maxSide);
  try {
    const img = await loadImageElement(src);
    const naturalW = img.naturalWidth || img.width || 1;
    const naturalH = img.naturalHeight || img.height || 1;
    if (Math.max(naturalW, naturalH) <= side) return src;

    const scale = side / Math.max(naturalW, naturalH);
    const width = Math.max(1, Math.round(naturalW * scale));
    const height = Math.max(1, Math.round(naturalH * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return src;
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.82);
    });
    if (!blob) return src;
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export function needsClientCanvasThumbnail(src: string, maxSide: number = FOLDDER_CANVAS_THUMB_MAX_SIDE): boolean {
  if (!isDataImageUrl(src) && !/^blob:/i.test(src)) return false;
  return src.length > maxSide * maxSide * 0.35;
}
