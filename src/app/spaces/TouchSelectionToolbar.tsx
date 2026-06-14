"use client";

import { BoxSelect, Hand, Trash2, X } from "lucide-react";
import type { TouchCanvasTool } from "./touch-canvas-tool";

type TouchSelectionToolbarProps = {
  tool: TouchCanvasTool;
  onToolChange: (tool: TouchCanvasTool) => void;
  selectedCount: number;
  onDelete: () => void;
  onClearSelection: () => void;
};

export function TouchSelectionToolbar({
  tool,
  onToolChange,
  selectedCount,
  onDelete,
  onClearSelection,
}: TouchSelectionToolbarProps) {
  const countLabel =
    selectedCount === 0
      ? "Ningún nodo"
      : selectedCount === 1
        ? "1 nodo"
        : `${selectedCount} nodos`;

  return (
    <div
      className="touch-selection-toolbar pointer-events-auto fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-[10020] flex -translate-x-1/2 items-center gap-0.5 border border-white/20 bg-[#0b0f14]/96 px-1 py-1"
      role="toolbar"
      aria-label="Herramientas del lienzo táctil"
    >
      <div className="flex items-center rounded-none border border-white/10" role="group" aria-label="Modo del lienzo">
        <button
          type="button"
          onClick={() => onToolChange("pan")}
          className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-none ${
            tool === "pan" ? "bg-white/15 text-white" : "text-white/55 active:bg-white/10"
          }`}
          aria-label="Mover lienzo"
          aria-pressed={tool === "pan"}
        >
          <Hand size={18} strokeWidth={2} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onToolChange("select")}
          className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-none border-l border-white/10 ${
            tool === "select" ? "bg-white/15 text-white" : "text-white/55 active:bg-white/10"
          }`}
          aria-label="Seleccionar nodos"
          aria-pressed={tool === "select"}
        >
          <BoxSelect size={18} strokeWidth={2} aria-hidden />
        </button>
      </div>

      <span className="hidden min-w-[4.5rem] truncate px-2 text-[11px] text-white/60 sm:inline">{countLabel}</span>

      {selectedCount > 0 ? (
        <>
          <button
            type="button"
            onClick={onDelete}
            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-none px-3 text-rose-200 active:bg-rose-950/40"
            aria-label={selectedCount === 1 ? "Eliminar nodo" : `Eliminar ${selectedCount} nodos`}
          >
            <Trash2 size={18} strokeWidth={2} aria-hidden />
            <span className="text-[11px] font-semibold uppercase tracking-wide">Eliminar</span>
          </button>
          <button
            type="button"
            onClick={onClearSelection}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-none text-white/60 active:bg-white/10"
            aria-label="Deseleccionar"
          >
            <X size={18} strokeWidth={2} aria-hidden />
          </button>
        </>
      ) : null}
    </div>
  );
}
