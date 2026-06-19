"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { stableKnowledgeFileUrlFromKey, tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";

function resolveStableMediaUrl(src?: string | null, s3Key?: string | null): string | undefined {
  const key = (s3Key?.trim() || tryExtractKnowledgeFilesKeyFromUrl(src || "") || "").trim();
  if (key) return stableKnowledgeFileUrlFromKey(key) ?? undefined;
  const trimmed = src?.trim();
  return trimmed || undefined;
}

/** Preview de medios autenticados (`/api/spaces/s3-file`) con fallback blob si el decode falla. */
export function useAuthedMediaPreviewUrl(src?: string | null, s3Key?: string | null) {
  const stableUrl = useMemo(() => resolveStableMediaUrl(src, s3Key), [s3Key, src]);
  const [displayUrl, setDisplayUrl] = useState<string | undefined>(stableUrl);
  const blobUrlRef = useRef<string | null>(null);
  const blobAttemptRef = useRef(false);

  useEffect(() => {
    blobAttemptRef.current = false;
    setDisplayUrl(stableUrl);
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    if (!stableUrl || stableUrl.startsWith("data:") || stableUrl.startsWith("blob:")) return;
    if (!stableUrl.includes("/api/spaces/s3-file")) return;
    void (async () => {
      blobAttemptRef.current = true;
      try {
        const response = await fetch(stableUrl, { credentials: "include" });
        if (!response.ok) return;
        const blob = await response.blob();
        if (!blob.size || !blob.type.startsWith("image/")) return;
        const objectUrl = URL.createObjectURL(blob);
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = objectUrl;
        setDisplayUrl(objectUrl);
      } catch {
        // Keep stable URL if blob fallback fails.
      }
    })();
  }, [stableUrl]);

  useEffect(
    () => () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    },
    [],
  );

  const retryWithBlob = useCallback(async () => {
    if (!stableUrl || blobAttemptRef.current) return;
    if (stableUrl.startsWith("data:") || stableUrl.startsWith("blob:")) return;
    blobAttemptRef.current = true;
    try {
      const response = await fetch(stableUrl, { credentials: "include" });
      if (!response.ok) return;
      const blob = await response.blob();
      if (!blob.size) return;
      const objectUrl = URL.createObjectURL(blob);
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = objectUrl;
      setDisplayUrl(objectUrl);
    } catch {
      // Keep streaming URL if blob fallback fails.
    }
  }, [stableUrl]);

  return { displayUrl: displayUrl ?? stableUrl, stableUrl, retryWithBlob };
}
