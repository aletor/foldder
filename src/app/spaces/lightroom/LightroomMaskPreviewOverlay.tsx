"use client";

import React, { useEffect, useRef } from "react";
import { buildMaskLayerAlpha } from "./lightroom-mask-alpha";
import type { MaskAdjustmentLayer } from "./lightroom-mask-types";

export type LightroomMaskPreviewOverlayProps = {
  layer: MaskAdjustmentLayer | null;
  width: number;
  height: number;
  sourcePixels?: Uint8ClampedArray;
};

export function LightroomMaskPreviewOverlay({ layer, width, height, sourcePixels }: LightroomMaskPreviewOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layer || width <= 0 || height <= 0) return;
    void (async () => {
      const alpha = await buildMaskLayerAlpha(layer, width, height, sourcePixels);
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const img = ctx.createImageData(width, height);
      for (let i = 0; i < width * height; i += 1) {
        const a = alpha[i] ?? 0;
        const si = i * 4;
        img.data[si] = 46;
        img.data[si + 1] = 125;
        img.data[si + 2] = 154;
        img.data[si + 3] = Math.round(a * 0.55);
      }
      ctx.putImageData(img, 0, 0);
    })();
  }, [layer, width, height, sourcePixels]);

  if (!layer) return null;

  return <canvas ref={canvasRef} className="lr-mask-preview nodrag" aria-hidden />;
}
