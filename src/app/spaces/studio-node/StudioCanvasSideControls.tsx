"use client";

import React from "react";
import { LayoutGrid } from "lucide-react";
import { StudioCanvasMeasuresControls } from "./StudioCanvasMeasuresControls";
import type { NewDocumentConfig } from "./studio-canvas-document-model";

export type StudioCanvasSideControlsProps = {
  width: number;
  height: number;
  background: NewDocumentConfig["background"];
  onDimensionsChange: (width: number, height: number) => void;
  onBackgroundChange: (background: NewDocumentConfig["background"]) => void;
  onOpenPresetModal: () => void;
};

/** Panel lateral Canvas (anchura/altura, orientación, fondo) + botón Presets y fondo. */
export function StudioCanvasSideControls({
  width,
  height,
  background,
  onDimensionsChange,
  onBackgroundChange,
  onOpenPresetModal,
}: StudioCanvasSideControlsProps) {
  return (
    <div data-foldder-studio-flush className="flex w-full min-w-0 flex-col gap-2">
      <StudioCanvasMeasuresControls
        width={width}
        height={height}
        background={background}
        onDimensionsChange={onDimensionsChange}
        onBackgroundChange={onBackgroundChange}
        variant="panel"
      />
      <button
        type="button"
        title="Abrir presets Web/Arte, fondo y medidas avanzadas"
        onClick={onOpenPresetModal}
        className="nodrag flex h-9 w-full items-center justify-center gap-2 bg-[#534AB7] px-2 text-[10px] font-black uppercase tracking-[0.1em] text-white transition hover:bg-[#6357c9]"
      >
        <LayoutGrid size={14} strokeWidth={2.5} className="shrink-0" aria-hidden />
        Presets y fondo…
      </button>
    </div>
  );
}
