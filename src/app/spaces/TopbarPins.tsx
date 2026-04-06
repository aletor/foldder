"use client";

import React, { useCallback } from "react";
import { NODE_REGISTRY } from "./nodeRegistry";
import { NodeIcon } from "./foldder-icons";

/** Iconos en la barra flotante (solo glyphs, sin texto) — ~30% más pequeños que el tamaño “grande” previo */
export const TOPBAR_PIN_ICON_SIZE = 28;

const PIN_ICON_COLOR = "#171717";

export const MAX_TOPBAR_PINS = 5;
export const TOPBAR_PINS_STORAGE_KEY = "foldder-topbar-pins";

/** Valores por defecto: Prompt, Nano, Video (Veo), Export */
export const DEFAULT_TOPBAR_PIN_TYPES: string[] = [
  "promptInput",
  "nanoBanana",
  "geminiVideo",
  "imageExport",
];

type TopbarPinsProps = {
  pinnedTypes: string[];
  onRemove: (nodeType: string) => void;
  onDropFromSidebar: (e: React.DragEvent) => void;
  /** Mismo contrato que la librería: arrastrar chip al lienzo */
  onLibraryDragStart?: (nodeType: string) => void;
  onLibraryDragEnd?: () => void;
  /** Doble clic: añadir nodo al lienzo en hueco y encuadrar */
  onPinDoubleClick?: (nodeType: string) => void;
  /** Dentro de una barra con borde padre: sin caja interior duplicada */
  embedded?: boolean;
  /** Segunda fila bajo el agente: ancho según contenido, centrado, estilo librería */
  fullWidthRow?: boolean;
};

/**
 * Barra inferior del canvas: el tooltip debe ir **encima** del chip (`bottom-full`).
 * Si va debajo (`top-full`), queda fuera del viewport o bajo el stacking del lienzo.
 * Muy pegado al botón: `mb-px`, z-index alto sobre nodos React Flow.
 */
function PinHoverCard({ label }: { label: string }) {
  return (
    <div
      className="pointer-events-none absolute bottom-full left-1/2 z-[10020] mb-px flex w-max max-w-[min(260px,78vw)] -translate-x-1/2 flex-col items-center opacity-0 translate-y-1 scale-[0.98] transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/pin:opacity-100 group-hover/pin:translate-y-0 group-hover/pin:scale-100"
      role="tooltip"
    >
      <div className="relative rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-center shadow-sm backdrop-blur-md">
        <p className="text-[13px] font-bold leading-snug tracking-tight text-black">
          {label}
        </p>
      </div>
      <div
        className="-mt-px h-1.5 w-1.5 rotate-45 border border-white/10 border-t-0 border-l-0 bg-white/10 shadow-sm backdrop-blur-md"
        aria-hidden
      />
    </div>
  );
}

type PinChipProps = {
  type: string;
  label: string;
  iconSize: number;
  chipClassName: string;
  onRemove: () => void;
  onLibraryDragStart?: (nodeType: string) => void;
  onLibraryDragEnd?: () => void;
  onPinDoubleClick?: (nodeType: string) => void;
};

function TopbarPinChip({
  type,
  label,
  iconSize,
  chipClassName,
  onRemove,
  onLibraryDragStart,
  onLibraryDragEnd,
  onPinDoubleClick,
}: PinChipProps) {
  return (
    <div className="relative shrink-0 group/pin pt-10 -mt-10 pb-0.5 overflow-visible">
      <div
        draggable
        role="button"
        tabIndex={0}
        aria-label={`${label}. Arrastra al lienzo. Doble clic para añadir al lienzo. Clic derecho para quitar del topbar.`}
        className={chipClassName}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onPinDoubleClick?.(type);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onRemove();
        }}
        onDragStart={(e) => {
          onLibraryDragStart?.(type);
          try {
            e.dataTransfer.setData("text/plain", type);
            e.dataTransfer.setData("application/reactflow", type);
            e.dataTransfer.effectAllowed = "copyMove";
          } catch {
            /* Safari */
          }
        }}
        onDragEnd={() => onLibraryDragEnd?.()}
      >
        <NodeIcon
          type={type}
          size={iconSize}
          colorOverride={PIN_ICON_COLOR}
          className="shrink-0"
        />
      </div>
      <PinHoverCard label={label} />
    </div>
  );
}

export function TopbarPins({
  pinnedTypes,
  onRemove,
  onDropFromSidebar,
  onLibraryDragStart,
  onLibraryDragEnd,
  onPinDoubleClick,
  embedded = false,
  fullWidthRow = false,
}: TopbarPinsProps) {
  const allowDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      e.dataTransfer.dropEffect = "copy";
    } catch {
      /* ignore */
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onDropFromSidebar(e);
    },
    [onDropFromSidebar]
  );

  const pinRowSidebarStyle = embedded && fullWidthRow;

  return (
    <div
      data-foldder-topbar-pins
      className={
        embedded && fullWidthRow
          ? "pointer-events-auto relative z-[1] mx-auto flex w-max max-w-full min-h-0 items-center gap-1.5 overflow-visible rounded-xl border border-white/5 bg-white/5 px-1.5 py-1 shadow-sm backdrop-blur-md"
          : embedded
            ? "pointer-events-auto relative z-[1] flex min-h-0 min-w-0 flex-[1.15] items-center justify-start px-1"
            : "pointer-events-auto relative z-[1] flex min-h-[36px] min-w-0 flex-1 items-center justify-center px-1.5"
      }
      onDragEnter={allowDrop}
      onDragOver={allowDrop}
      onDrop={handleDrop}
    >
      <div
        className={
          embedded && fullWidthRow
            ? "flex min-h-0 w-full min-w-0 flex-nowrap items-center gap-1.5"
            : embedded
              ? "flex min-h-[32px] w-full max-w-none flex-wrap items-center gap-1 px-0.5 py-0.5"
              : "flex min-h-[36px] w-full max-w-[min(420px,40vw)] flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-1 py-0.5 shadow-sm backdrop-blur-md"
        }
        title="Topbar — accesos directos (máx. 5). Arrastra o doble clic para añadir al lienzo. Clic derecho en un icono para quitarlo."
        onDragEnter={allowDrop}
        onDragOver={allowDrop}
        onDrop={handleDrop}
      >
        {pinnedTypes.length === 0 && (
          <span className="whitespace-nowrap px-1 text-[9px] font-bold uppercase tracking-widest text-white/40">
            Arrastra aquí desde la librería
          </span>
        )}
        {pinnedTypes.map((type) => {
          const meta = NODE_REGISTRY[type];
          if (!meta) return null;

          if (pinRowSidebarStyle) {
            return (
              <TopbarPinChip
                key={type}
                type={type}
                label={meta.label}
                iconSize={TOPBAR_PIN_ICON_SIZE}
                chipClassName="flex size-[2.8rem] cursor-grab select-none items-center justify-center rounded-2xl border border-white/25 !bg-white/20 transition-colors hover:!bg-white/30 active:cursor-grabbing active:scale-[0.98]"
                onRemove={() => onRemove(type)}
                onLibraryDragStart={onLibraryDragStart}
                onLibraryDragEnd={onLibraryDragEnd}
                onPinDoubleClick={onPinDoubleClick}
              />
            );
          }

          return (
            <TopbarPinChip
              key={type}
              type={type}
              label={meta.label}
              iconSize={22}
              chipClassName="flex size-[2.45rem] cursor-grab select-none items-center justify-center rounded-xl border border-white/10 bg-white/[0.08] active:cursor-grabbing"
              onRemove={() => onRemove(type)}
              onLibraryDragStart={onLibraryDragStart}
              onLibraryDragEnd={onLibraryDragEnd}
              onPinDoubleClick={onPinDoubleClick}
            />
          );
        })}
      </div>
    </div>
  );
}
