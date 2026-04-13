"use client";

import React from "react";
import { TOPBAR_GLYPH_BY_NODE_TYPE } from "./TopbarPinIcons";

/** Iconos en la barra inferior — glyph dedicado + pie de etiqueta (icono predominante). */
export const TOPBAR_PIN_ICON_SIZE = 32;

/**
 * Accesos fijos (no personalizables): Vector → Image → Video → VFX → Indesign.
 * Orden estable; no se persiste ni se admite drag-and-drop sobre la barra.
 */
export const TOPBAR_FIXED_PIN_TYPES = [
  "freehand",
  "nanoBanana",
  "geminiVideo",
  "vfxGenerator",
  "indesign",
] as const;

/** Tooltip (nombre completo) vs etiqueta corta bajo el icono. */
const TOPBAR_PIN_UI: Record<
  (typeof TOPBAR_FIXED_PIN_TYPES)[number],
  { title: string; shortLabel: string }
> = {
  freehand: { title: "Vector Studio", shortLabel: "Vector" },
  nanoBanana: { title: "Image Generator", shortLabel: "Image" },
  geminiVideo: { title: "Video Generator", shortLabel: "Video" },
  vfxGenerator: { title: "VFX Generator", shortLabel: "VFX" },
  indesign: { title: "Indesign Studio", shortLabel: "Layout" },
};

type TopbarPinsProps = {
  /** Doble clic: añadir nodo al lienzo en hueco y encuadrar */
  onPinDoubleClick?: (nodeType: string) => void;
  /** Arrastre desde la librería: sin tooltip hover encima de la barra */
  paletteDragActive?: boolean;
  /** Dentro de una barra con borde padre: sin caja interior duplicada */
  embedded?: boolean;
  /** Segunda fila bajo el agente: ancho según contenido, centrado, estilo librería */
  fullWidthRow?: boolean;
};

function PinHoverCard({ label }: { label: string }) {
  return (
    <div
      className="pointer-events-none absolute bottom-full left-1/2 z-[10020] mb-0.5 flex w-max max-w-[min(260px,78vw)] -translate-x-1/2 flex-col items-center opacity-0 translate-y-1 scale-[0.98] transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/pin:opacity-100 group-hover/pin:translate-y-0 group-hover/pin:scale-100"
      role="tooltip"
    >
      <div className="relative rounded-lg border border-white/10 bg-white/10 px-2.5 py-1 text-center shadow-sm backdrop-blur-md">
        <p className="text-[11px] font-bold leading-tight tracking-tight text-black">{label}</p>
      </div>
      <div
        className="-mt-px h-1.5 w-1.5 rotate-45 border border-white/10 border-t-0 border-l-0 bg-white/10 shadow-sm backdrop-blur-md"
        aria-hidden
      />
    </div>
  );
}

type PinChipProps = {
  type: (typeof TOPBAR_FIXED_PIN_TYPES)[number];
  title: string;
  shortLabel: string;
  iconSize: number;
  chipClassName: string;
  captionClassName: string;
  onPinDoubleClick?: (nodeType: string) => void;
  paletteDragActive?: boolean;
};

function TopbarPinChip({
  type,
  title,
  shortLabel,
  iconSize,
  chipClassName,
  captionClassName,
  onPinDoubleClick,
  paletteDragActive = false,
}: PinChipProps) {
  const Glyph = TOPBAR_GLYPH_BY_NODE_TYPE[type];

  return (
    <div className="relative shrink-0 group/pin pt-3 -mt-3 pb-0.5 overflow-visible">
      <button
        type="button"
        className={chipClassName}
        aria-label={`${title}. Doble clic para añadir al lienzo.`}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onPinDoubleClick?.(type);
        }}
      >
        <Glyph size={iconSize} className="shrink-0 text-white" />
        <span className={captionClassName}>{shortLabel}</span>
      </button>
      {!paletteDragActive && <PinHoverCard label={title} />}
    </div>
  );
}

export function TopbarPins({
  onPinDoubleClick,
  paletteDragActive = false,
  embedded = false,
  fullWidthRow = false,
}: TopbarPinsProps) {
  const pinRowSidebarStyle = embedded && fullWidthRow;

  const captionBase =
    "mt-0.5 max-w-[4rem] text-center text-white font-medium leading-none tracking-wide uppercase";

  const captionEmbedded = captionBase + " text-[6px] sm:text-[6.5px]";
  const captionDefault = captionBase + " text-[6px] sm:text-[6.5px]";

  const chipEmbedded =
    "flex min-h-[3.85rem] min-w-[3.85rem] max-w-[4.25rem] cursor-default flex-col items-center justify-center gap-0.5 rounded-2xl border border-white/30 !bg-white/15 px-1 py-1.5 transition-colors hover:!bg-white/25 select-none";
  const chipDefault =
    "flex min-h-[3.75rem] min-w-[3.75rem] max-w-[4.1rem] cursor-default flex-col items-center justify-center gap-0.5 rounded-xl border border-white/20 bg-white/[0.12] px-1 py-1.5 hover:bg-white/[0.2] select-none";

  return (
    <div
      data-foldder-topbar-pins
      className={
        embedded && fullWidthRow
          ? "pointer-events-auto relative z-[1] mx-auto flex w-max max-w-full min-h-0 items-center gap-1.5 overflow-visible rounded-xl border border-white/25 bg-white/[0.08] px-2 py-1.5 shadow-sm backdrop-blur-xl"
          : embedded
            ? "pointer-events-auto relative z-[1] flex min-h-0 min-w-0 flex-[1.15] items-center justify-start px-1"
            : "pointer-events-auto relative z-[1] flex min-h-[36px] min-w-0 flex-1 items-center justify-center px-1.5"
      }
    >
      <div
        className={
          embedded && fullWidthRow
            ? "flex min-h-0 w-full min-w-0 flex-nowrap items-center justify-center gap-2 sm:gap-2.5"
            : embedded
              ? "flex min-h-[32px] w-full max-w-none flex-wrap items-center gap-1 px-0.5 py-0.5"
              : "flex min-h-[36px] w-full max-w-[min(520px,92vw)] flex-wrap items-center justify-center gap-1.5 rounded-xl border border-white/25 bg-white/[0.08] px-2 py-1 shadow-sm backdrop-blur-xl"
        }
        role="toolbar"
        aria-label="Accesos directos: Vector, Image, Video, VFX, Layout. Doble clic para añadir al lienzo."
      >
        {TOPBAR_FIXED_PIN_TYPES.map((type) => {
          const ui = TOPBAR_PIN_UI[type];

          if (pinRowSidebarStyle) {
            return (
              <TopbarPinChip
                key={type}
                type={type}
                title={ui.title}
                shortLabel={ui.shortLabel}
                iconSize={TOPBAR_PIN_ICON_SIZE}
                chipClassName={chipEmbedded}
                captionClassName={captionEmbedded}
                onPinDoubleClick={onPinDoubleClick}
                paletteDragActive={paletteDragActive}
              />
            );
          }

          return (
            <TopbarPinChip
              key={type}
              type={type}
              title={ui.title}
              shortLabel={ui.shortLabel}
              iconSize={28}
              chipClassName={chipDefault}
              captionClassName={captionDefault}
              onPinDoubleClick={onPinDoubleClick}
              paletteDragActive={paletteDragActive}
            />
          );
        })}
      </div>
    </div>
  );
}
