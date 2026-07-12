"use client";

import React from "react";
import { ScrubNumberInput } from "../spaces/ScrubNumberInput";
import type { TrackSpec, TrackSpecMode } from "./grid-segments";

const SCRUB_TITLE = "Arrastra · Mayús ×10";

export function GridSizingPill({
  label,
  spec,
  onChange,
}: {
  label: string;
  spec: TrackSpec | "mixed" | null;
  onChange: (spec: TrackSpec) => void;
}) {
  const mode: TrackSpecMode | "mixed" = spec === "mixed" || spec === null ? "mixed" : spec.mode;
  const value = spec && spec !== "mixed" ? spec.value : mode === "px" ? 120 : 1;

  const commit = (next: number) => {
    if (!Number.isFinite(next) || next <= 0) return;
    if (mode === "px") onChange({ mode: "px", value: Math.max(10, Math.round(next)) });
    else onChange({ mode: "fr", value: Math.max(0.1, Math.round(next * 10) / 10) });
  };

  return (
    <div className="site-lab-grid__pill-field" onPointerDown={(event) => event.stopPropagation()}>
      <span className="site-lab-grid__pill-key">{label}</span>
      <div className="site-lab-grid__pill-seg" role="group" aria-label={`${label} modo`}>
        <button
          type="button"
          className={`site-lab-grid__pill-seg-btn${mode === "fr" ? " is-active" : ""}`}
          onClick={() => onChange({ mode: "fr", value: typeof value === "number" && value > 0 ? value : 1 })}
        >
          %
        </button>
        <button
          type="button"
          className={`site-lab-grid__pill-seg-btn${mode === "px" ? " is-active" : ""}`}
          onClick={() => onChange({ mode: "px", value: typeof value === "number" && value > 0 ? value : 120 })}
        >
          px
        </button>
      </div>
      {mode === "mixed" ? (
        <span className="site-lab-grid__pill-mixed">—</span>
      ) : mode === "px" ? (
        <ScrubNumberInput
          className="site-lab-grid__pill-value site-lab-grid__pill-scrub"
          title={SCRUB_TITLE}
          value={value}
          min={10}
          step={1}
          roundFn={Math.round}
          onKeyboardCommit={commit}
          onScrubLive={commit}
          onScrubEnd={() => {}}
        />
      ) : (
        <ScrubNumberInput
          className="site-lab-grid__pill-value site-lab-grid__pill-scrub"
          title={SCRUB_TITLE}
          value={value}
          min={0.1}
          step={0.1}
          roundFn={(n) => Math.round(n * 10) / 10}
          onKeyboardCommit={commit}
          onScrubLive={commit}
          onScrubEnd={() => {}}
        />
      )}
    </div>
  );
}

export function GridSelectionSizingBar({
  colSpec,
  rowSpec,
  onColChange,
  onRowChange,
  style,
}: {
  colSpec: TrackSpec | "mixed" | null;
  rowSpec: TrackSpec | "mixed" | null;
  onColChange: (spec: TrackSpec) => void;
  onRowChange: (spec: TrackSpec) => void;
  style?: React.CSSProperties;
}) {
  return (
    <div className="site-lab-grid__sizing-bar" style={style} onPointerDown={(event) => event.stopPropagation()}>
      <GridSizingPill label="W" spec={colSpec} onChange={onColChange} />
      <span className="site-lab-grid__sizing-divider" aria-hidden />
      <GridSizingPill label="H" spec={rowSpec} onChange={onRowChange} />
    </div>
  );
}
