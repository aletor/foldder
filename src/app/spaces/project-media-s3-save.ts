"use client";

import { optimizeImageBlobForFoldder } from "./media/foldder-image-optimization";

type UploadedProjectMedia = {
  contentType: string;
  s3Key: string;
  url: string;
};

export type ProjectMediaUploadCache = Map<string, UploadedProjectMedia>;

type MaterializeProjectMediaResult<TSpaces> = {
  failed: number;
  projectMediaBytes: number;
  reused: number;
  spaces: TSpaces;
  uploaded: number;
};

const DATA_MEDIA_RE = /^data:(image\/[^;,]+|video\/[^;,]+|audio\/[^;,]+)(?:;[^,]*)?;base64,(.*)$/i;
const MIN_S3_MEDIA_DATA_URL_LENGTH = 32_000;

type MediaUploadPolicy = {
  preserveImageQuality?: boolean;
};

function hashString(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function dataUrlSignature(value: string): string {
  return `${value.length}:${hashString(value.slice(0, 16_384))}:${hashString(value.slice(-16_384))}`;
}

function parseDataMedia(value: string): { base64: string; contentType: string } | null {
  const match = DATA_MEDIA_RE.exec(value);
  if (!match) return null;
  return { contentType: match[1].toLowerCase(), base64: match[2] };
}

function extensionForContentType(contentType: string): string {
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  if (contentType.includes("mp4")) return "mp4";
  if (contentType.includes("webm")) return "webm";
  if (contentType.includes("mpeg")) return "mp3";
  if (contentType.includes("wav")) return "wav";
  return "bin";
}

function dataUrlToBlob(value: string): { blob: Blob; contentType: string } | null {
  const parsed = parseDataMedia(value);
  if (!parsed) return null;
  const binary = atob(parsed.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return {
    blob: new Blob([bytes], { type: parsed.contentType }),
    contentType: parsed.contentType,
  };
}

async function dataUrlToUploadFile(
  value: string,
  mediaId: string,
  policy: MediaUploadPolicy,
): Promise<File | null> {
  const parsed = dataUrlToBlob(value);
  if (!parsed) return null;
  if (
    parsed.contentType.startsWith("image/") &&
    !parsed.contentType.includes("svg") &&
    !policy.preserveImageQuality
  ) {
    const optimized = await optimizeImageBlobForFoldder(parsed.blob, parsed.contentType);
    const type = optimized.blob.type || (optimized.ext === "jpg" ? "image/jpeg" : `image/${optimized.ext}`);
    return new File([optimized.blob], `${mediaId}.${optimized.ext}`, { type });
  }
  const ext = extensionForContentType(parsed.contentType);
  return new File([parsed.blob], `${mediaId}.${ext}`, { type: parsed.contentType });
}

function newMediaId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `media_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function shouldMaterializeString(value: string): boolean {
  return value.length >= MIN_S3_MEDIA_DATA_URL_LENGTH && DATA_MEDIA_RE.test(value);
}

async function uploadDataMedia(
  value: string,
  projectId: string | null,
  cache: ProjectMediaUploadCache,
  policy: MediaUploadPolicy,
): Promise<{ media: UploadedProjectMedia; reused: boolean; bytes: number }> {
  const signature = `${policy.preserveImageQuality ? "preserve" : "opt"}:${dataUrlSignature(value)}`;
  const cached = cache.get(signature);
  if (cached) {
    return { media: cached, reused: true, bytes: 0 };
  }

  const parsed = parseDataMedia(value);
  const mediaId = newMediaId();
  const file = await dataUrlToUploadFile(value, mediaId, policy);
  if (!parsed || !file) {
    throw new Error("Invalid embedded project media.");
  }

  const form = new FormData();
  form.set("file", file);
  form.set("mediaId", mediaId);
  form.set("projectId", projectId || "unsaved");
  if (policy.preserveImageQuality) {
    form.set("preserveQuality", "1");
  }

  const res = await fetch("/api/spaces/project-media-upload", {
    method: "POST",
    body: form,
  });
  const json = (await res.json().catch(() => null)) as
    | { error?: string; s3Key?: string; url?: string }
    | null;
  if (!res.ok || !json?.s3Key || !json.url) {
    throw new Error(json?.error || `Project media upload failed (${res.status}).`);
  }

  const media = { contentType: parsed.contentType, s3Key: json.s3Key, url: json.url };
  cache.set(signature, media);
  return { media, reused: false, bytes: file.size };
}

function sidecarKeyForMediaField(key: string): string | null {
  if (key === "value" || key === "src" || key === "url" || key === "dataUrl") return "s3Key";
  if (key === "imageUrl") return "imageS3Key";
  if (key.endsWith("DataUrl")) return `${key.slice(0, -7)}S3Key`;
  if (key.endsWith("Url")) return `${key.slice(0, -3)}S3Key`;
  return null;
}

function boolProp(source: Record<string, unknown>, key: string): boolean {
  return source[key] === true;
}

function recordProp(source: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = source[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function shouldPreserveImageQualityForMediaField(
  source: Record<string, unknown> | null,
  key: string,
): boolean {
  if (!source) return false;
  const imageMeta = recordProp(source, "imageAssetMeta");
  if (imageMeta && boolProp(imageMeta, "generatedByAi")) return true;
  if (boolProp(source, "generatedByAi")) return true;
  if (typeof source.generatedByAiSource === "string" && source.generatedByAiSource.trim()) return true;
  if (key === "value" && Array.isArray(source.generationHistory)) return true;
  return false;
}

export async function materializeProjectSpacesMediaForSave<TSpaces>(
  spaces: TSpaces,
  options: {
    cache: ProjectMediaUploadCache;
    projectId: string | null;
  },
): Promise<MaterializeProjectMediaResult<TSpaces>> {
  let failed = 0;
  let projectMediaBytes = 0;
  let reused = 0;
  let uploaded = 0;

  const visit = async (
    value: unknown,
    key: string,
    source: Record<string, unknown> | null,
  ): Promise<{ changed: boolean; s3Key?: string; value: unknown }> => {
    if (typeof value === "string") {
      if (!shouldMaterializeString(value)) return { changed: false, value };
      const result = await uploadDataMedia(value, options.projectId, options.cache, {
        preserveImageQuality: shouldPreserveImageQualityForMediaField(source, key),
      });
      if (result.reused) reused += 1;
      else uploaded += 1;
      projectMediaBytes += result.bytes;
      return { changed: true, s3Key: result.media.s3Key, value: result.media.url };
    }

    if (Array.isArray(value)) {
      let any = false;
      const next: unknown[] = [];
      for (const item of value) {
        const child = await visit(item, key, null);
        if (child.changed) any = true;
        next.push(child.value);
      }
      return { changed: any, value: any ? next : value };
    }

    if (value && typeof value === "object") {
      let any = false;
      const source = value as Record<string, unknown>;
      const next: Record<string, unknown> = { ...source };
      for (const [childKey, childValue] of Object.entries(source)) {
        try {
          const child = await visit(childValue, childKey, source);
          if (!child.changed) continue;
          any = true;
          next[childKey] = child.value;
          const sidecar = child.s3Key ? sidecarKeyForMediaField(childKey) : null;
          if (sidecar && typeof next[sidecar] !== "string") {
            next[sidecar] = child.s3Key;
          }
        } catch (error) {
          failed += 1;
          throw error;
        }
      }
      return { changed: any, value: any ? next : value };
    }

    return { changed: false, value };
  };

  const result = await visit(spaces, "spaces", null);
  return {
    failed,
    projectMediaBytes,
    reused,
    spaces: result.value as TSpaces,
    uploaded,
  };
}
