"use client";

import React from "react";
import type { TrackSpec, TrackSpecMode } from "./grid-segments";

export function GridSizingPill({
  label,
  spec,
  onChange,
  style,
}: {
  label: string;
  spec: TrackSpec | "mixed" | null;
  onChange: (spec: TrackSpec) => void;
  style?: React.CSSProperties;
}) {
  const mode: TrackSpecMode | "mixed" = spec === "mixed" || spec === null ? "mixed" : spec.mode;
  const value = spec && spec !== "mixed" ? spec.value : "";

  return (
    <div className="site-lab-grid__pill" style={style} onPointerDown={(event) => event.stopPropagation()}>
      <span className="site-lab-grid__pill-label">{label}</span>
      <div className="site-lab-grid__pill-toggle" role="group" aria-label={`${label} modo`}>
        <button
          type="button"
          className={`site-lab-grid__pill-mode${mode === "fr" ? " is-active" : ""}`}
          onClick={() => onChange({ mode: "fr", value: typeof value === "number" && value > 0 ? value : 1 })}
        >
          %
        </button>
        <button
          type="button"
          className={`site-lab-grid__pill-mode${mode === "px" ? " is-active" : ""}`}
          onClick={() => onChange({ mode: "px", value: typeof value === "number" && value > 0 ? value : 120 })}
        >
          px
        </button>
      </div>
      <input
        className="site-lab-grid__pill-input"
        type="number"
        min={mode === "fr" ? 0.1 : 10}
        step={mode === "fr" ? 0.1 : 1}
        value={mode === "mixed" ? "" : value}
        placeholder={mode === "mixed" ? "Mixed" : mode === "fr" ? "1" : "120"}
        disabled={mode === "mixed"}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (!Number.isFinite(next) || next <= 0) return;
          onChange({ mode: mode === "px" ? "px" : "fr", value: next });
        }}
      />
    </div>
  );
}
