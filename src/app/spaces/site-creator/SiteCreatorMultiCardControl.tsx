"use client";

import React from "react";
import { ChevronLeft, ChevronRight, Copy, Minus, Plus, Trash2 } from "lucide-react";
import { SC_VISUAL } from "./site-creator-visual-tokens";
import type { SiteMultiCardLayoutMode } from "./site-creator-types";
import { MULTICARD_COUNT_MAX, MULTICARD_COUNT_MIN } from "./site-creator-types";

export type SiteCreatorMultiCardControlModel = {
  nodeId: string;
  count: number;
  layoutMode: SiteMultiCardLayoutMode;
  activeCardIndex: number;
  canDuplicate: boolean;
  canRemoveActive: boolean;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  datasetBound?: boolean;
  hasException?: boolean;
};

export function SiteCreatorMultiCardControl({
  model,
  onCountChange,
  onLayoutMode,
  onDuplicateActive,
  onRemoveActive,
  onMoveActive,
}: {
  model: SiteCreatorMultiCardControlModel;
  onCountChange: (count: number) => void;
  onLayoutMode: (mode: SiteMultiCardLayoutMode) => void;
  onDuplicateActive: () => void;
  onRemoveActive: () => void;
  onMoveActive: (direction: -1 | 1) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1" data-testid="site-creator-multicard-control">
      <div className="flex items-center rounded border border-white/12 bg-white/5">
        <button
          type="button"
          aria-label="Quitar card"
          title={model.datasetBound ? "Filas del Dataset" : "Quitar card"}
          disabled={model.datasetBound || model.count <= MULTICARD_COUNT_MIN}
          className="flex h-6 w-6 items-center justify-center text-white/80 disabled:opacity-30"
          data-testid="site-creator-multicard-count-dec"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onCountChange(model.count - 1);
          }}
        >
          <Minus size={11} />
        </button>
        <span
          className="min-w-[1.25rem] text-center text-[10px] font-semibold"
          style={{ color: SC_VISUAL.chipFg }}
          data-testid="site-creator-multicard-count"
          title={model.datasetBound ? `${model.count} filas del Dataset` : undefined}
        >
          {model.count}
        </span>
        <button
          type="button"
          aria-label="Añadir card"
          title={model.datasetBound ? "Filas del Dataset" : "Añadir card"}
          disabled={model.datasetBound || model.count >= MULTICARD_COUNT_MAX}
          className="flex h-6 w-6 items-center justify-center text-white/80 disabled:opacity-30"
          data-testid="site-creator-multicard-count-inc"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onCountChange(model.count + 1);
          }}
        >
          <Plus size={11} />
        </button>
      </div>
      <div className="flex items-center gap-0.5">
        <LayoutPictogram
          mode="grid"
          label="Rejilla"
          active={model.layoutMode === "grid"}
          onPick={onLayoutMode}
        />
        <LayoutPictogram
          mode="scrollH"
          label="Carrusel horizontal"
          active={model.layoutMode === "scrollH"}
          onPick={onLayoutMode}
        />
        <LayoutPictogram
          mode="scrollV"
          label="Carrusel vertical"
          active={model.layoutMode === "scrollV"}
          onPick={onLayoutMode}
        />
      </div>
      <span
        className="min-w-[2.25rem] text-center text-[10px] font-semibold tabular-nums"
        style={{ color: SC_VISUAL.chipFg }}
        data-testid="site-creator-multicard-active-card"
        title={
          model.activeCardIndex === 0
            ? "Card 1 · molde"
            : `Card ${model.activeCardIndex + 1}`
        }
      >
        {model.activeCardIndex + 1}/{model.count}
      </span>
      {model.datasetBound ? (
        <span
          className="text-[8px] font-semibold uppercase tracking-wide"
          style={{ color: SC_VISUAL.chipMuted }}
          data-testid="site-creator-multicard-filas"
        >
          filas
        </span>
      ) : null}
      {model.hasException ? (
        <span
          className="rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide"
          style={{ background: SC_VISUAL.selection, color: "#101820" }}
          data-testid="site-creator-multicard-exception"
          title="Esta card tiene una excepción"
        >
          exc
        </span>
      ) : null}
      <IconBtn
        testId="site-creator-multicard-move-left"
        label="Mover card a la izquierda"
        disabled={!model.canMoveLeft}
        onClick={() => onMoveActive(-1)}
      >
        <ChevronLeft size={11} />
      </IconBtn>
      <IconBtn
        testId="site-creator-multicard-move-right"
        label="Mover card a la derecha"
        disabled={!model.canMoveRight}
        onClick={() => onMoveActive(1)}
      >
        <ChevronRight size={11} />
      </IconBtn>
      <IconBtn
        testId="site-creator-multicard-duplicate"
        label={model.datasetBound ? "Las filas las marca el Dataset" : "Duplicar card"}
        disabled={!model.canDuplicate}
        onClick={onDuplicateActive}
      >
        <Copy size={11} />
      </IconBtn>
      <IconBtn
        testId="site-creator-multicard-remove"
        label={
          model.datasetBound
            ? "Las filas las marca el Dataset"
            : model.activeCardIndex === 0
              ? "La primera card es el molde y no se puede eliminar"
              : "Eliminar card"
        }
        disabled={!model.canRemoveActive}
        onClick={onRemoveActive}
      >
        <Trash2 size={11} />
      </IconBtn>
    </div>
  );
}

function IconBtn({
  testId,
  label,
  disabled,
  onClick,
  children,
}: {
  testId: string;
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      data-testid={testId}
      className="flex h-6 w-6 items-center justify-center rounded text-white/80 disabled:opacity-30"
      style={{ border: "1px solid rgba(255,255,255,0.12)" }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) onClick();
      }}
    >
      {children}
    </button>
  );
}

function LayoutPictogram({
  mode,
  label,
  active,
  onPick,
}: {
  mode: SiteMultiCardLayoutMode;
  label: string;
  active: boolean;
  onPick: (mode: SiteMultiCardLayoutMode) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-testid={`site-creator-multicard-mode-${mode}`}
      aria-pressed={active}
      className="flex h-6 w-6 items-center justify-center rounded"
      style={{
        background: active ? "rgba(168,255,50,0.18)" : "transparent",
        border: active ? "1px solid rgba(168,255,50,0.35)" : "1px solid transparent",
        color: active ? SC_VISUAL.selection : "rgba(255,255,255,0.72)",
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onPick(mode);
      }}
    >
      <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden>
        {mode === "grid" ? (
          <>
            <rect x="0.5" y="0.5" width="4" height="5" rx="0.6" fill="currentColor" opacity="0.95" />
            <rect x="5.5" y="0.5" width="4" height="5" rx="0.6" fill="currentColor" opacity="0.7" />
            <rect x="10.5" y="0.5" width="3" height="5" rx="0.6" fill="currentColor" opacity="0.45" />
            <rect x="0.5" y="6.5" width="4" height="5" rx="0.6" fill="currentColor" opacity="0.7" />
            <rect x="5.5" y="6.5" width="4" height="5" rx="0.6" fill="currentColor" opacity="0.45" />
          </>
        ) : mode === "scrollH" ? (
          <>
            <rect x="0.5" y="1.5" width="7" height="9" rx="0.8" fill="currentColor" opacity="0.95" />
            <rect x="8.5" y="1.5" width="5" height="9" rx="0.8" fill="currentColor" opacity="0.4" />
          </>
        ) : (
          <>
            <rect x="2" y="0.5" width="10" height="6.5" rx="0.8" fill="currentColor" opacity="0.95" />
            <rect x="2" y="8" width="10" height="3.5" rx="0.8" fill="currentColor" opacity="0.4" />
          </>
        )}
      </svg>
    </button>
  );
}
