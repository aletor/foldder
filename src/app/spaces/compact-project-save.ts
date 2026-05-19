"use client";

import { projectSavePayloadBytes } from "./project-save-utils";

type CompactOptions = {
  aggressive?: boolean;
  dropEmbeddedMedia?: boolean;
};

export const SAVE_SOFT_LIMIT_BYTES = 3_400_000;
const SAVE_HARD_LIMIT_BYTES = 4_000_000;
const DATA_IMAGE_RE = /^data:image\/[^;,]+(?:;[^,]*)?;base64,/i;
const DATA_URL_RE = /^data:[^,\s]+;base64,/i;
const TINY_TRANSPARENT_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const PREVIEW_KEYS = new Set([
  "thumbnailUrl",
  "previewUrl",
  "displayUrl",
  "imageUrlForVision",
  "markedRef2DataUrl",
  "colorMapUrl",
  "paintData",
  "referenceImageData",
]);

const DROP_KEYS = new Set([
  "redoStack",
  "undoStack",
  "localObjectUrl",
  "objectURL",
  "objectUrl",
  "objectUrls",
  "objectURLS",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isDataUrl(value: unknown): value is string {
  return typeof value === "string" && DATA_URL_RE.test(value);
}

function objectHasPersistentMediaRef(value: Record<string, unknown>): boolean {
  return Object.entries(value).some(([key, raw]) => {
    if (typeof raw !== "string" || !raw.trim()) return false;
    const k = key.toLowerCase();
    return (
      k.includes("s3") ||
      k === "key" ||
      k.endsWith("key") ||
      k.includes("fileurl") ||
      (/url$/.test(k) && /^https?:\/\//i.test(raw))
    );
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Unable to compact embedded project image."));
    img.src = src;
  });
}

async function compactDataImage(
  dataUrl: string,
  options: { maxBytes: number; maxSide: number; quality: number },
): Promise<string> {
  if (typeof document === "undefined") return dataUrl;
  const img = await loadImage(dataUrl);
  let maxSide = options.maxSide;
  let quality = options.quality;
  let best = dataUrl;

  for (let attempt = 0; attempt < 4; attempt++) {
    const scale = Math.min(
      1,
      maxSide / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height, 1),
    );
    const width = Math.max(1, Math.round((img.naturalWidth || img.width || 1) * scale));
    const height = Math.max(1, Math.round((img.naturalHeight || img.height || 1) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return best;
    ctx.drawImage(img, 0, 0, width, height);
    best = canvas.toDataURL("image/jpeg", quality);
    if (best.length <= options.maxBytes) return best;
    maxSide = Math.max(240, Math.floor(maxSide * 0.68));
    quality = Math.max(0.46, quality - 0.1);
  }

  return best.length <= options.maxBytes ? best : TINY_TRANSPARENT_PNG;
}

async function compactValue(
  value: unknown,
  key: string,
  parent: Record<string, unknown> | null,
  options: Required<CompactOptions>,
): Promise<unknown> {
  if (DROP_KEYS.has(key)) return undefined;

  if (typeof value === "string") {
    if (!isDataUrl(value)) return value;
    if (options.dropEmbeddedMedia) return undefined;

    const hasPersistentRef = parent ? objectHasPersistentMediaRef(parent) : false;
    const previewLike = PREVIEW_KEYS.has(key) || /thumb|preview|display|paint|marked|vision/i.test(key);

    if (hasPersistentRef && (previewLike || options.aggressive)) {
      return undefined;
    }

    if (!DATA_IMAGE_RE.test(value)) {
      return value.length > 32_000 ? undefined : value;
    }

    const maxBytes = options.aggressive || previewLike ? 55_000 : 140_000;
    if (value.length <= maxBytes) return value;

    try {
      return await compactDataImage(value, {
        maxBytes,
        maxSide: options.aggressive || previewLike ? 420 : 720,
        quality: options.aggressive || previewLike ? 0.58 : 0.68,
      });
    } catch {
      return hasPersistentRef || previewLike || options.aggressive ? undefined : TINY_TRANSPARENT_PNG;
    }
  }

  if (Array.isArray(value)) {
    const next: unknown[] = [];
    for (const item of value) {
      const compacted = await compactValue(item, key, null, options);
      if (compacted !== undefined) next.push(compacted);
    }
    return next;
  }

  if (isRecord(value)) {
    const next: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      if (DROP_KEYS.has(childKey)) continue;
      const compacted = await compactValue(childValue, childKey, value, options);
      if (compacted !== undefined) next[childKey] = compacted;
    }
    return next;
  }

  return value;
}

export async function compactProjectForSave<T>(project: T): Promise<{ project: T; bytes: number; compacted: boolean }> {
  const initialBytes = projectSavePayloadBytes(project);
  if (initialBytes <= SAVE_SOFT_LIMIT_BYTES) {
    return { project, bytes: initialBytes, compacted: false };
  }

  let compacted = (await compactValue(project, "", null, {
    aggressive: false,
    dropEmbeddedMedia: false,
  })) as T;
  let bytes = projectSavePayloadBytes(compacted);

  if (bytes > SAVE_HARD_LIMIT_BYTES) {
    compacted = (await compactValue(compacted, "", null, {
      aggressive: true,
      dropEmbeddedMedia: false,
    })) as T;
    bytes = projectSavePayloadBytes(compacted);
  }

  if (bytes > SAVE_HARD_LIMIT_BYTES) {
    compacted = (await compactValue(compacted, "", null, {
      aggressive: true,
      dropEmbeddedMedia: true,
    })) as T;
    bytes = projectSavePayloadBytes(compacted);
  }

  return { project: compacted, bytes, compacted: true };
}
