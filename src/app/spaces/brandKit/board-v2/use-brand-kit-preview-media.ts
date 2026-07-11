"use client";

import { useMemo } from "react";
import { resolveBrandKitPreviewUrl } from "@/lib/brandkit/brand-kit-media-url";

/** Rutas same-origin: el navegador envía cookies en `<img>` sin blob intermedio. */
function isSameOriginBrandKitMediaUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return false;
  if (trimmed.startsWith("/api/spaces/")) return true;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true;
  return false;
}

/** Preview de medios BrandKit — carga directa en same-origin; reintento vía cache-bust en BrandKitPreviewImage. */
export function useBrandKitPreviewMediaUrl(src: string) {
  const resolvedSrc = useMemo(() => resolveBrandKitPreviewUrl(src), [src]);
  const directLoad = useMemo(
    () => Boolean(resolvedSrc && isSameOriginBrandKitMediaUrl(resolvedSrc)),
    [resolvedSrc],
  );

  return {
    displayUrl: resolvedSrc,
    resolvedSrc,
    isLoading: false,
    needsAuthBlob: !directLoad && Boolean(resolvedSrc),
  };
}
