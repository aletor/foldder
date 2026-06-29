"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import {
  PhotoToneAdjustmentsPanel,
  type PhotoImageAdjustmentsValues,
} from "./PhotoImageAdjustmentsModal";
import { LayerStylesModal } from "./LayerStylesModal";
import { isLayerOverlaysSupported, type LayerEffects } from "./layer-effects-types";
import { STUDIO_LAYER_MODAL_Z, studioOverlayPointerGuards } from "./studio-modal-shell";

export type EffectLayerTab = "tone" | "look" | "overlays";
export type EffectLayerApplyMode =
  | "embedded"
  | "wholeStack"
  | "belowSelection"
  | "selectedFolder"
  | "selectedLayer";
/** @deprecated Usar EffectLayerApplyMode */
export type EffectLayerApplyTarget = "selectedLayer" | "adjustmentLayer";

const MAIN_TABS: { id: EffectLayerTab; label: string }[] = [
  { id: "tone", label: "Tono" },
  { id: "look", label: "Look" },
  { id: "overlays", label: "Overlays" },
];

/** Altura fija del cuerpo: los 3 tabs comparten el mismo viewport. */
const BODY_H_PX = 248;
const PANEL_W_PX = 352;

const APPLY_MODE_OPTIONS: { value: EffectLayerApplyMode; label: string }[] = [
  { value: "embedded", label: "En esta capa" },
  { value: "selectedLayer", label: "Capa fx · solo esta capa" },
  { value: "selectedFolder", label: "Capa fx · carpeta seleccionada" },
  { value: "wholeStack", label: "Capa fx · composición inferior" },
  { value: "belowSelection", label: "Capa fx · bajo selección" },
];

export function EffectLayerModal({
  open,
  dock = false,
  tab,
  onTabChange,
  title = "Capa de efecto",
  hasSelection,
  targetType,
  targetInsideFolder,
  histogram,
  tone,
  onToneChange,
  onToneScrubEnd,
  stylesDraft,
  onStylesDraftChange,
  showApplyTargetChoice,
  applyMode,
  onApplyModeChange,
  onReset,
  onCancel,
  onOk,
}: {
  open: boolean;
  /** Anclado dentro del lienzo (esquina superior derecha), sin portal ni backdrop. */
  dock?: boolean;
  tab: EffectLayerTab;
  onTabChange: (tab: EffectLayerTab) => void;
  title?: string;
  hasSelection?: boolean;
  targetType?: string;
  /** Capa seleccionada está dentro de una carpeta (p. ej. un clip «pegar dentro» en carpeta). */
  targetInsideFolder?: boolean;
  histogram: number[];
  tone: PhotoImageAdjustmentsValues;
  onToneChange: (next: PhotoImageAdjustmentsValues, recordHistory: boolean) => void;
  onToneScrubEnd: () => void;
  stylesDraft: LayerEffects;
  onStylesDraftChange: (next: LayerEffects) => void;
  showApplyTargetChoice?: boolean;
  applyMode?: EffectLayerApplyMode;
  onApplyModeChange?: (mode: EffectLayerApplyMode) => void;
  onReset: () => void;
  onCancel: () => void;
  onOk: () => void;
}) {
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragSessionRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const overlaysSupported = isLayerOverlaysSupported(targetType);

  useEffect(() => {
    if (!overlaysSupported && tab === "overlays") onTabChange("look");
  }, [overlaysSupported, tab, onTabChange]);

  if (!open || (!dock && typeof document === "undefined")) return null;

  const visibleTabs = MAIN_TABS.filter((t) => t.id !== "overlays" || overlaysSupported);
  const stylesFxSection: "look" | "overlays" =
    tab === "overlays" && overlaysSupported ? "overlays" : "look";

  const onHeaderPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragSessionRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: dragOffset.x,
      origY: dragOffset.y,
    };
  };
  const onHeaderPointerMove = (e: React.PointerEvent) => {
    const s = dragSessionRef.current;
    if (!s || e.pointerId !== s.pointerId) return;
    setDragOffset({
      x: s.origX + (e.clientX - s.startX),
      y: s.origY + (e.clientY - s.startY),
    });
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

  const panel = (
    <div
      data-foldder-effect-layer-panel
      role="dialog"
      aria-modal={dock ? "false" : "true"}
      aria-labelledby="fh-effect-layer-title"
      className={`flex flex-col overflow-hidden border border-white/15 bg-[#0b0f14]/95 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-sm ${
        dock ? "pointer-events-auto absolute top-2 right-2 z-[85]" : "pointer-events-auto"
      }`}
      style={{
        width: PANEL_W_PX,
        transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
      }}
      {...studioOverlayPointerGuards}
    >
      <header className="flex h-8 shrink-0 items-stretch border-b border-white/10 bg-white/[0.04]">
        <div
          className="flex min-w-0 cursor-grab touch-none select-none items-center gap-1.5 px-2 active:cursor-grabbing"
          onPointerDown={onHeaderPointerDown}
          onPointerMove={onHeaderPointerMove}
          onPointerUp={onHeaderPointerUp}
          onPointerCancel={onHeaderPointerUp}
        >
          <span className="h-1.5 w-1.5 shrink-0 bg-[#71449f]" aria-hidden />
          <h2
            id="fh-effect-layer-title"
            className="truncate text-[9px] font-black uppercase tracking-[0.1em] text-white"
          >
            {title}
          </h2>
          {hasSelection ? (
            <span className="shrink-0 bg-[#71449f]/30 px-1 py-px text-[7px] font-black uppercase tracking-[0.08em] text-[#d4b8f0]">
              Sel.
            </span>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-1 items-stretch" role="tablist" aria-label="Secciones">
          {visibleTabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`min-w-0 flex-1 border-l border-white/10 px-1 text-[8px] font-black uppercase tracking-[0.08em] transition ${
                  active
                    ? "bg-[#71449f]/30 text-white"
                    : "text-white/40 hover:bg-white/[0.04] hover:text-white/75"
                }`}
                onClick={() => onTabChange(t.id)}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="flex w-8 shrink-0 items-center justify-center border-l border-white/10 text-white/45 transition hover:bg-white/[0.06] hover:text-white"
          aria-label="Cerrar"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onCancel}
        >
          <X size={13} strokeWidth={2} />
        </button>
      </header>

      <div className="flex shrink-0 flex-col overflow-hidden" style={{ height: BODY_H_PX }}>
        {tab === "tone" ? (
          <PhotoToneAdjustmentsPanel
            compact
            histogram={histogram}
            values={tone}
            onChange={onToneChange}
            onScrubEnd={onToneScrubEnd}
          />
        ) : (
          <LayerStylesModal
            embedded
            compact
            open
            fxSection={stylesFxSection}
            hideApplyTargetChoice
            targetType={targetType}
            draft={stylesDraft}
            onDraftChange={onStylesDraftChange}
            onOk={onOk}
            onCancel={onCancel}
            onReset={onReset}
          />
        )}
      </div>

      {showApplyTargetChoice ? (
        <div className="flex h-7 shrink-0 items-center gap-2 border-t border-white/10 bg-white/[0.02] px-2">
          <span className="shrink-0 text-[7px] font-black uppercase tracking-[0.08em] text-white/35">
            Aplicar
          </span>
          <select
            value={applyMode ?? "embedded"}
            onChange={(e) => onApplyModeChange?.(e.target.value as EffectLayerApplyMode)}
            className="min-w-0 flex-1 truncate rounded-none border border-white/10 bg-black/40 px-1.5 py-0.5 text-[10px] text-zinc-100 outline-none focus:border-[#71449f]/60"
          >
            {APPLY_MODE_OPTIONS.filter((o) => {
              if (o.value === "selectedFolder") return targetType === "groupContainer";
              const scopedTarget =
                !!targetInsideFolder || targetType === "clippingContainer";
              if (o.value === "selectedLayer") return scopedTarget;
              if (scopedTarget && (o.value === "wholeStack" || o.value === "belowSelection")) {
                return false;
              }
              return true;
            }).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <footer className="flex h-8 shrink-0 items-stretch justify-end divide-x divide-white/10 border-t border-white/10 bg-white/[0.04]">
        <button
          type="button"
          className="px-3 text-[8px] font-black uppercase tracking-[0.08em] text-white/45 transition hover:bg-white/[0.06] hover:text-white"
          onClick={onReset}
        >
          Reset
        </button>
        <button
          type="button"
          className="px-3 text-[8px] font-black uppercase tracking-[0.08em] text-white/45 transition hover:bg-white/[0.06] hover:text-white"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="bg-[#71449f] px-5 text-[8px] font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#8055b0]"
          onClick={onOk}
        >
          OK
        </button>
      </footer>
    </div>
  );

  if (dock) return panel;

  return createPortal(
    <div className="pointer-events-none fixed inset-0" style={{ zIndex: STUDIO_LAYER_MODAL_Z + 10 }}>
      <div
        className="pointer-events-auto fixed top-12 right-3"
        style={{ width: PANEL_W_PX }}
      >
        {panel}
      </div>
    </div>,
    document.body,
  );
}
