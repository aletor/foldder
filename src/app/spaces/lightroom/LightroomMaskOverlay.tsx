"use client";

import React, { useCallback, useRef, useState } from "react";
import { Eraser, Paintbrush } from "lucide-react";
import type {
  BrushMask,
  LinearGradientMask,
  MaskAdjustmentLayer,
  MaskPrimitive,
  MaskTool,
  NormalizedPoint,
  RadialGradientMask,
} from "./lightroom-mask-types";
import { paintBrushStroke, sampleColorAt } from "./lightroom-mask-alpha";
import { pointerToImageNorm } from "./lightroom-wb-eyedropper";

export type LightroomMaskOverlayProps = {
  width: number;
  height: number;
  activeLayer: MaskAdjustmentLayer | null;
  activeTool: MaskTool;
  activeMaskIndex: number;
  brushErase?: boolean;
  sourcePixels?: Uint8ClampedArray | null;
  canvas?: HTMLCanvasElement | null;
  compareBefore?: boolean;
  colorEyedropperActive?: boolean;
  wbEyedropperActive?: boolean;
  onUpdateLayer: (layerId: string, patch: Partial<MaskAdjustmentLayer>) => void;
  onGlobalWbSample?: (temp: number, tint: number) => void;
  onWbPick?: (norm: NormalizedPoint) => void;
  onRefresh: () => void;
};

export function LightroomMaskOverlay({
  width,
  height,
  activeLayer,
  activeTool,
  activeMaskIndex,
  brushErase = false,
  sourcePixels,
  canvas,
  compareBefore = false,
  colorEyedropperActive,
  wbEyedropperActive,
  onUpdateLayer,
  onGlobalWbSample,
  onWbPick,
  onRefresh,
}: LightroomMaskOverlayProps) {
  const dragRef = useRef<{ kind: string; start: NormalizedPoint; maskIndex: number } | null>(null);
  const brushCanvasRef = useRef<HTMLCanvasElement>(null);
  const strokeFromRef = useRef<{ x: number; y: number } | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [brushSize, setBrushSize] = useState(24);

  const normFromEvent = useCallback(
    (e: React.PointerEvent): NormalizedPoint | null => {
      if (canvas) {
        const norm = pointerToImageNorm(e.clientX, e.clientY, canvas);
        if (norm) return norm;
      }
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      return {
        x: clamp01((e.clientX - rect.left) / Math.max(rect.width, 1)),
        y: clamp01((e.clientY - rect.top) / Math.max(rect.height, 1)),
      };
    },
    [canvas],
  );

  const pxFromEvent = useCallback(
    (e: React.PointerEvent): { x: number; y: number } => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) / Math.max(rect.width, 1)) * width,
        y: ((e.clientY - rect.top) / Math.max(rect.height, 1)) * height,
      };
    },
    [width, height],
  );

  const updateMask = useCallback(
    (maskIndex: number, patch: Partial<MaskPrimitive>) => {
      if (!activeLayer) return;
      const masks = activeLayer.masks.map((m, i) => (i === maskIndex ? { ...m, ...patch } : m)) as MaskPrimitive[];
      onUpdateLayer(activeLayer.id, { masks });
      onRefresh();
    },
    [activeLayer, onUpdateLayer, onRefresh],
  );

  const sampleAtNorm = (norm: NormalizedPoint) => {
    if (!sourcePixels || width <= 0 || height <= 0) return null;
    const px = Math.floor(norm.x * (width - 1));
    const py = Math.floor(norm.y * (height - 1));
    return sampleColorAt(sourcePixels, width, px, py);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const norm = normFromEvent(e);
    if (!norm) return;
    setCursor({ x: e.clientX, y: e.clientY });

    if (wbEyedropperActive && (onWbPick || onGlobalWbSample)) {
      if (compareBefore) return;
      if (onWbPick) {
        onWbPick(norm);
      }
      return;
    }

    if (!activeLayer || activeTool === "none") return;

    if (colorEyedropperActive && activeTool === "colorRange") {
      const color = sampleAtNorm(norm);
      const mask = activeLayer.masks[activeMaskIndex];
      if (color && mask?.type === "colorRange") {
        updateMask(activeMaskIndex, { color });
      }
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);

    if (activeTool === "brush") {
      const mask = activeLayer.masks[activeMaskIndex];
      if (!mask || mask.type !== "brush") return;
      setBrushSize(mask.size);
      ensureBrushCanvas(mask, brushCanvasRef, width, height);
      strokeFromRef.current = pxFromEvent(e);
      return;
    }

    if (activeTool === "linear" || activeTool === "radial") {
      dragRef.current = { kind: activeTool, start: norm, maskIndex: activeMaskIndex };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    setCursor({ x: e.clientX, y: e.clientY });
    if (!activeLayer) return;

    if (activeTool === "brush" && strokeFromRef.current) {
      const mask = activeLayer.masks[activeMaskIndex];
      if (!mask || mask.type !== "brush") return;
      const canvas = brushCanvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!ctx) return;
      const to = pxFromEvent(e);
      paintBrushStroke(ctx, mask, strokeFromRef.current, to, brushErase);
      strokeFromRef.current = to;
      onRefresh();
      return;
    }

    const drag = dragRef.current;
    if (!drag) return;
    const end = normFromEvent(e);
    if (!end) return;
    if (drag.kind === "linear") {
      updateMask(drag.maskIndex, { a: drag.start, b: end } as Partial<LinearGradientMask>);
    } else if (drag.kind === "radial") {
      const dx = end.x - drag.start.x;
      const dy = end.y - drag.start.y;
      const radius = Math.min(0.5, Math.hypot(dx, dy));
      updateMask(drag.maskIndex, { center: drag.start, radius } as Partial<RadialGradientMask>);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (activeTool === "brush" && activeLayer) {
      const mask = activeLayer.masks[activeMaskIndex];
      const canvas = brushCanvasRef.current;
      if (mask?.type === "brush" && canvas) {
        updateMask(activeMaskIndex, { alphaDataUrl: canvas.toDataURL("image/png") } as Partial<BrushMask>);
      }
      strokeFromRef.current = null;
    }
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const showOverlay =
    activeLayer &&
    activeTool !== "none" &&
    width > 0 &&
    height > 0 &&
    !wbEyedropperActive &&
    !colorEyedropperActive;

  const mask = activeLayer?.masks[activeMaskIndex];
  const eyedropperMode = wbEyedropperActive || colorEyedropperActive;

  return (
    <div
      className={`lightroom-mask-overlay nodrag${eyedropperMode ? " lightroom-mask-overlay--dropper" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => setCursor(null)}
    >
      {showOverlay && activeTool === "linear" && mask?.type === "linear" ? (
        <LinearMaskGuide mask={mask} />
      ) : null}
      {showOverlay && activeTool === "radial" && mask?.type === "radial" ? (
        <RadialMaskGuide mask={mask} width={width} height={height} />
      ) : null}
      {showOverlay && activeTool === "brush" ? (
        <>
          <div className="lightroom-mask-overlay__brush-hint">
            {brushErase ? <Eraser size={14} /> : <Paintbrush size={14} />}
            <span>{brushErase ? "Borrador" : "Pincel"}</span>
          </div>
          {cursor ? (
            <div
              className="lightroom-mask-overlay__brush-cursor"
              style={{
                left: cursor.x,
                top: cursor.y,
                width: brushSize,
                height: brushSize,
                marginLeft: -brushSize / 2,
                marginTop: -brushSize / 2,
              }}
            />
          ) : null}
        </>
      ) : null}
      {eyedropperMode ? (
        <div className="lightroom-mask-overlay__dropper-hint">
          {wbEyedropperActive
            ? compareBefore
              ? "Desactiva la comparación para usar el cuentagotas WB"
              : "Clic en gris neutro para balance de blancos"
            : "Clic para muestrear color"}
        </div>
      ) : null}
    </div>
  );
}

function LinearMaskGuide({ mask }: { mask: LinearGradientMask }) {
  const mx = (mask.a.x + mask.b.x) / 2;
  const my = (mask.a.y + mask.b.y) / 2;
  const dx = mask.b.x - mask.a.x;
  const dy = mask.b.y - mask.a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const spread = mask.feather * 0.15;
  const o1x = mx + nx * spread;
  const o1y = my + ny * spread;
  const o2x = mx - nx * spread;
  const o2y = my - ny * spread;

  return (
    <svg className="lightroom-mask-overlay__svg" viewBox="0 0 1 1" preserveAspectRatio="none">
      <line x1={mask.a.x} y1={mask.a.y} x2={mask.b.x} y2={mask.b.y} className="lightroom-mask-overlay__line" />
      <line x1={o1x - dx * 0.5} y1={o1y - dy * 0.5} x2={o1x + dx * 0.5} y2={o1y + dy * 0.5} className="lightroom-mask-overlay__feather" />
      <line x1={o2x - dx * 0.5} y1={o2y - dy * 0.5} x2={o2x + dx * 0.5} y2={o2y + dy * 0.5} className="lightroom-mask-overlay__feather" />
      <circle cx={mask.a.x} cy={mask.a.y} r={0.012} className="lightroom-mask-overlay__handle" />
      <circle cx={mask.b.x} cy={mask.b.y} r={0.012} className="lightroom-mask-overlay__handle" />
      <circle cx={mx} cy={my} r={0.008} className="lightroom-mask-overlay__handle lightroom-mask-overlay__handle--center" />
    </svg>
  );
}

function RadialMaskGuide({ mask, width, height }: { mask: RadialGradientMask; width: number; height: number }) {
  const rx = mask.radius * (height / Math.max(width, height));
  const ry = mask.radius;
  const handleX = mask.center.x + rx;
  const handleY = mask.center.y;

  return (
    <svg className="lightroom-mask-overlay__svg" viewBox="0 0 1 1" preserveAspectRatio="none">
      <ellipse cx={mask.center.x} cy={mask.center.y} rx={rx} ry={ry} className="lightroom-mask-overlay__ellipse" />
      <ellipse
        cx={mask.center.x}
        cy={mask.center.y}
        rx={rx * (1 + mask.feather * 0.5)}
        ry={ry * (1 + mask.feather * 0.5)}
        className="lightroom-mask-overlay__feather-ellipse"
      />
      <circle cx={mask.center.x} cy={mask.center.y} r={0.012} className="lightroom-mask-overlay__handle" />
      <circle cx={handleX} cy={handleY} r={0.01} className="lightroom-mask-overlay__handle lightroom-mask-overlay__handle--radius" />
    </svg>
  );
}

function ensureBrushCanvas(
  mask: BrushMask,
  ref: React.MutableRefObject<HTMLCanvasElement | null>,
  width: number,
  height: number,
) {
  if (!ref.current) ref.current = document.createElement("canvas");
  const canvas = ref.current;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx && mask.alphaDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
      };
      img.src = mask.alphaDataUrl;
    }
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
