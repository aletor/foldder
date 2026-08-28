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
  /** Slot 6C — ajustes contextuales de la vista. */
  refineSlot?: React.ReactNode;
  /** Slot MultiCard — stepper de N y modos de layout. */
  multiCardSlot?: React.ReactNode;
};

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
  onNavigate,
  onAction,
}: SiteCreatorObjectMicrobarProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  void scale;
  void stageWidth;
  void stageHeight;

  useLayoutEffect(() => {
    if (!model || !floatingGeometry) {
      setPos((prev) => (prev == null ? prev : null));
      return;
    }
    const w = ref.current?.offsetWidth ?? (model.hoverOnly ? 140 : 280);
    const h = model.hoverOnly ? 24 : 32;
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
  if (
    model.segments.length === 0 &&
    !model.summary &&
    !model.adaptationSlot &&
    !model.refineSlot &&
    !model.multiCardSlot &&
    (model.hoverOnly || model.actions.length === 0)
  ) {
    return null;
  }

  const title =
    model.segments.length > 0
      ? model.segments.map((s) => s.label).join(" › ")
      : model.summary ?? "";
  const actions = model.hoverOnly ? [] : model.actions.slice(0, 3);

  const barWidth = ref.current?.offsetWidth ?? (model.hoverOnly ? 140 : 280);
  const barHeight = model.hoverOnly ? 24 : 32;
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

  const refineSlot =
    model.refineSlot && React.isValidElement(model.refineSlot)
      ? React.cloneElement(
          model.refineSlot as React.ReactElement<{
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
      : model.refineSlot;

  const barInner = (
    <>
      <div className="flex min-w-0 items-center gap-1">
        {model.segments.map((seg, i) => (
          <React.Fragment key={`${seg.label}-${i}`}>
            {i > 0 ? (
              <span className="shrink-0" style={{ color: SC_VISUAL.chipMuted }}>
                ›
              </span>
            ) : null}
            {seg.current || !onNavigate ? (
              <span
                className="min-w-0 truncate font-semibold"
                style={{ color: seg.current ? SC_VISUAL.chipFg : SC_VISUAL.chipMuted }}
                title={seg.label}
              >
                {seg.label}
              </span>
            ) : (
              <button
                type="button"
                className="min-w-0 truncate font-semibold hover:underline"
                style={{ color: SC_VISUAL.chipMuted }}
                title={seg.label}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onNavigate(seg.unit);
                }}
              >
                {seg.label}
              </button>
            )}
          </React.Fragment>
        ))}
        {model.segments.length === 0 && model.summary ? (
          <span className="min-w-0 truncate font-semibold" title={model.summary}>
            {model.summary}
          </span>
        ) : null}
      </div>

      {adaptationSlot && !model.hoverOnly ? (
        <>
          <span className="mx-0.5 h-4 w-px shrink-0 bg-white/15" aria-hidden />
          {adaptationSlot}
        </>
      ) : null}

      {refineSlot && !model.hoverOnly ? (
        <>
          <span className="mx-0.5 h-4 w-px shrink-0 bg-white/15" aria-hidden />
          {refineSlot}
        </>
      ) : null}

      {model.multiCardSlot && !model.hoverOnly ? (
        <>
          <span className="mx-0.5 h-4 w-px shrink-0 bg-white/15" aria-hidden />
          {model.multiCardSlot}
        </>
      ) : null}

      {actions.length > 0 ? (
        <>
          <span className="mx-0.5 h-4 w-px shrink-0 bg-white/15" aria-hidden />
          <div className="flex shrink-0 items-center gap-1">
            {actions.map((action) => {
              const primary =
                Boolean(action.primary) ||
                action.id === "createButton" ||
                action.id === "addToContainer";
              const destructive =
                action.id === "undoButton" ||
                action.id === "undoSection" ||
                action.id === "undoMultiCard" ||
                action.id === "separateGroup" ||
                action.id === "removeFromContainer";
              return (
                <button
                  key={action.id + (action.targetContainerId ?? "")}
                  type="button"
                  data-testid={`site-creator-micro-${action.id}`}
                  aria-label={action.label}
                  title={action.label}
                  className="h-6 max-w-[140px] truncate rounded px-2 text-[10px] font-semibold outline-none focus-visible:ring-1 focus-visible:ring-white/40"
                  style={
                    primary && !destructive
                      ? {
                          background: "rgba(168,255,50,0.18)",
                          color: SC_VISUAL.selection,
                          border: "1px solid rgba(168,255,50,0.35)",
                        }
                      : {
                          background: "rgba(255,255,255,0.06)",
                          color: "rgba(255,255,255,0.88)",
                          border: "1px solid rgba(255,255,255,0.12)",
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
        className="pointer-events-auto absolute z-[5] flex max-w-[min(420px,94%)] items-center gap-1.5 rounded-md border px-2 shadow-lg"
        style={{
          left: 8,
          top: 8,
          height: model.hoverOnly ? 24 : 32,
          background: SC_VISUAL.chipBg,
          borderColor: SC_VISUAL.chipBorder,
          color: SC_VISUAL.chipFg,
          fontSize: 11,
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
      className="site-creator-floating-panel pointer-events-auto fixed z-[100055] flex max-w-[min(420px,94vw)] items-center gap-1.5 rounded-md border px-2 shadow-lg"
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        height: model.hoverOnly ? 24 : 32,
        background: SC_VISUAL.chipBg,
        borderColor: SC_VISUAL.chipBorder,
        color: SC_VISUAL.chipFg,
        fontSize: 11,
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
