"use client";

import React from "react";
import {
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignHorizontalSpaceBetween,
  AlignVerticalSpaceBetween,
  Download,
  FileDown,
  FileUp,
  Loader2,
  Redo2,
  Undo2,
  X,
} from "lucide-react";

export type FreehandStudioHeaderProps = {
  flushAttr: string | undefined;
  flushChrome: boolean;
  flushCtaClass: string;
  studioHeaderNodeGlyph: React.ReactNode;
  studioHeaderTitle: string;
  studioHeaderSubtitle: string;
  studioHeaderAccessory?: React.ReactNode;
  selectedCount: number;
  alignObjects: (mode: string) => void;
  viewportZoom: number;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onUndo: () => void;
  onRedo: () => void;
  designerMode?: boolean;
  designerDeDocument?: {
    busy?: boolean;
    onImport: () => void;
    onExport: () => void | Promise<void>;
  } | null;
  designerAutoOptimizeSwitch?: {
    enabled: boolean;
    onChange: (enabled: boolean) => void;
  } | null;
  onOpenExport: () => void;
  onClose: () => void;
};

export function FreehandStudioHeader({
  flushAttr,
  flushChrome,
  flushCtaClass,
  studioHeaderNodeGlyph,
  studioHeaderTitle,
  studioHeaderSubtitle,
  studioHeaderAccessory,
  selectedCount,
  alignObjects,
  viewportZoom,
  onZoomOut,
  onZoomIn,
  onUndo,
  onRedo,
  designerMode,
  designerDeDocument,
  designerAutoOptimizeSwitch,
  onOpenExport,
  onClose,
}: FreehandStudioHeaderProps) {
  return (
      <header
        data-foldder-studio-flush={flushAttr}
        className={`relative z-30 flex shrink-0 items-center border-b border-white/[0.08] min-w-0 ${
          flushChrome ? "h-10 gap-2 bg-[#0b0f14] px-2" : "h-14 gap-3 bg-[#12151a] px-3"
        }`}
      >
        <div className="min-w-0 shrink flex items-center gap-2">
          {studioHeaderNodeGlyph ? (
            <span
              className={`inline-flex shrink-0 items-center justify-center border border-white/10 bg-black/45 ${
                flushChrome ? "h-7 w-7" : "h-7 w-7 rounded-[8px]"
              }`}
            >
              {studioHeaderNodeGlyph}
            </span>
          ) : null}
          <div className="min-w-0">
            <div
              className={`truncate text-white ${
                flushChrome
                  ? "text-[11px] font-black uppercase tracking-[0.1em]"
                  : "text-[13px] font-semibold tracking-tight"
              }`}
            >
              {studioHeaderTitle}
            </div>
            {flushChrome ? null : (
              <div className="truncate text-[10px] text-zinc-500">{studioHeaderSubtitle}</div>
            )}
          </div>
        </div>
        {studioHeaderAccessory ? (
          <div className="flex min-w-0 shrink items-center gap-2">{studioHeaderAccessory}</div>
        ) : null}
        <div className={`ml-auto flex min-w-0 flex-wrap items-center justify-end ${flushChrome ? "gap-1" : "gap-2"}`}>
        <div
          className="flex min-w-0 flex-wrap items-center gap-px rounded-lg border border-white/[0.08] bg-[#0b0d10] px-1 py-0.5"
          title="Alinear (selecciona 2+ objetos)"
        >
          <button
            type="button"
            title="Horizontal: izquierda"
            disabled={selectedCount < 2}
            onClick={() => alignObjects("left")}
            className="rounded p-1 text-zinc-300 transition hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            <AlignHorizontalJustifyStart size={14} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            title="Horizontal: centrar"
            disabled={selectedCount < 2}
            onClick={() => alignObjects("centerH")}
            className="rounded p-1 text-zinc-300 transition hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            <AlignHorizontalJustifyCenter size={14} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            title="Horizontal: derecha"
            disabled={selectedCount < 2}
            onClick={() => alignObjects("right")}
            className="rounded p-1 text-zinc-300 transition hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            <AlignHorizontalJustifyEnd size={14} strokeWidth={1.75} />
          </button>
          <span className="mx-0.5 h-4 w-px shrink-0 bg-white/15" aria-hidden />
          <button
            type="button"
            title="Vertical: arriba"
            disabled={selectedCount < 2}
            onClick={() => alignObjects("top")}
            className="rounded p-1 text-zinc-300 transition hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            <AlignVerticalJustifyStart size={14} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            title="Vertical: centrar"
            disabled={selectedCount < 2}
            onClick={() => alignObjects("centerV")}
            className="rounded p-1 text-zinc-300 transition hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            <AlignVerticalJustifyCenter size={14} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            title="Vertical: abajo"
            disabled={selectedCount < 2}
            onClick={() => alignObjects("bottom")}
            className="rounded p-1 text-zinc-300 transition hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            <AlignVerticalJustifyEnd size={14} strokeWidth={1.75} />
          </button>
          <span className="mx-0.5 h-4 w-px shrink-0 bg-white/15" aria-hidden />
          <button
            type="button"
            title="Distribuir horizontalmente"
            disabled={selectedCount < 2}
            onClick={() => alignObjects("distH")}
            className="rounded p-1 text-zinc-300 transition hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            <AlignHorizontalSpaceBetween size={14} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            title="Distribuir verticalmente"
            disabled={selectedCount < 2}
            onClick={() => alignObjects("distV")}
            className="rounded p-1 text-zinc-300 transition hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            <AlignVerticalSpaceBetween size={14} strokeWidth={1.75} />
          </button>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-[#0b0d10] px-1 py-0.5 shrink-0">
          <button
            type="button"
            className="rounded px-2 py-1 text-[12px] text-zinc-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
            onClick={() =>
              onZoomOut()
            }
            title="Zoom out"
          >
            −
          </button>
          <span className="min-w-[3.25rem] text-center font-mono text-[11px] tabular-nums text-zinc-300">
            {Math.round(viewportZoom * 100)}%
          </span>
          <button
            type="button"
            className="rounded px-2 py-1 text-[12px] text-zinc-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
            onClick={() =>
              onZoomIn()
            }
            title="Zoom in"
          >
            +
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onUndo}
            className="rounded-lg p-2 text-zinc-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
            title="Undo (⌘Z)"
          >
            <Undo2 size={18} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={onRedo}
            className="rounded-lg p-2 text-zinc-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
            title="Redo (⇧⌘Z)"
          >
            <Redo2 size={18} strokeWidth={1.5} />
          </button>
        </div>
        {designerMode && designerDeDocument && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              disabled={!!designerDeDocument.busy}
              onClick={() => designerDeDocument.onImport()}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.12] bg-[#0b0d10] px-2.5 py-2 text-[11px] font-semibold text-zinc-200 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-45"
              title="Importar documento .de (diseño + imágenes embebidas; referencias al Dataset, no el Dataset en sí)"
            >
              <FileUp size={15} strokeWidth={1.75} />
              Importar .de
            </button>
            <button
              type="button"
              disabled={!!designerDeDocument.busy}
              onClick={() => void designerDeDocument.onExport()}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-violet-500/35 bg-violet-950/40 px-2.5 py-2 text-[11px] font-semibold text-violet-100 transition hover:bg-violet-900/50 disabled:opacity-45"
              title="Exportar documento .de (ZIP: diseño, imágenes y campos dinámicos; no incluye el Dataset conectado)"
            >
              {designerDeDocument.busy ? (
                <Loader2 size={15} className="animate-spin" strokeWidth={1.75} />
              ) : (
                <FileDown size={15} strokeWidth={1.75} />
              )}
              Exportar .de
            </button>
          </div>
        )}
        {designerMode && designerAutoOptimizeSwitch && (
          <div className="flex min-w-0 max-w-full shrink-0 items-center gap-3 rounded-md border border-white/[0.12] bg-[#0b0d10] px-3.5 py-2">
            <span className="min-w-0 select-none text-[11px] font-medium leading-snug text-zinc-200">
              Activar auto-optimización
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={designerAutoOptimizeSwitch.enabled}
              title={
                designerAutoOptimizeSwitch.enabled
                  ? "Desactivar auto-optimización"
                  : "Activar auto-optimización"
              }
              onClick={() => designerAutoOptimizeSwitch.onChange(!designerAutoOptimizeSwitch.enabled)}
              className={`relative box-border h-[22px] w-[40px] shrink-0 overflow-hidden rounded-md transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500/80 ${
                designerAutoOptimizeSwitch.enabled ? "bg-violet-600" : "bg-zinc-600"
              }`}
            >
              <span
                className={`pointer-events-none absolute top-1/2 h-[18px] w-[18px] -translate-y-1/2 rounded-sm bg-white shadow-sm ring-1 ring-black/10 transition-[left] duration-200 ease-out ${
                  designerAutoOptimizeSwitch.enabled ? "left-[20px]" : "left-[2px]"
                }`}
              />
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={onOpenExport}
          className={`flex shrink-0 items-center gap-2 transition-colors duration-150 ${
            flushChrome
              ? `h-8 px-3.5 text-[10px] font-black uppercase tracking-[0.1em] ${flushCtaClass}`
              : "rounded-lg bg-sky-600 px-3 py-2 text-[12px] font-semibold text-white shadow-lg shadow-sky-900/25 hover:bg-sky-500"
          }`}
        >
          <Download size={16} strokeWidth={1.5} />
          Export
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onClose}
          className="relative z-10 shrink-0 rounded-lg p-2 text-zinc-400 transition-colors duration-150 hover:bg-white/[0.08] hover:text-white"
          title="Cerrar — guarda la vista previa en el nodo"
        >
          <X size={18} strokeWidth={1.5} />
        </button>
        </div>
      </header>
  );
}
