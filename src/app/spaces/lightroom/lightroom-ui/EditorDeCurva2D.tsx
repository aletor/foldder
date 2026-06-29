"use client";

import React, { useCallback, useMemo, useRef } from "react";
import type { CurvePoint, DevelopSettings } from "../lightroom-develop-settings";
import { DEFAULT_CURVE_POINTS } from "../lightroom-develop-settings";
import { evaluateToneCurveAt } from "../lightroom-adjustments-cpu";
import { histogramToPolyline } from "./lightroom-histogram";

export type CurveChannel = "master" | "r" | "g" | "b";

export type EditorDeCurva2DProps = {
  channel: CurveChannel;
  onChannelChange: (ch: CurveChannel) => void;
  points: CurvePoint[];
  onPointsChange: (points: CurvePoint[]) => void;
  toneCurve: DevelopSettings["toneCurve"];
  histogram?: { r: Uint32Array; g: Uint32Array; b: Uint32Array; luma: Uint32Array };
  disabled?: boolean;
};

const CHANNELS: Array<{ id: CurveChannel; label: string; color: string }> = [
  { id: "master", label: "RGB", color: "#e2e8f0" },
  { id: "r", label: "R", color: "#f87171" },
  { id: "g", label: "V", color: "#4ade80" },
  { id: "b", label: "A", color: "#60a5fa" },
];

const SIZE = 180;

export function EditorDeCurva2D({
  channel,
  onChannelChange,
  points,
  onPointsChange,
  toneCurve,
  histogram,
  disabled,
}: EditorDeCurva2DProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragIdx = useRef<number | null>(null);

  const sorted = useMemo(() => [...points].sort((a, b) => a.x - b.x), [points]);

  const curvePath = useMemo(() => {
    const parts: string[] = [];
    for (let i = 0; i <= 64; i += 1) {
      const x = i / 64;
      const y = evaluateToneCurveAt(x, toneCurve, channel);
      const px = x * SIZE;
      const py = (1 - y) * SIZE;
      parts.push(`${i === 0 ? "M" : "L"} ${px} ${py}`);
    }
    return parts.join(" ");
  }, [channel, toneCurve]);

  const histLine = useMemo(() => {
    if (!histogram) return null;
    const h = channel === "r" ? histogram.r : channel === "g" ? histogram.g : channel === "b" ? histogram.b : histogram.luma;
    return histogramToPolyline(h, SIZE, SIZE);
  }, [histogram, channel]);

  const channelColor = CHANNELS.find((c) => c.id === channel)?.color ?? "#e2e8f0";

  const toNorm = useCallback((clientX: number, clientY: number): CurvePoint => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height)),
    };
  }, []);

  const onPointDown = (idx: number) => (e: React.PointerEvent) => {
    if (disabled) return;
    e.stopPropagation();
    dragIdx.current = idx;
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const onSvgPointerMove = (e: React.PointerEvent) => {
    if (dragIdx.current == null || disabled) return;
    const p = toNorm(e.clientX, e.clientY);
    const idx = dragIdx.current;
    const next = sorted.map((pt, i) => {
      if (i !== idx) return { ...pt };
      if (idx === 0) return { x: 0, y: p.y };
      if (idx === sorted.length - 1) return { x: 1, y: p.y };
      return { x: Math.max(0.02, Math.min(0.98, p.x)), y: p.y };
    });
    onPointsChange(next);
  };

  const onSvgPointerUp = () => {
    dragIdx.current = null;
  };

  const onSvgDoubleClick = (e: React.MouseEvent) => {
    if (disabled) return;
    const p = toNorm(e.clientX, e.clientY);
    if (p.x <= 0.03 || p.x >= 0.97) return;
    const next = [...sorted, p].sort((a, b) => a.x - b.x);
    onPointsChange(next);
  };

  const onPointDoubleClick = (idx: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || sorted.length <= 2) return;
    if (idx === 0 || idx === sorted.length - 1) return;
    onPointsChange(sorted.filter((_, i) => i !== idx));
  };

  const onReset = () => onPointsChange([...DEFAULT_CURVE_POINTS]);

  return (
    <div className="lr-curve-editor nodrag">
      <div className="lr-curve-editor__channels">
        {CHANNELS.map((ch) => (
          <button
            key={ch.id}
            type="button"
            className={`lr-curve-editor__ch${channel === ch.id ? " is-active" : ""}`}
            style={{ "--ch-color": ch.color } as React.CSSProperties}
            disabled={disabled}
            onClick={() => onChannelChange(ch.id)}
          >
            {ch.label}
          </button>
        ))}
        <button type="button" className="lr-curve-editor__reset" disabled={disabled} onClick={onReset}>
          Reset
        </button>
      </div>
      <svg
        ref={svgRef}
        className="lr-curve-editor__svg"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        onPointerMove={onSvgPointerMove}
        onPointerUp={onSvgPointerUp}
        onPointerLeave={onSvgPointerUp}
        onDoubleClick={onSvgDoubleClick}
      >
        <rect width={SIZE} height={SIZE} fill="rgba(0,0,0,0.35)" />
        {histLine ? <path d={histLine} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1" /> : null}
        <line x1={0} y1={SIZE} x2={SIZE} y2={0} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
        <path d={curvePath} fill="none" stroke={channelColor} strokeWidth="2" />
        {sorted.map((pt, i) => (
          <circle
            key={`${pt.x}-${pt.y}-${i}`}
            cx={pt.x * SIZE}
            cy={(1 - pt.y) * SIZE}
            r={5}
            className="lr-curve-editor__point"
            fill={channelColor}
            onPointerDown={onPointDown(i)}
            onDoubleClick={onPointDoubleClick(i)}
          />
        ))}
      </svg>
      <p className="lr-curve-editor__hint">Doble clic: añadir punto · Doble clic en punto: eliminar</p>
    </div>
  );
}
