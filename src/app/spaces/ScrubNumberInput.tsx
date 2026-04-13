"use client";

import React, { useRef } from "react";

/** Campo numérico: arrastre horizontal sobre el input (estilo DaVinci Resolve). Clic sin mover = editar con teclado. Mayús = ×10. */
export function ScrubNumberInput({
  value,
  onKeyboardCommit,
  onScrubLive,
  onScrubEnd,
  step = 1,
  roundFn = Math.round,
  className,
  title,
  ...rest
}: {
  value: number;
  onKeyboardCommit: (n: number) => void;
  onScrubLive: (n: number) => void;
  onScrubEnd: () => void;
  step?: number;
  roundFn?: (n: number) => number;
  className?: string;
  title?: string;
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange" | "onPointerDown"
>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const scrubRef = useRef<{
    pointerId: number;
    startX: number;
    startVal: number;
    active: boolean;
  } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLInputElement>) => {
    if (e.button !== 0) return;
    if (e.currentTarget.disabled) return;
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
        inputRef.current?.blur();
        document.body.style.cursor = "ew-resize";
        document.body.style.userSelect = "none";
      }
      const mult = ev.shiftKey ? 10 : 1;
      const next = roundFn(s.startVal + dx * step * mult);
      onScrubLive(next);
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
      if (s.active) onScrubEnd();
      scrubRef.current = null;
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
  };

  return (
    <input
      ref={inputRef}
      type="number"
      value={Number.isFinite(value) ? value : 0}
      title={title}
      onChange={(e) => onKeyboardCommit(Number(e.target.value))}
      onPointerDown={onPointerDown}
      className={className}
      {...rest}
    />
  );
}
