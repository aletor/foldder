"use client";

import React, { useEffect, useState } from "react";
import { clampViewportWidth } from "./site-creator-viewport";

export interface SiteCreatorWidthFieldProps {
  width: number;
  referenceWidth: number;
  onCommit: (width: number) => void;
}

export function SiteCreatorWidthField({ width, referenceWidth, onCommit }: SiteCreatorWidthFieldProps) {
  const [draft, setDraft] = useState(String(width));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(String(width));
  }, [focused, width]);

  const commitDraft = () => {
    const parsed = Number.parseInt(draft.replace(/[^\d-]/g, ""), 10);
    if (!Number.isFinite(parsed)) {
      setDraft(String(width));
      return;
    }
    const next = clampViewportWidth(parsed, referenceWidth);
    setDraft(String(next));
    if (next !== width) onCommit(next);
  };

  return (
    <label className="flex items-center gap-1.5 text-[11px] text-white/55">
      <span className="shrink-0">Ancho</span>
      <input
        type="number"
        inputMode="numeric"
        data-testid="site-creator-width-input"
        className="site-creator-width-input h-7 w-[72px] rounded border border-white/12 bg-white/5 px-2 text-[11px] font-semibold text-white outline-none [appearance:textfield] focus:border-white/30 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        value={draft}
        min={280}
        step={1}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          commitDraft();
        }}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            setDraft(String(width));
            (e.target as HTMLInputElement).blur();
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            commitDraft();
            (e.target as HTMLInputElement).blur();
            return;
          }
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const base = Number.parseInt(draft.replace(/[^\d-]/g, ""), 10);
            const current = Number.isFinite(base) ? base : width;
            const step = e.shiftKey ? 10 : 1;
            const next = clampViewportWidth(
              current + (e.key === "ArrowUp" ? step : -step),
              referenceWidth,
            );
            setDraft(String(next));
            onCommit(next);
          }
        }}
      />
      <span className="shrink-0">px</span>
    </label>
  );
}
