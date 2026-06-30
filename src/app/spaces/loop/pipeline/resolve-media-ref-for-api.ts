"use client";

/**
 * Normaliza refs de imagen/vídeo del grafo o Dataset a un valor que el servidor
 * puede inlinear (clave S3, data URL o https estable). Evita blob:, thumbs del lienzo
 * y presigned URLs rotas cuando hay s3Key disponible.
 */

import { resolveFullQualityMediaUrl } from "@/lib/canvas-media-thumbnail";
import { resolveKnowledgeFilesS3Key } from "@/lib/s3-media-hydrate";
import { ensureServerReadableMediaUrl } from "@/app/spaces/resolve-connected-media-url";
import type { ResolvedMediaRef } from "./node-executor";

export async function resolveMediaRefForApi(ref: ResolvedMediaRef): Promise<string | null> {
  const fullUrl = resolveFullQualityMediaUrl(ref.url, ref.s3Key)?.trim() || ref.url?.trim();
  if (!fullUrl) return null;

  const s3Key = resolveKnowledgeFilesS3Key(ref.s3Key, fullUrl);
  if (s3Key) return s3Key;

  if (fullUrl.startsWith("blob:")) {
    try {
      return await ensureServerReadableMediaUrl(fullUrl);
    } catch {
      return null;
    }
  }

  return fullUrl;
}

export async function resolveMediaRefsForApi(refs: ResolvedMediaRef[]): Promise<string[]> {
  const out: string[] = [];
  for (const ref of refs) {
    const resolved = await resolveMediaRefForApi(ref);
    if (resolved) out.push(resolved);
  }
  return out;
}
