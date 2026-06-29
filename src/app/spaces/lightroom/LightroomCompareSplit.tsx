"use client";

import React, { useCallback, useRef } from "react";

export type LightroomCompareSplitProps = {
  split: number;
  onChange: (split: number) => void;
};

export function LightroomCompareSplit({ split, onChange }: LightroomCompareSplitProps) {
  const dragRef = useRef(false);

  const onMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const pct = Math.max(5, Math.min(95, ((e.clientX - rect.left) / Math.max(rect.width, 1)) * 100));
      onChange(pct);
    },
    [onChange],
  );

  return (
    <div
      className="lr-compare-split nodrag"
      onPointerMove={onMove}
      onPointerUp={() => {
        dragRef.current = false;
      }}
      onPointerLeave={() => {
        dragRef.current = false;
      }}
    >
      <button
        type="button"
        className="lr-compare-split__handle"
        style={{ left: `${split}%` }}
        aria-label="Arrastrar comparación antes/después"
        onPointerDown={(e) => {
          dragRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
      />
    </div>
  );
}
