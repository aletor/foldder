"use client";

import { useEffect, useState } from "react";
import { lateralEdgeHexFromRgba } from "@/lib/brandkit/logo-lateral-edge-color";

export function useLogoLateralEdgeBackground(previewUrl: string | undefined): string | null {
  const [hex, setHex] = useState<string | null>(null);

  useEffect(() => {
    const url = previewUrl?.trim();
    if (!url) {
      setHex(null);
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement("canvas");
        const width = img.naturalWidth;
        const height = img.naturalHeight;
        if (!width || !height) {
          setHex(null);
          return;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          setHex(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const sampled = lateralEdgeHexFromRgba(ctx.getImageData(0, 0, width, height).data, width, height);
        if (!cancelled) setHex(sampled);
      } catch {
        if (!cancelled) setHex(null);
      }
    };

    img.onerror = () => {
      if (!cancelled) setHex(null);
    };

    img.src = url;

    return () => {
      cancelled = true;
    };
  }, [previewUrl]);

  return hex;
}
