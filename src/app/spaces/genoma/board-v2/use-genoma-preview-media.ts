"use client";

import { useMemo } from "react";
import { resolveGenomaPreviewUrl } from "@/lib/genoma/genoma-media-url";

/** Rutas same-origin: el navegador envía cookies en `<img>` sin blob intermedio. */
function isSameOriginGenomaMediaUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return false;
  if (trimmed.startsWith("/api/spaces/")) return true;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true;
  return false;
}

/** Preview de medios Genoma — carga directa en same-origin; reintento vía cache-bust en GenomaPreviewImage. */
export function useGenomaPreviewMediaUrl(src: string) {
  const resolvedSrc = useMemo(() => resolveGenomaPreviewUrl(src), [src]);
  const directLoad = useMemo(
    () => Boolean(resolvedSrc && isSameOriginGenomaMediaUrl(resolvedSrc)),
    [resolvedSrc],
  );

  return {
    displayUrl: resolvedSrc,
    resolvedSrc,
    isLoading: false,
    needsAuthBlob: !directLoad && Boolean(resolvedSrc),
  };
}
