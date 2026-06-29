"use client";

import React, { useCallback, useRef } from "react";
import type { LightroomCropSettings } from "./lightroom-crop-types";

export type LightroomCropOverlayProps = {
  crop: LightroomCropSettings;
  onChange: (crop: LightroomCropSettings) => void;
};

type DragKind = "move" | "se" | "sw" | "ne" | "nw" | null;

export function LightroomCropOverlay({ crop, onChange }: LightroomCropOverlayProps) {
  const dragRef = useRef<{ kind: DragKind; startX: number; startY: number; base: LightroomCropSettings } | null>(null);

  const norm = useCallback((e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(rect.width, 1))),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(rect.height, 1))),
    };
  }, []);

  const onDown = (kind: DragKind) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = norm(e);
    dragRef.current = { kind, startX: p.x, startY: p.y, base: { ...crop } };
  };

  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const p = norm(e);
    const dx = p.x - d.startX;
    const dy = p.y - d.startY;
    const b = d.base;
    let { x, y, w, h } = b;

    if (d.kind === "move") {
      x = Math.max(0, Math.min(1 - w, b.x + dx));
      y = Math.max(0, Math.min(1 - h, b.y + dy));
    } else if (d.kind === "se") {
      w = Math.max(0.05, Math.min(1 - x, b.w + dx));
      h = Math.max(0.05, Math.min(1 - y, b.h + dy));
    } else if (d.kind === "sw") {
      const nx = Math.max(0, Math.min(b.x + b.w - 0.05, b.x + dx));
      w = b.x + b.w - nx;
      x = nx;
      h = Math.max(0.05, Math.min(1 - y, b.h + dy));
    } else if (d.kind === "ne") {
      w = Math.max(0.05, Math.min(1 - x, b.w + dx));
      const ny = Math.max(0, Math.min(b.y + b.h - 0.05, b.y + dy));
      h = b.y + b.h - ny;
      y = ny;
    } else if (d.kind === "nw") {
      const nx = Math.max(0, Math.min(b.x + b.w - 0.05, b.x + dx));
      const ny = Math.max(0, Math.min(b.y + b.h - 0.05, b.y + dy));
      w = b.x + b.w - nx;
      h = b.y + b.h - ny;
      x = nx;
      y = ny;
    }
    onChange({ ...crop, x, y, w, h });
  };

  const onUp = () => {
    dragRef.current = null;
  };

  if (!crop.enabled) return null;

  const left = `${crop.x * 100}%`;
  const top = `${crop.y * 100}%`;
  const width = `${crop.w * 100}%`;
  const height = `${crop.h * 100}%`;

  return (
    <div className="lr-crop-overlay nodrag" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <div className="lr-crop-overlay__shade lr-crop-overlay__shade--top" style={{ height: top }} />
      <div className="lr-crop-overlay__shade lr-crop-overlay__shade--left" style={{ top, left: 0, width: left, height }} />
      <div className="lr-crop-overlay__shade lr-crop-overlay__shade--right" style={{ top, left: `calc(${left} + ${width})`, height }} />
      <div className="lr-crop-overlay__shade lr-crop-overlay__shade--bottom" style={{ top: `calc(${top} + ${height})` }} />
      <div
        className="lr-crop-overlay__rect"
        style={{ left, top, width, height, transform: `rotate(${crop.angle}deg)` }}
        onPointerDown={onDown("move")}
      >
        <span className="lr-crop-overlay__handle lr-crop-overlay__handle--nw" onPointerDown={onDown("nw")} />
        <span className="lr-crop-overlay__handle lr-crop-overlay__handle--ne" onPointerDown={onDown("ne")} />
        <span className="lr-crop-overlay__handle lr-crop-overlay__handle--sw" onPointerDown={onDown("sw")} />
        <span className="lr-crop-overlay__handle lr-crop-overlay__handle--se" onPointerDown={onDown("se")} />
      </div>
    </div>
  );
}
