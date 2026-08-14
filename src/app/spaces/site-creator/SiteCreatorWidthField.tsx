"use client";

import React from "react";
import { ScrubNumberInput } from "@/app/spaces/ScrubNumberInput";
import { clampViewportWidth } from "./site-creator-viewport";

export interface SiteCreatorWidthFieldProps {
  width: number;
  referenceWidth: number;
  onCommit: (width: number) => void;
}

export function SiteCreatorWidthField({ width, referenceWidth, onCommit }: SiteCreatorWidthFieldProps) {
  const clampWidth = (value: number) => clampViewportWidth(Math.round(value), referenceWidth);

  return (
    <label className="flex items-center gap-1.5 text-[11px] text-white/55">
      <span className="shrink-0">Ancho</span>
      <ScrubNumberInput
        value={width}
        step={1}
        roundFn={clampWidth}
        onScrubLive={(next) => onCommit(clampWidth(next))}
        onScrubEnd={() => undefined}
        onKeyboardCommit={(next) => onCommit(clampWidth(next))}
        data-testid="site-creator-width-input"
        className="site-creator-width-input h-7 w-[72px] rounded border border-white/12 bg-white/5 px-2 text-[11px] font-semibold text-white outline-none [appearance:textfield] focus:border-white/30 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        title="Arrastra para cambiar el ancho · Mayús = ×10"
        min={280}
      />
      <span className="shrink-0">px</span>
    </label>
  );
}
