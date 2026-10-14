"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNodeId, useStore, type ReactFlowState } from "@xyflow/react";
import { acquireCanvasMediaSlot } from "@/lib/canvas-media-slot";
import {
  createClientCanvasThumbnailUrl,
  FOLDDER_CANVAS_THUMB_MAX_SIDE,
  needsClientCanvasThumbnail,
  resolveCanvasThumbnailMediaUrl,
  resolveFullQualityMediaUrl,
} from "@/lib/canvas-media-thumbnail";
import { appendMediaStreamParam, fetchAuthedMedia } from "@/lib/fetch-authed-media";

export type AuthedMediaPreviewOptions = {
  /** Preview ligero en nodos del lienzo; studio/export/descarga usan `fullUrl`. */
  canvasThumbnail?: boolean;
  maxSide?: number;
};

/** 1×1 transparente. Evita que `src ?? original` dispare la imagen grande mientras espera turno. */
export const FOLDDER_MEDIA_PLACEHOLDER =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const VIEWPORT_MARGIN_PX = 280;

function isRemoteMediaUrl(url: string | undefined): boolean {
  if (!url) return false;
  return !url.startsWith("data:") && !url.startsWith("blob:");
}

function mediaNodeIntersectsViewport(state: ReactFlowState, nodeId: string | null): boolean {
  if (!nodeId) return true;
  const node = state.nodeLookup.get(nodeId);
  if (!node) return true;
  const bounds = node.internals?.bounds;
  const absolute = node.internals?.positionAbsolute;
  const x = bounds?.x ?? absolute?.x;
  const y = bounds?.y ?? absolute?.y;
  if (x == null || y == null) return true;
  const width = bounds?.width ?? node.measured?.width ?? node.width ?? 240;
  const height = bounds?.height ?? node.measured?.height ?? node.height ?? 160;
  const [tx, ty, zoom] = state.transform;
  const left = x * zoom + tx;
  const top = y * zoom + ty;
  const right = left + (width ?? 240) * zoom;
  const bottom = top + (height ?? 160) * zoom;
  return (
    right >= -VIEWPORT_MARGIN_PX &&
    bottom >= -VIEWPORT_MARGIN_PX &&
    left <= state.width + VIEWPORT_MARGIN_PX &&
    top <= state.height + VIEWPORT_MARGIN_PX
  );
}

/** Preview de medios autenticados (`/api/spaces/s3-file`) con fallback si el redirect firmado falla. */
export function useAuthedMediaPreviewUrl(
  src?: string | null,
  s3Key?: string | null,
  options?: AuthedMediaPreviewOptions,
) {
  const canvasThumbnail = Boolean(options?.canvasThumbnail);
  const maxSide = options?.maxSide ?? FOLDDER_CANVAS_THUMB_MAX_SIDE;
  const nodeId = useNodeId();
  const inView = useStore((state) => mediaNodeIntersectsViewport(state, nodeId));

  const fullUrl = useMemo(() => resolveFullQualityMediaUrl(src, s3Key), [s3Key, src]);
  const serverCanvasUrl = useMemo(
    () => (canvasThumbnail ? resolveCanvasThumbnailMediaUrl(src, s3Key, maxSide) : fullUrl),
    [canvasThumbnail, fullUrl, maxSide, s3Key, src],
  );
  const gateRemoteCanvas = canvasThumbnail && isRemoteMediaUrl(serverCanvasUrl);

  const [displayUrl, setDisplayUrl] = useState<string | undefined>(
    gateRemoteCanvas ? FOLDDER_MEDIA_PLACEHOLDER : serverCanvasUrl,
  );
  const blobUrlRef = useRef<string | null>(null);
  const clientThumbUrlRef = useRef<string | null>(null);
  const blobAttemptRef = useRef(false);

  useEffect(() => {
    blobAttemptRef.current = false;
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    if (clientThumbUrlRef.current) {
      URL.revokeObjectURL(clientThumbUrlRef.current);
      clientThumbUrlRef.current = null;
    }

    if (!serverCanvasUrl) {
      setDisplayUrl(undefined);
      return;
    }
    if (gateRemoteCanvas && !inView) {
      setDisplayUrl(FOLDDER_MEDIA_PLACEHOLDER);
      return;
    }

    let cancelled = false;
    let releaseSlot: (() => void) | null = null;

    void (async () => {
      let releaseOnce = () => {};
      if (gateRemoteCanvas) {
        const release = await acquireCanvasMediaSlot();
        let released = false;
        releaseOnce = () => {
          if (released) return;
          released = true;
          release();
        };
        releaseSlot = releaseOnce;
        if (cancelled) {
          releaseOnce();
          return;
        }
      }

      if (!canvasThumbnail && fullUrl && isRemoteMediaUrl(fullUrl) && fullUrl.includes("/api/spaces/s3-file")) {
        blobAttemptRef.current = true;
        try {
          const response = await fetchAuthedMedia(fullUrl);
          if (!response.ok) {
            if (!cancelled) setDisplayUrl(fullUrl);
            return;
          }
          const blob = await response.blob();
          if (!blob.size || !blob.type.startsWith("image/")) {
            if (!cancelled) setDisplayUrl(fullUrl);
            return;
          }
          const objectUrl = URL.createObjectURL(blob);
          if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
          blobUrlRef.current = objectUrl;
          if (!cancelled) setDisplayUrl(objectUrl);
          return;
        } catch {
          if (!cancelled) setDisplayUrl(fullUrl);
          return;
        }
      }

      if (!cancelled) setDisplayUrl(serverCanvasUrl);

      if (canvasThumbnail && fullUrl && needsClientCanvasThumbnail(fullUrl, maxSide)) {
        const thumbUrl = await createClientCanvasThumbnailUrl(fullUrl, maxSide);
        if (!cancelled && thumbUrl && thumbUrl !== fullUrl) {
          if (clientThumbUrlRef.current) URL.revokeObjectURL(clientThumbUrlRef.current);
          clientThumbUrlRef.current = thumbUrl.startsWith("blob:") ? thumbUrl : null;
          setDisplayUrl(thumbUrl);
        }
      }

      if (gateRemoteCanvas) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 700);
        });
      }
      releaseOnce();
    })();

    return () => {
      cancelled = true;
      releaseSlot?.();
    };
  }, [canvasThumbnail, fullUrl, gateRemoteCanvas, inView, maxSide, serverCanvasUrl]);

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
    const currentSource = serverCanvasUrl || fullUrl;
    if (canvasThumbnail && currentSource?.includes("/api/spaces/s3-file")) {
      setDisplayUrl(appendMediaStreamParam(currentSource));
      return;
    }
    if (!fullUrl || blobAttemptRef.current) return;
    if (fullUrl.startsWith("data:") || fullUrl.startsWith("blob:")) return;
    blobAttemptRef.current = true;
    try {
      const response = await fetchAuthedMedia(fullUrl);
      if (!response.ok) return;
      const blob = await response.blob();
      if (!blob.size) return;
      const objectUrl = URL.createObjectURL(blob);
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = objectUrl;
      setDisplayUrl(objectUrl);
    } catch {
      setDisplayUrl(appendMediaStreamParam(fullUrl));
    }
  }, [canvasThumbnail, fullUrl, serverCanvasUrl]);

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
