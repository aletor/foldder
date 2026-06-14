"use client";

import { Trash2, X } from "lucide-react";

type TouchSelectionToolbarProps = {
  selectedCount: number;
  onDelete: () => void;
  onClearSelection: () => void;
};

export function TouchSelectionToolbar({
  selectedCount,
  onDelete,
  onClearSelection,
}: TouchSelectionToolbarProps) {
  if (selectedCount <= 0) return null;

  const countLabel =
    selectedCount === 1 ? "1 nodo seleccionado" : `${selectedCount} nodos seleccionados`;

  return (
    <div
      className="touch-selection-toolbar pointer-events-auto fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-[10020] flex -translate-x-1/2 items-center gap-1 border border-white/20 bg-[#0b0f14]/96 px-1.5 py-1"
      role="toolbar"
      aria-label="Acciones de selección"
    >
      <span className="hidden min-w-0 truncate px-2 text-[11px] text-white/70 sm:inline">{countLabel}</span>
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
    </div>
  );
}
