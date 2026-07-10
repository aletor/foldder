"use client";

import { useCallback, useMemo } from "react";
import { resolveGenomaPreviewUrl } from "@/lib/genoma/genoma-media-url";

/** Rutas same-origin: el navegador envía cookies en `<img>` sin blob intermedio. */
function isSameOriginGenomaMediaUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return false;
  if (trimmed.startsWith("/api/spaces/")) return true;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true;
  return false;
}

/** Preview de medios Genoma — blob solo si hiciera falta para URLs externas sin proxy. */
export function useGenomaPreviewMediaUrl(src: string) {
  const resolvedSrc = useMemo(() => resolveGenomaPreviewUrl(src), [src]);
  const directLoad = useMemo(
    () => Boolean(resolvedSrc && isSameOriginGenomaMediaUrl(resolvedSrc)),
    [resolvedSrc],
  );

  const displayUrl = resolvedSrc;

  const retryWithBlob = useCallback(async () => {
    // Legacy hook surface — reintento vía cache-bust en GenomaPreviewImage.
  }, []);

  return {
    displayUrl,
    resolvedSrc,
    isLoading: false,
    needsAuthBlob: !directLoad && Boolean(resolvedSrc),
    retryWithBlob,
  };
}
