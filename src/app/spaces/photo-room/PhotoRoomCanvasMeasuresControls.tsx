"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link2, Link2Off } from "lucide-react";
import { ScrubNumberInput } from "../ScrubNumberInput";
import type { NewDocumentConfig } from "./new-document-model";

function CheckerboardBg({ className }: { className?: string }) {
  return (
    <span
      className={`inline-block border border-white/15 ${className ?? ""}`}
      style={{
        backgroundImage:
          "linear-gradient(45deg, #404040 25%, transparent 25%), linear-gradient(-45deg, #404040 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #404040 75%), linear-gradient(-45deg, transparent 75%, #404040 75%)",
        backgroundSize: "8px 8px",
        backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px",
        backgroundColor: "#2a2a2a",
      }}
      aria-hidden
    />
  );
}

export type PhotoRoomCanvasMeasuresControlsProps = {
  width: number;
  height: number;
  background: NewDocumentConfig["background"];
  onDimensionsChange: (width: number, height: number) => void;
  onBackgroundChange: (background: NewDocumentConfig["background"]) => void;
  /** `modal`: columna del modal de presets; `panel`: barra lateral de propiedades. */
  variant?: "modal" | "panel";
};

export function PhotoRoomCanvasMeasuresControls({
  width,
  height,
  background,
  onDimensionsChange,
  onBackgroundChange,
  variant = "modal",
}: PhotoRoomCanvasMeasuresControlsProps) {
  const [lockAspect, setLockAspect] = useState(false);
  const aspectRef = useRef(width > 0 && height > 0 ? width / height : 1);

  useEffect(() => {
    if (width > 0 && height > 0) {
      aspectRef.current = width / height;
    }
  }, [width, height]);

  const isPortrait = height > width;
  const isSquare = width > 0 && width === height;
  const isPanel = variant === "panel";

  const applyWidth = useCallback(
    (n: number) => {
      const w = Math.max(1, Math.round(n));
      if (lockAspect && aspectRef.current > 0) {
        onDimensionsChange(w, Math.max(1, Math.round(w / aspectRef.current)));
      } else {
        onDimensionsChange(w, height);
      }
    },
    [height, lockAspect, onDimensionsChange],
  );

  const applyHeight = useCallback(
    (n: number) => {
      const h = Math.max(1, Math.round(n));
      if (lockAspect && aspectRef.current > 0) {
        onDimensionsChange(Math.max(1, Math.round(h * aspectRef.current)), h);
      } else {
        onDimensionsChange(width, h);
      }
    },
    [width, lockAspect, onDimensionsChange],
  );

  const toggleLockAspect = useCallback(() => {
    setLockAspect((prev) => {
      const next = !prev;
      if (next && width > 0 && height > 0) {
        aspectRef.current = width / height;
      }
      return next;
    });
  }, [width, height]);

  const swapOrientation = useCallback(() => {
    onDimensionsChange(height, width);
    if (aspectRef.current > 0) aspectRef.current = 1 / aspectRef.current;
  }, [width, height, onDimensionsChange]);

  const labelClass = isPanel
    ? "mb-1 block text-[8px] font-black uppercase tracking-[0.1em] text-white/40"
    : "mb-1.5 block text-[8px] font-black uppercase tracking-[0.12em] text-white/40";
  const sectionLabelClass = isPanel
    ? "mb-1.5 block text-[8px] font-black uppercase tracking-[0.1em] text-white/40"
    : "mb-2 block text-[8px] font-black uppercase tracking-[0.12em] text-white/40";
  const scrubClass = isPanel
    ? "nodrag min-w-0 flex-1 cursor-ew-resize bg-transparent px-2 py-1.5 text-center font-mono text-[11px] tabular-nums text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    : "nodrag min-w-0 flex-1 cursor-ew-resize bg-transparent px-2.5 py-2 text-[12px] tabular-nums text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
  const fieldBorder = "flex min-w-0 items-stretch border border-white/10 bg-black/30";
  const pxLabel = isPanel
    ? "flex shrink-0 items-center border-l border-white/10 px-1.5 text-[8px] font-semibold uppercase tracking-wide text-white/35"
    : "flex items-center border-l border-white/10 px-2 text-[9px] font-semibold uppercase tracking-wide text-white/35";

  const lockButton = (
    <button
      type="button"
      onClick={toggleLockAspect}
      aria-pressed={lockAspect}
      title={
        lockAspect
          ? "Escala bloqueada — se mantiene la proporción"
          : "Bloquear escala (mantener proporción)"
      }
      className={`nodrag flex shrink-0 items-center justify-center border transition ${
        isPanel ? "px-2 py-1.5" : "self-end px-2 py-2"
      } ${
        lockAspect
          ? "border-[#71449f] bg-[#71449f]/25 text-white"
          : "border-white/10 bg-black/30 text-white/40 hover:bg-white/[0.04] hover:text-white/75"
      }`}
    >
      {lockAspect ? <Link2 className="h-4 w-4" /> : <Link2Off className="h-4 w-4" />}
    </button>
  );

  const widthField = (
    <div className="min-w-0">
      <label className={labelClass}>Anchura</label>
      <div className={fieldBorder}>
        <ScrubNumberInput
          value={width}
          onKeyboardCommit={applyWidth}
          onScrubLive={applyWidth}
          onScrubEnd={() => {}}
          step={2}
          title="Arrastra horizontalmente · Mayús = ×10"
          className={scrubClass}
        />
        <span className={pxLabel}>px</span>
      </div>
    </div>
  );

  const heightField = (
    <div className="min-w-0">
      <label className={labelClass}>Altura</label>
      <div className={fieldBorder}>
        <ScrubNumberInput
          value={height}
          onKeyboardCommit={applyHeight}
          onScrubLive={applyHeight}
          onScrubEnd={() => {}}
          step={2}
          title="Arrastra horizontalmente · Mayús = ×10"
          className={scrubClass}
        />
        <span className={pxLabel}>px</span>
      </div>
    </div>
  );

  return (
    <div className={isPanel ? "flex w-full min-w-0 flex-col gap-2" : "flex flex-col gap-4"}>
      {isPanel ? (
        <div className="min-w-0 space-y-1.5">
          <div className="grid min-w-0 grid-cols-2 gap-1.5">
            {widthField}
            {heightField}
          </div>
          <div className="flex justify-center">{lockButton}</div>
        </div>
      ) : (
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          {widthField}
          {lockButton}
          {heightField}
        </div>
      )}

      <div>
        <span className={sectionLabelClass}>Orientación</span>
        <div className="grid grid-cols-2 gap-px bg-white/10">
          <button
            type="button"
            title="Vertical (alto mayor que ancho)"
            onClick={() => {
              if (!isPortrait && !isSquare) swapOrientation();
            }}
            className={`nodrag flex items-center justify-center gap-2 px-3 text-[10px] font-semibold uppercase tracking-wide transition ${
              isPanel ? "py-2" : "py-2.5"
            } ${
              isPortrait
                ? "bg-[#71449f]/20 text-white"
                : "bg-[#0b0f14] text-white/45 hover:bg-white/[0.04] hover:text-white/70"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="8" y="5" width="8" height="14" rx="0" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            Vertical
          </button>
          <button
            type="button"
            title="Horizontal (ancho mayor que alto)"
            onClick={() => {
              if (isPortrait || isSquare) swapOrientation();
            }}
            className={`nodrag flex items-center justify-center gap-2 px-3 text-[10px] font-semibold uppercase tracking-wide transition ${
              isPanel ? "py-2" : "py-2.5"
            } ${
              !isPortrait && !isSquare
                ? "bg-[#71449f]/20 text-white"
                : "bg-[#0b0f14] text-white/45 hover:bg-white/[0.04] hover:text-white/70"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="5" y="8" width="14" height="8" rx="0" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            Horizontal
          </button>
        </div>
      </div>

      <div>
        <span className={sectionLabelClass}>Fondo</span>
        <div className="grid grid-cols-3 gap-px bg-white/10">
          <button
            type="button"
            onClick={() => onBackgroundChange("white")}
            className={`nodrag flex flex-col items-center gap-2 px-2 text-[9px] font-semibold uppercase tracking-wide transition ${
              isPanel ? "py-2.5" : "py-3"
            } ${
              background === "white"
                ? "bg-[#71449f]/20 text-white"
                : "bg-[#0b0f14] text-white/45 hover:bg-white/[0.04]"
            }`}
          >
            <span className={`w-full border border-white/20 bg-white ${isPanel ? "h-6" : "h-7"}`} />
            Blanco
          </button>
          <button
            type="button"
            onClick={() => onBackgroundChange("black")}
            className={`nodrag flex flex-col items-center gap-2 px-2 text-[9px] font-semibold uppercase tracking-wide transition ${
              isPanel ? "py-2.5" : "py-3"
            } ${
              background === "black"
                ? "bg-[#71449f]/20 text-white"
                : "bg-[#0b0f14] text-white/45 hover:bg-white/[0.04]"
            }`}
          >
            <span className={`w-full border border-white/15 bg-black ${isPanel ? "h-6" : "h-7"}`} />
            Negro
          </button>
          <button
            type="button"
            onClick={() => onBackgroundChange("transparent")}
            className={`nodrag flex flex-col items-center gap-2 px-2 text-[9px] font-semibold uppercase tracking-wide transition ${
              isPanel ? "py-2.5" : "py-3"
            } ${
              background === "transparent"
                ? "bg-[#71449f]/20 text-white"
                : "bg-[#0b0f14] text-white/45 hover:bg-white/[0.04]"
            }`}
          >
            <CheckerboardBg className={isPanel ? "h-6 w-full" : "h-7 w-full"} />
            Transparente
          </button>
        </div>
      </div>
    </div>
  );
}
