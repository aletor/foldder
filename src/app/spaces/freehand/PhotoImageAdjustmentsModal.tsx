"use client";

import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { ScrubNumberInput } from "../ScrubNumberInput";
import {
  gammaToMidPos,
  midPosToGamma,
  type PhotoLevels,
} from "./photo-image-adjustments";

export type PhotoImageAdjustmentsValues = {
  brightness: number;
  contrast: number;
  saturation: number;
  levels: PhotoLevels;
};

const SCRUB_CLASS =
  "w-full cursor-ew-resize rounded-none border border-white/10 bg-black/30 px-1.5 py-1 text-center font-mono text-[11px] tabular-nums text-white outline-none focus:border-[#71449f] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

const LABEL_CLASS = "text-[8px] font-black uppercase tracking-[0.12em] text-white/40";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function Triangle({
  leftPct,
  color,
  flip,
  onPointerDown,
}: {
  leftPct: number;
  color: string;
  flip?: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      onPointerDown={onPointerDown}
      className="absolute top-1/2 z-10 h-0 w-0 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize"
      style={{
        left: `${leftPct}%`,
        borderLeft: "5px solid transparent",
        borderRight: "5px solid transparent",
        [flip ? "borderTop" : "borderBottom"]: `8px solid ${color}`,
      }}
    />
  );
}

function LevelsHistogram({
  histogram,
  levels,
  onChange,
  onScrubEnd,
}: {
  histogram: number[];
  levels: PhotoLevels;
  onChange: (next: PhotoLevels, recordHistory: boolean) => void;
  onScrubEnd: () => void;
}) {
  const max = Math.max(1, ...histogram);
  // Escala con raíz para que los detalles bajos sean visibles (como Photoshop con clip suave).
  const barPoints = histogram
    .map((c, i) => {
      const x = (i / 255) * 100;
      const h = Math.sqrt(c / max) * 100;
      return `${x.toFixed(3)},${(100 - h).toFixed(3)}`;
    })
    .join(" ");

  const inBlackPct = (levels.inBlack / 255) * 100;
  const inWhitePct = (levels.inWhite / 255) * 100;
  const midPos = gammaToMidPos(levels.gamma);
  const gammaAbs = levels.inBlack + midPos * (levels.inWhite - levels.inBlack);
  const gammaPct = (gammaAbs / 255) * 100;

  const inputTrackRef = useRef<HTMLDivElement>(null);
  const outputTrackRef = useRef<HTMLDivElement>(null);

  const setFromInput = (handle: "black" | "gamma" | "white", f: number, phase: "move" | "end") => {
    const v = f * 255;
    if (handle === "black") {
      const inBlack = clamp(Math.round(v), 0, levels.inWhite - 1);
      onChange({ ...levels, inBlack }, false);
    } else if (handle === "white") {
      const inWhite = clamp(Math.round(v), levels.inBlack + 1, 255);
      onChange({ ...levels, inWhite }, false);
    } else {
      const m = clamp((v - levels.inBlack) / Math.max(1, levels.inWhite - levels.inBlack), 0.001, 0.999);
      onChange({ ...levels, gamma: midPosToGamma(m) }, false);
    }
    if (phase === "end") onScrubEnd();
  };

  const setFromOutput = (handle: "black" | "white", f: number, phase: "move" | "end") => {
    const v = clamp(Math.round(f * 255), 0, 255);
    if (handle === "black") onChange({ ...levels, outBlack: Math.min(v, levels.outWhite) }, false);
    else onChange({ ...levels, outWhite: Math.max(v, levels.outBlack) }, false);
    if (phase === "end") onScrubEnd();
  };

  const handleRef = useRef<null | "black" | "gamma" | "white">(null);
  const outHandleRef = useRef<null | "black" | "white">(null);

  return (
    <div className="space-y-1.5">
      {/* Histograma */}
      <div className="relative h-[92px] w-full border border-white/10 bg-black/40">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <polyline points={`0,100 ${barPoints} 100,100`} fill="rgba(255,255,255,0.45)" stroke="none" />
        </svg>
      </div>

      {/* Track entrada (negro · gamma · blanco) */}
      <div
        ref={inputTrackRef}
        className="relative h-3 w-full select-none"
        onPointerMove={(e) => {
          if (!handleRef.current) return;
          const r = inputTrackRef.current!.getBoundingClientRect();
          const f = clamp((e.clientX - r.left) / Math.max(1, r.width), 0, 1);
          setFromInput(handleRef.current, f, "move");
        }}
        onPointerUp={(e) => {
          if (!handleRef.current) return;
          const h = handleRef.current;
          handleRef.current = null;
          const r = inputTrackRef.current!.getBoundingClientRect();
          const f = clamp((e.clientX - r.left) / Math.max(1, r.width), 0, 1);
          setFromInput(h, f, "end");
        }}
      >
        <div className="absolute top-1/2 h-px w-full -translate-y-1/2 bg-white/15" />
        <Triangle leftPct={inBlackPct} color="#0a0a0a" onPointerDown={(e) => { handleRef.current = "black"; e.currentTarget.parentElement?.setPointerCapture?.(e.pointerId); }} />
        <Triangle leftPct={gammaPct} color="#8a8a8a" onPointerDown={(e) => { handleRef.current = "gamma"; e.currentTarget.parentElement?.setPointerCapture?.(e.pointerId); }} />
        <Triangle leftPct={inWhitePct} color="#f5f5f5" onPointerDown={(e) => { handleRef.current = "white"; e.currentTarget.parentElement?.setPointerCapture?.(e.pointerId); }} />
      </div>

      {/* Track salida (gradiente negro→blanco) */}
      <div
        ref={outputTrackRef}
        className="relative mt-1 h-3 w-full select-none"
        onPointerMove={(e) => {
          if (!outHandleRef.current) return;
          const r = outputTrackRef.current!.getBoundingClientRect();
          const f = clamp((e.clientX - r.left) / Math.max(1, r.width), 0, 1);
          setFromOutput(outHandleRef.current, f, "move");
        }}
        onPointerUp={(e) => {
          if (!outHandleRef.current) return;
          const h = outHandleRef.current;
          outHandleRef.current = null;
          const r = outputTrackRef.current!.getBoundingClientRect();
          const f = clamp((e.clientX - r.left) / Math.max(1, r.width), 0, 1);
          setFromOutput(h, f, "end");
        }}
      >
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 bg-gradient-to-r from-black to-white" />
        <Triangle leftPct={(levels.outBlack / 255) * 100} color="#0a0a0a" flip onPointerDown={(e) => { outHandleRef.current = "black"; e.currentTarget.parentElement?.setPointerCapture?.(e.pointerId); }} />
        <Triangle leftPct={(levels.outWhite / 255) * 100} color="#f5f5f5" flip onPointerDown={(e) => { outHandleRef.current = "white"; e.currentTarget.parentElement?.setPointerCapture?.(e.pointerId); }} />
      </div>
    </div>
  );
}

function ToneRow({
  label,
  value,
  onChange,
  onScrubEnd,
}: {
  label: string;
  value: number;
  onChange: (n: number, recordHistory: boolean) => void;
  onScrubEnd: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-[68px] shrink-0 ${LABEL_CLASS}`}>{label}</span>
      <input
        type="range"
        min={-100}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value), false)}
        onPointerUp={onScrubEnd}
        onKeyUp={onScrubEnd}
        className="min-w-0 flex-1 accent-[#71449f]"
      />
      <ScrubNumberInput
        value={value}
        onKeyboardCommit={(n) => onChange(clamp(Math.round(n), -100, 100), true)}
        onScrubLive={(n) => onChange(clamp(Math.round(n), -100, 100), false)}
        onScrubEnd={onScrubEnd}
        step={1}
        roundFn={(n) => clamp(Math.round(n), -100, 100)}
        min={-100}
        max={100}
        title="Arrastra horizontalmente · Mayús = ×10"
        className={`w-12 shrink-0 ${SCRUB_CLASS}`}
      />
    </div>
  );
}

export function PhotoImageAdjustmentsModal({
  open,
  histogram,
  hasSelection,
  values,
  onChange,
  onScrubEnd,
  onReset,
  onCancel,
  onApply,
}: {
  open: boolean;
  histogram: number[];
  hasSelection: boolean;
  values: PhotoImageAdjustmentsValues;
  onChange: (next: PhotoImageAdjustmentsValues, recordHistory: boolean) => void;
  onScrubEnd: () => void;
  onReset: () => void;
  onCancel: () => void;
  onApply: () => void;
}) {
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragSessionRef = useRef<{ pointerId: number; startX: number; startY: number; origX: number; origY: number } | null>(null);

  const onHeaderPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragSessionRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, origX: dragOffset.x, origY: dragOffset.y };
  };
  const onHeaderPointerMove = (e: React.PointerEvent) => {
    const s = dragSessionRef.current;
    if (!s || e.pointerId !== s.pointerId) return;
    setDragOffset({ x: s.origX + (e.clientX - s.startX), y: s.origY + (e.clientY - s.startY) });
  };
  const onHeaderPointerUp = (e: React.PointerEvent) => {
    const s = dragSessionRef.current;
    if (!s || e.pointerId !== s.pointerId) return;
    dragSessionRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  if (!open || typeof document === "undefined") return null;

  const L = values.levels;
  const setLevels = (next: PhotoLevels, recordHistory: boolean) =>
    onChange({ ...values, levels: next }, recordHistory);
  const levelScrub = (
    value: number,
    set: (n: number) => void,
    min: number,
    max: number,
    step: number,
    round: (n: number) => number,
    title: string,
  ) => (
    <ScrubNumberInput
      value={value}
      onKeyboardCommit={(n) => set(round(clamp(n, min, max)))}
      onScrubLive={(n) => set(round(clamp(n, min, max)))}
      onScrubEnd={onScrubEnd}
      step={step}
      roundFn={round}
      min={min}
      max={max}
      title={title}
      className={SCRUB_CLASS}
    />
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[100210] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="photoroom-adjustments-title"
      onClick={onCancel}
    >
      <div
        className="flex w-[min(94vw,380px)] flex-col overflow-hidden rounded-none border border-white/10 bg-[#0b0f14] shadow-[0_24px_70px_rgba(0,0,0,0.55)]"
        style={{ transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex h-10 shrink-0 items-stretch border-b border-white/10 bg-white/[0.04]">
          <div
            className="flex min-w-0 flex-1 cursor-grab touch-none select-none items-center gap-2.5 px-4 active:cursor-grabbing"
            onPointerDown={onHeaderPointerDown}
            onPointerMove={onHeaderPointerMove}
            onPointerUp={onHeaderPointerUp}
            onPointerCancel={onHeaderPointerUp}
          >
            <span className="h-2 w-2 shrink-0 bg-[#71449f]" aria-hidden />
            <h2 id="photoroom-adjustments-title" className="truncate text-[10px] font-black uppercase tracking-[0.12em] text-white">
              Ajustes de imagen
            </h2>
            {hasSelection ? (
              <span className="ml-1 shrink-0 bg-[#71449f]/25 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.1em] text-[#c9a7ec]">
                Selección
              </span>
            ) : null}
          </div>
          <button
            type="button"
            className="flex w-10 shrink-0 items-center justify-center border-l border-white/10 text-white/45 transition hover:bg-white/[0.06] hover:text-white"
            aria-label="Cerrar"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onCancel}
          >
            <X size={15} strokeWidth={2} />
          </button>
        </header>

        <div className="space-y-3 px-3 py-3">
          <div className="space-y-2.5">
            <ToneRow label="Brillo" value={values.brightness} onChange={(n, r) => onChange({ ...values, brightness: n }, r)} onScrubEnd={onScrubEnd} />
            <ToneRow label="Contraste" value={values.contrast} onChange={(n, r) => onChange({ ...values, contrast: n }, r)} onScrubEnd={onScrubEnd} />
            <ToneRow label="Saturación" value={values.saturation} onChange={(n, r) => onChange({ ...values, saturation: n }, r)} onScrubEnd={onScrubEnd} />
          </div>

          <div className="space-y-2 border-t border-white/10 pt-3">
            <span className={LABEL_CLASS}>Niveles</span>
            <LevelsHistogram histogram={histogram} levels={L} onChange={setLevels} onScrubEnd={onScrubEnd} />

            <div className="flex items-center gap-2">
              <span className="w-[52px] shrink-0 text-[8px] font-black uppercase tracking-[0.1em] text-white/35">Entrada</span>
              <div className="grid min-w-0 flex-1 grid-cols-3 gap-1">
                {levelScrub(L.inBlack, (n) => setLevels({ ...L, inBlack: Math.min(n, L.inWhite - 1) }, true), 0, 254, 1, (n) => Math.round(n), "Punto negro de entrada")}
                {levelScrub(Math.round(L.gamma * 100) / 100, (n) => setLevels({ ...L, gamma: n }, true), 0.1, 9.99, 0.01, (n) => Math.round(n * 100) / 100, "Gamma (medios tonos)")}
                {levelScrub(L.inWhite, (n) => setLevels({ ...L, inWhite: Math.max(n, L.inBlack + 1) }, true), 1, 255, 1, (n) => Math.round(n), "Punto blanco de entrada")}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-[52px] shrink-0 text-[8px] font-black uppercase tracking-[0.1em] text-white/35">Salida</span>
              <div className="grid min-w-0 flex-1 grid-cols-2 gap-1">
                {levelScrub(L.outBlack, (n) => setLevels({ ...L, outBlack: Math.min(n, L.outWhite) }, true), 0, 255, 1, (n) => Math.round(n), "Punto negro de salida")}
                {levelScrub(L.outWhite, (n) => setLevels({ ...L, outWhite: Math.max(n, L.outBlack) }, true), 0, 255, 1, (n) => Math.round(n), "Punto blanco de salida")}
              </div>
            </div>
          </div>
        </div>

        <footer className="flex h-10 shrink-0 items-stretch justify-end divide-x divide-white/10 border-t border-white/10 bg-white/[0.04]">
          <button
            type="button"
            className="px-4 text-[9px] font-black uppercase tracking-[0.1em] text-white/45 transition hover:bg-white/[0.06] hover:text-white"
            onClick={onReset}
          >
            Restablecer
          </button>
          <button
            type="button"
            className="px-4 text-[9px] font-black uppercase tracking-[0.1em] text-white/45 transition hover:bg-white/[0.06] hover:text-white"
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="bg-[#71449f] px-6 text-[9px] font-black uppercase tracking-[0.1em] text-white transition hover:bg-[#8055b0]"
            onClick={onApply}
          >
            OK
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
