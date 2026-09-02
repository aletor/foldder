"use client";

import React, { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PageRect } from "./site-creator-coordinate-space";
import { SC_VISUAL } from "./site-creator-visual-tokens";
import type { SiteCreatorPrimaryAction } from "./site-creator-contextual-actions";
import type { SiteCreatorSelectionUnit } from "./site-creator-display-labels";
import { resolveFloatingEditorPlacement } from "./site-creator-floating-placement";

export type MicrobarSegment = {
  unit: SiteCreatorSelectionUnit;
  label: string;
  current: boolean;
};

export type SiteCreatorMicrobarModel = {
  bounds: PageRect;
  segments: MicrobarSegment[];
  actions: SiteCreatorPrimaryAction[];
  /** Solo etiqueta (hover), sin acciones. */
  hoverOnly?: boolean;
  summary?: string | null;
  avoidBounds?: PageRect[];
  /** Slot 6B.2 — control de adaptación (ReactNode). */
  adaptationSlot?: React.ReactNode;
  /** Slot MultiCard — stepper de N y modos de layout. */
  multiCardSlot?: React.ReactNode;
};

/** Acciones estructurales ocultas en el microbar (quedan solo en otros menús si aplica). */
const MICROBAR_HIDDEN_ACTION_IDS = new Set<SiteCreatorPrimaryAction["id"]>([
  "removeFromContainer",
]);

const MICROBAR_HOVER_H = 22;
const MICROBAR_H = 26;
const MICROBAR_ACTION_CAP = 3;

export function visibleMicrobarActions(
  actions: SiteCreatorPrimaryAction[],
  hoverOnly?: boolean,
): SiteCreatorPrimaryAction[] {
  if (hoverOnly) return [];
  return actions.filter((action) => !MICROBAR_HIDDEN_ACTION_IDS.has(action.id)).slice(0, MICROBAR_ACTION_CAP);
}

/** Ruta corta: últimos dos tramos si hay más; el title lleva el path completo. */
export function visibleMicrobarSegments(segments: MicrobarSegment[]): {
  truncated: boolean;
  segments: MicrobarSegment[];
} {
  if (segments.length <= 2) return { truncated: false, segments };
  return { truncated: true, segments: segments.slice(-2) };
}

export type FloatingChromeGeometry = {
  /** Stage / frame en coords cliente. */
  pageFrameRect: PageRect;
  /** Viewport del canvas Studio en coords cliente. */
  studioViewportRect: PageRect;
  /** Selección en coords cliente. */
  selectionClientRect: PageRect;
  relevantContentClientRects?: PageRect[];
};

export interface SiteCreatorObjectMicrobarProps {
  scale: number;
  stageWidth: number;
  stageHeight: number;
  model: SiteCreatorMicrobarModel | null;
  floatingGeometry?: FloatingChromeGeometry | null;
  portalHost?: HTMLElement | null;
  onNavigate?: (unit: SiteCreatorSelectionUnit) => void;
  onAction?: (action: SiteCreatorPrimaryAction) => void;
}

function samePos(
  a: { left: number; top: number } | null,
  left: number,
  top: number,
): boolean {
  return Boolean(a && Math.abs(a.left - left) < 0.5 && Math.abs(a.top - top) < 0.5);
}

export function SiteCreatorObjectMicrobar({
  scale,
  stageWidth,
  stageHeight,
  model,
  floatingGeometry,
  portalHost,
  onNavigate: _onNavigate,
  onAction,
}: SiteCreatorObjectMicrobarProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  void scale;
  void stageWidth;
  void stageHeight;
  void _onNavigate;

  useLayoutEffect(() => {
    if (!model || !floatingGeometry) {
      setPos((prev) => (prev == null ? prev : null));
      return;
    }
    const w = ref.current?.offsetWidth ?? (model.hoverOnly ? 120 : 220);
    const h = model.hoverOnly ? MICROBAR_HOVER_H : MICROBAR_H;
    const placed = resolveFloatingEditorPlacement({
      anchorRect: floatingGeometry.selectionClientRect,
      floatingSize: { width: w, height: h },
      selectionRect: floatingGeometry.selectionClientRect,
      relevantContentRects: floatingGeometry.relevantContentClientRects,
      pageFrameRect: floatingGeometry.pageFrameRect,
      studioViewportRect: floatingGeometry.studioViewportRect,
    });
    setPos((prev) =>
      samePos(prev, placed.left, placed.top) ? prev : { left: placed.left, top: placed.top },
    );
  }, [floatingGeometry, model]);

  if (!model) return null;

  const actions = visibleMicrobarActions(model.actions, model.hoverOnly);
  // Sin ruta: solo etiqueta en hover; en selección bastan las acciones / slots.
  const showSummary = Boolean(model.summary) && Boolean(model.hoverOnly);
  const hasChrome =
    showSummary ||
    Boolean(model.adaptationSlot) ||
    Boolean(model.multiCardSlot) ||
    actions.length > 0;
  if (!hasChrome) return null;

  const title = model.summary ?? "";

  const barWidth = ref.current?.offsetWidth ?? (model.hoverOnly ? 120 : 220);
  const barHeight = model.hoverOnly ? MICROBAR_HOVER_H : MICROBAR_H;
  const microbarClientRect: PageRect | null = pos
    ? { x: pos.left, y: pos.top, width: barWidth, height: barHeight }
    : null;

  const adaptationSlot =
    model.adaptationSlot && React.isValidElement(model.adaptationSlot)
      ? React.cloneElement(
          model.adaptationSlot as React.ReactElement<{
            floatingGeometry?: FloatingChromeGeometry | null;
            microbarClientRect?: PageRect | null;
            portalHost?: HTMLElement | null;
          }>,
          {
            floatingGeometry: floatingGeometry ?? null,
            microbarClientRect,
            portalHost: portalHost ?? null,
          },
        )
      : model.adaptationSlot;

  const barInner = (
    <>
      {showSummary ? (
        <span className="min-w-0 truncate font-medium" title={model.summary ?? undefined}>
          {model.summary}
        </span>
      ) : null}

      {adaptationSlot && !model.hoverOnly ? (
        <>
          {showSummary ? <span className="mx-0.5 h-3 w-px shrink-0 bg-white/12" aria-hidden /> : null}
          {adaptationSlot}
        </>
      ) : null}

      {model.multiCardSlot && !model.hoverOnly ? (
        <>
          {showSummary || adaptationSlot ? (
            <span className="mx-0.5 h-3 w-px shrink-0 bg-white/12" aria-hidden />
          ) : null}
          {model.multiCardSlot}
        </>
      ) : null}

      {actions.length > 0 ? (
        <>
          {showSummary || adaptationSlot || model.multiCardSlot ? (
            <span className="mx-0.5 h-3 w-px shrink-0 bg-white/12" aria-hidden />
          ) : null}
          <div className="flex shrink-0 items-center gap-0.5">
            {actions.map((action) => {
              const primary = action.id === "createButton" || action.id === "addToContainer";
              return (
                <button
                  key={action.id + (action.targetContainerId ?? "")}
                  type="button"
                  data-testid={`site-creator-micro-${action.id}`}
                  aria-label={action.label}
                  title={action.label}
                  className="h-5 max-w-[120px] truncate rounded px-1.5 text-[10px] font-medium outline-none focus-visible:ring-1 focus-visible:ring-white/40"
                  style={
                    primary
                      ? {
                          background: "rgba(168,255,50,0.14)",
                          color: SC_VISUAL.selection,
                          border: "1px solid rgba(168,255,50,0.28)",
                        }
                      : {
                          background: "transparent",
                          color: "rgba(255,255,255,0.78)",
                          border: "1px solid transparent",
                        }
                  }
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onAction?.(action);
                  }}
                >
                  {action.label}
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </>
  );

  const host = portalHost ?? (typeof document !== "undefined" ? document.body : null);
  if (!host) return null;

  // Sin geometría flotante (tests / fallback): anclar en flujo relativo sin portal.
  if (!floatingGeometry) {
    return (
      <div
        ref={ref}
        data-site-creator-microbar
        data-testid="site-creator-microbar"
        data-hover-only={model.hoverOnly ? "true" : "false"}
        title={title}
        className="pointer-events-auto absolute z-[5] flex max-w-[min(320px,92%)] items-center gap-1 rounded border px-1.5 shadow-md"
        style={{
          left: 8,
          top: 8,
          height: model.hoverOnly ? MICROBAR_HOVER_H : MICROBAR_H,
          background: SC_VISUAL.chipBg,
          borderColor: SC_VISUAL.chipBorder,
          color: SC_VISUAL.chipFg,
          fontSize: 10,
        }}
      >
        {barInner}
      </div>
    );
  }

  return createPortal(
    <div
      ref={ref}
      data-site-creator-microbar
      data-testid="site-creator-microbar"
      data-site-creator-floating-ui="true"
      data-hover-only={model.hoverOnly ? "true" : "false"}
      title={title}
      className="site-creator-floating-panel pointer-events-auto fixed z-[100055] flex max-w-[min(320px,92vw)] items-center gap-1 rounded border px-1.5 shadow-md"
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        height: model.hoverOnly ? MICROBAR_HOVER_H : MICROBAR_H,
        background: SC_VISUAL.chipBg,
        borderColor: SC_VISUAL.chipBorder,
        color: SC_VISUAL.chipFg,
        fontSize: 10,
        transition: "opacity 100ms linear",
        opacity: pos ? 1 : 0,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {barInner}
    </div>,
    host,
  );
}
