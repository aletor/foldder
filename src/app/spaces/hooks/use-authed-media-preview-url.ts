"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createClientCanvasThumbnailUrl,
  FOLDDER_CANVAS_THUMB_MAX_SIDE,
  needsClientCanvasThumbnail,
  resolveCanvasThumbnailMediaUrl,
  resolveFullQualityMediaUrl,
} from "@/lib/canvas-media-thumbnail";

export type AuthedMediaPreviewOptions = {
  /** Preview ligero en nodos del lienzo; studio/export/descarga usan `fullUrl`. */
  canvasThumbnail?: boolean;
  maxSide?: number;
};

/** Preview de medios autenticados (`/api/spaces/s3-file`) con fallback blob si el decode falla. */
export function useAuthedMediaPreviewUrl(
  src?: string | null,
  s3Key?: string | null,
  options?: AuthedMediaPreviewOptions,
) {
  const canvasThumbnail = Boolean(options?.canvasThumbnail);
  const maxSide = options?.maxSide ?? FOLDDER_CANVAS_THUMB_MAX_SIDE;

  const fullUrl = useMemo(() => resolveFullQualityMediaUrl(src, s3Key), [s3Key, src]);
  const serverCanvasUrl = useMemo(
    () => (canvasThumbnail ? resolveCanvasThumbnailMediaUrl(src, s3Key, maxSide) : fullUrl),
    [canvasThumbnail, fullUrl, maxSide, s3Key, src],
  );

  const [displayUrl, setDisplayUrl] = useState<string | undefined>(serverCanvasUrl);
  const blobUrlRef = useRef<string | null>(null);
  const clientThumbUrlRef = useRef<string | null>(null);
  const blobAttemptRef = useRef(false);

  useEffect(() => {
    blobAttemptRef.current = false;
    setDisplayUrl(serverCanvasUrl);

    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    if (clientThumbUrlRef.current) {
      URL.revokeObjectURL(clientThumbUrlRef.current);
      clientThumbUrlRef.current = null;
    }

    if (!fullUrl) return;

    if (canvasThumbnail) {
      const clientSrc = fullUrl;
      if (needsClientCanvasThumbnail(clientSrc, maxSide)) {
        let cancelled = false;
        void (async () => {
          const thumbUrl = await createClientCanvasThumbnailUrl(clientSrc, maxSide);
          if (cancelled || !thumbUrl || thumbUrl === clientSrc) return;
          if (clientThumbUrlRef.current) URL.revokeObjectURL(clientThumbUrlRef.current);
          clientThumbUrlRef.current = thumbUrl.startsWith("blob:") ? thumbUrl : null;
          setDisplayUrl(thumbUrl);
        })();
        return () => {
          cancelled = true;
        };
      }
      return;
    }

    if (fullUrl.startsWith("data:") || fullUrl.startsWith("blob:")) return;
    if (!fullUrl.includes("/api/spaces/s3-file")) return;
    void (async () => {
      blobAttemptRef.current = true;
      try {
        const response = await fetch(fullUrl, { credentials: "include" });
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
  }, [canvasThumbnail, fullUrl, maxSide, serverCanvasUrl]);

  useEffect(
    () => () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      if (clientThumbUrlRef.current) {
        URL.revokeObjectURL(clientThumbUrlRef.current);
        clientThumbUrlRef.current = null;
      }
    },
    [],
  );

  const retryWithBlob = useCallback(async () => {
    if (!fullUrl || blobAttemptRef.current || canvasThumbnail) return;
    if (fullUrl.startsWith("data:") || fullUrl.startsWith("blob:")) return;
    blobAttemptRef.current = true;
    try {
      const response = await fetch(fullUrl, { credentials: "include" });
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
  }, [canvasThumbnail, fullUrl]);

  return {
    displayUrl: displayUrl ?? serverCanvasUrl ?? fullUrl,
    fullUrl,
    stableUrl: fullUrl,
    retryWithBlob,
  };
}

/** Atajo: preview de lienzo + URL full para studio/export. */
export function useCanvasNodeMediaPreviewUrl(src?: string | null, s3Key?: string | null) {
  return useAuthedMediaPreviewUrl(src, s3Key, { canvasThumbnail: true });
}
