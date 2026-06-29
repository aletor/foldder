"use client";

import React, { useRef } from "react";
import { ScrubNumberInput } from "../../ScrubNumberInput";

export const LIGHTROOM_SCRUB_TITLE = "Arrastra horizontalmente · Mayús = ×10 · Doble clic = reset";

export type LightroomScrubValueProps = {
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  step?: number;
  onChange: (v: number) => void;
  onReset?: () => void;
  /** Si se define, muestra texto formateado (p. ej. 3862K) pero el scrub usa `value`. */
  formatDisplay?: (v: number) => string;
};

function clampValue(n: number, min: number, max: number, step: number): number {
  const rounded = step >= 1 ? Math.round(n) : Math.round(n / step) * step;
  return Math.max(min, Math.min(max, Number(rounded.toFixed(4))));
}

function useScrubHandlers(
  value: number,
  min: number,
  max: number,
  step: number,
  disabled: boolean | undefined,
  onChange: (v: number) => void,
) {
  const scrubRef = useRef<{
    pointerId: number;
    startX: number;
    startVal: number;
    active: boolean;
  } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    e.stopPropagation();
    if (e.button !== 0 || disabled) return;
    const el = e.currentTarget;
    scrubRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startVal: value,
      active: false,
    };
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }

    const onMove = (ev: PointerEvent) => {
      const s = scrubRef.current;
      if (!s || ev.pointerId !== s.pointerId) return;
      const dx = ev.clientX - s.startX;
      if (!s.active) {
        if (Math.abs(dx) < 3) return;
        s.active = true;
        document.body.style.cursor = "ew-resize";
        document.body.style.userSelect = "none";
      }
      const mult = ev.shiftKey ? 10 : 1;
      onChange(clampValue(s.startVal + dx * step * mult, min, max, step));
    };

    const onUp = (ev: PointerEvent) => {
      const s = scrubRef.current;
      if (!s || ev.pointerId !== s.pointerId) return;
      try {
        el.releasePointerCapture(ev.pointerId);
      } catch {
        /* noop */
      }
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      scrubRef.current = null;
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
  };

  return onPointerDown;
}

export function LightroomScrubValue({
  value,
  min,
  max,
  disabled,
  step = 1,
  onChange,
  onReset,
  formatDisplay,
}: LightroomScrubValueProps) {
  const clamp = (n: number) => clampValue(n, min, max, step);
  const onPointerDown = useScrubHandlers(value, min, max, step, disabled, (n) => onChange(clamp(n)));

  if (formatDisplay) {
    return (
      <span
        className="lightroom-develop-controls__scrub lightroom-develop-controls__scrub--text nodrag"
        title={LIGHTROOM_SCRUB_TITLE}
        onPointerDown={onPointerDown}
        onDoubleClick={(e) => {
          e.preventDefault();
          onReset?.();
        }}
      >
        {formatDisplay(value)}
      </span>
    );
  }

  return (
    <ScrubNumberInput
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      roundFn={clamp}
      onKeyboardCommit={(n) => onChange(clamp(n))}
      onScrubLive={(n) => onChange(clamp(n))}
      onScrubEnd={() => undefined}
      title={LIGHTROOM_SCRUB_TITLE}
      className="lightroom-develop-controls__scrub nodrag"
      onDoubleClick={(e) => {
        e.preventDefault();
        onReset?.();
      }}
    />
  );
}
