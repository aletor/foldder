"use client";

import { useEffect, useRef } from "react";
import type { Canvas as FabricCanvas } from "fabric";

/**
 * Cuadrícula en espacio de escena, alineada con el viewport de Fabric (como referencia visual).
 * Va encima del lienzo con poca opacidad; `pointer-events: none` deja pasar los clics al canvas.
 */
export function IndesignCanvasGrid({
  getCanvas,
  show,
  step,
  layoutKey,
}: {
  getCanvas: () => FabricCanvas | null;
  show: boolean;
  step: number;
  /** Cambia al redimensionar el pliego o cambiar de página para reenganchar el listener. */
  layoutKey: string;
}) {
  const layerRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = getCanvas();
    const layer = layerRef.current;
    if (!c || !layer) return;

    const draw = () => {
      const ctx = layer.getContext("2d");
      if (!ctx) return;
      const uc = c.upperCanvasEl;
      const w = uc.width;
      const h = uc.height;
      if (layer.width !== w || layer.height !== h) {
        layer.width = w;
        layer.height = h;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (!show) return;

      const v = c.viewportTransform;
      if (!v) return;
      ctx.setTransform(v[0], v[1], v[2], v[3], v[4], v[5]);
      const g = Math.max(4, step);
      const scale = Math.hypot(v[0], v[1]) || 1;
      ctx.strokeStyle = "rgba(148, 163, 184, 0.13)";
      ctx.lineWidth = 1 / scale;
      const cw = c.getWidth();
      const ch = c.getHeight();
      for (let x = 0; x <= cw; x += g) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, ch);
        ctx.stroke();
      }
      for (let y = 0; y <= ch; y += g) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(cw, y);
        ctx.stroke();
      }
    };

    c.on("after:render", draw);
    const ro = new ResizeObserver(() => draw());
    const wrap = c.upperCanvasEl.parentElement;
    if (wrap) ro.observe(wrap);
    draw();
    return () => {
      c.off("after:render", draw);
      ro.disconnect();
    };
  }, [getCanvas, show, step, layoutKey]);

  return (
    <canvas
      ref={layerRef}
      className="pointer-events-none absolute inset-0 z-[2] h-full w-full"
      aria-hidden
    />
  );
}
