"use client";

import React, { useEffect, useRef } from "react";

export type DetailLoupeProps = {
  /** Data URL de la vista revelada actual */
  previewDataUrl: string | null;
  /** Posición normalizada del cursor sobre la imagen (0…1) */
  focus?: { x: number; y: number } | null;
  size?: number;
  zoom?: number;
};

export function DetailLoupe({ previewDataUrl, focus, size = 96, zoom = 3 }: DetailLoupeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !previewDataUrl || !focus) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      const sw = img.naturalWidth / zoom;
      const sh = img.naturalHeight / zoom;
      const sx = Math.max(0, Math.min(img.naturalWidth - sw, focus.x * img.naturalWidth - sw / 2));
      const sy = Math.max(0, Math.min(img.naturalHeight - sh, focus.y * img.naturalHeight - sh / 2));
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
    };
    img.src = previewDataUrl;
  }, [previewDataUrl, focus, size, zoom]);

  return (
    <div className="lr-loupe nodrag">
      <p className="lightroom-studio__eyebrow">Lupa 1:1</p>
      <canvas ref={canvasRef} width={size} height={size} className="lr-loupe__canvas" aria-label="Lupa de detalle" />
      {!focus ? <p className="lr-loupe__hint">Pasa el cursor sobre la imagen</p> : null}
    </div>
  );
}
