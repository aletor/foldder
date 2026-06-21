"use client";

import React, { useMemo } from "react";
import { COMPOSITION_EASING_OPTIONS, type CompositionEasing } from "./video-editor-composition-types";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function easeSample(t: number, easing: CompositionEasing): number {
  const x = Math.max(0, Math.min(1, t));
  switch (easing) {
    case "easeIn":
      return x * x;
    case "easeOut":
      return 1 - (1 - x) * (1 - x);
    case "easeInOut":
      return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    case "linear":
    default:
      return x;
  }
}

function EasingCurvePreview({ easing }: { easing: CompositionEasing }) {
  const path = useMemo(() => {
    const w = 36;
    const h = 20;
    const pts: string[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const y = easeSample(t, easing);
      pts.push(`${(t * w).toFixed(1)},${(h - y * h).toFixed(1)}`);
    }
    return `M ${pts.join(" L ")}`;
  }, [easing]);

  return (
    <svg width={36} height={20} viewBox="0 0 36 20" className="shrink-0" aria-hidden>
      <rect x={0} y={0} width={36} height={20} fill="rgba(255,255,255,0.04)" rx={2} />
      <path d={path} fill="none" stroke="#3a8f96" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}

export function CompositionEasingPicker({
  value,
  onChange,
}: {
  value: CompositionEasing;
  onChange: (easing: CompositionEasing) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {COMPOSITION_EASING_OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          title={option.label}
          onClick={() => onChange(option.id)}
          className={cx(
            "flex items-center gap-1.5 border px-1.5 py-1 transition",
            value === option.id
              ? "border-[#3a8f96]/50 bg-[#3a8f96]/15 text-white"
              : "border-white/10 text-white/50 hover:border-white/20 hover:text-white/75",
          )}
        >
          <EasingCurvePreview easing={option.id} />
          <span className="text-[9px] font-black uppercase tracking-[0.06em]">{option.label}</span>
        </button>
      ))}
    </div>
  );
}
