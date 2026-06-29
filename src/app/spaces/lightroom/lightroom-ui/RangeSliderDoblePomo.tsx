"use client";

import React, { useCallback, useMemo, useRef } from "react";
import { histogramToPath } from "./lightroom-histogram";

export type RangeSliderDoblePomoProps = {
  label?: string;
  min: number;
  max: number;
  low: number;
  high: number;
  /** Histograma luma 256 bins opcional como fondo */
  histogram?: Uint32Array;
  disabled?: boolean;
  onChange: (low: number, high: number) => void;
};

export function RangeSliderDoblePomo({
  label,
  min,
  max,
  low,
  high,
  histogram,
  disabled,
  onChange,
}: RangeSliderDoblePomoProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<"low" | "high" | null>(null);

  const span = max - min || 1;
  const lowPct = ((low - min) / span) * 100;
  const highPct = ((high - min) / span) * 100;

  const histPath = useMemo(() => {
    if (!histogram) return null;
    return histogramToPath(histogram, 200, 48);
  }, [histogram]);

  const valueFromClientX = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return min;
      const t = (clientX - rect.left) / Math.max(rect.width, 1);
      return Math.round(min + Math.max(0, Math.min(1, t)) * span);
    },
    [min, span],
  );

  const onPointerDown = (which: "low" | "high") => (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    dragRef.current = which;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const which = dragRef.current;
    if (!which || disabled) return;
    const v = valueFromClientX(e.clientX);
    if (which === "low") onChange(Math.min(v, high - 1), high);
    else onChange(low, Math.max(v, low + 1));
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div className="lr-range-dual nodrag">
      {label ? <span className="lightroom-develop-controls__label lr-range-dual__label">{label}</span> : null}
      <div
        ref={trackRef}
        className="lr-range-dual__track"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {histPath ? (
          <svg className="lr-range-dual__hist" viewBox="0 0 200 48" preserveAspectRatio="none">
            <path d={histPath} fill="rgba(255,255,255,0.12)" />
          </svg>
        ) : null}
        <div className="lr-range-dual__selection" style={{ left: `${lowPct}%`, width: `${highPct - lowPct}%` }} />
        <button
          type="button"
          className="lr-range-dual__thumb lr-range-dual__thumb--low"
          style={{ left: `${lowPct}%` }}
          disabled={disabled}
          onPointerDown={onPointerDown("low")}
          aria-label="Luminancia mínima"
        />
        <button
          type="button"
          className="lr-range-dual__thumb lr-range-dual__thumb--high"
          style={{ left: `${highPct}%` }}
          disabled={disabled}
          onPointerDown={onPointerDown("high")}
          aria-label="Luminancia máxima"
        />
      </div>
      <div className="lr-range-dual__values">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}
