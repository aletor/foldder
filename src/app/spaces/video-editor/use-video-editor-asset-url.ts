"use client";

import { useEffect, useState } from "react";
import { tryExtractKnowledgeFilesKeyFromUrl, stableKnowledgeFileUrlFromKey } from "@/lib/s3-media-hydrate";

const VIDEO_EDITOR_URL_TTL_MS = 50 * 60 * 1000;
const videoEditorPresignedUrlCache = new globalThis.Map<string, { url: string; expiresAt: number }>();
const videoEditorPresignInFlight = new globalThis.Map<string, Promise<string | null>>();

function resolveS3Key(src?: string, s3Key?: string): string | undefined {
  if (s3Key?.trim()) return s3Key.trim();
  const trimmed = src?.trim();
  if (trimmed?.startsWith("knowledge-files/")) return trimmed;
  return trimmed ? tryExtractKnowledgeFilesKeyFromUrl(trimmed) || undefined : undefined;
}

async function presignVideoEditorS3Key(key: string): Promise<string | null> {
  const cached = videoEditorPresignedUrlCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  const pending = videoEditorPresignInFlight.get(key);
  if (pending) return pending;
  const promise = (async () => {
    try {
      const res = await fetch("/api/spaces/s3-presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys: [key] }),
      });
      if (!res.ok) return null;
      const payload = (await res.json()) as { urls?: Record<string, string> };
      const url = payload.urls?.[key];
      if (!url) return null;
      videoEditorPresignedUrlCache.set(key, { url, expiresAt: Date.now() + VIDEO_EDITOR_URL_TTL_MS });
      return url;
    } catch {
      return null;
    } finally {
      videoEditorPresignInFlight.delete(key);
    }
  })();
  videoEditorPresignInFlight.set(key, promise);
  return promise;
}

export function useVideoEditorAssetUrl(src?: string, s3Key?: string, enabled = true): string | undefined {
  const [resolved, setResolved] = useState<{ cacheKey: string; url: string } | null>(null);
  const key = resolveS3Key(src, s3Key);
  const cacheKey = `${src || ""}\u0001${key || ""}`;
  useEffect(() => {
    let cancelled = false;
    if (!enabled) return () => {
      cancelled = true;
    };
    if (!key) return () => {
      cancelled = true;
    };
    void (async () => {
      const fresh = await presignVideoEditorS3Key(key);
      if (!cancelled && fresh) setResolved({ cacheKey, url: fresh });
    })();
    return () => {
      cancelled = true;
    };
  }, [cacheKey, enabled, key]);
  if (!enabled) return undefined;
  if (!key) return src;
  if (resolved?.cacheKey === cacheKey) return resolved.url;
  const stable = stableKnowledgeFileUrlFromKey(key);
  if (stable) return stable;
  if (src && /^https?:\/\//i.test(src)) return src;
  return undefined;
}
