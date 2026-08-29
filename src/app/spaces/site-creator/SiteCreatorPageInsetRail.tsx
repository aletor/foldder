"use client";

import React, { useRef, useState } from "react";
import { Columns2, Link2, Link2Off, Maximize2, RotateCcw } from "lucide-react";
import {
  PAGE_INSET_ACCENT,
  clampPageInsets,
  pageInsetsAreActive,
  pageInsetsMatch,
  snapPageInsetsToDesign,
  type ResolvedPageInsets,
} from "./site-creator-page-insets";
import type { ResponsiveEditableBand, SitePageInsetBandV1 } from "./site-creator-types";

/** Alto del rail sobre la página (px de pantalla). */
export const SITE_CREATOR_PAGE_INSET_RAIL_GUTTER_PX = 52;
/** Distancia desde el borde superior del rail hasta la línea (deja aire sobre la página). */
const LINE_TOP_PX = 24;

const HANDLE_HIT = 24;
const TRIANGLE = 10;
const CHIP =
  "pointer-events-auto flex h-6 w-6 items-center justify-center border border-white/18 bg-[#151c24] text-white/85 hover:border-white/35";

export type SiteCreatorPageInsetRailProps = {
  band: ResponsiveEditableBand;
  layoutWidth: number;
  /** Escala página → pantalla (mismo zoom del preview). */
  scale: number;
  /** Alto visible del marco de dispositivo (px de pantalla). */
  pageScreenHeight: number;
  insets: ResolvedPageInsets;
  /** Gutter del Original, ya escalado a esta banda. */
  designInsets?: SitePageInsetBandV1 | null;
  onChange: (next: SitePageInsetBandV1) => void;
};

type DragState = {
  side: "left" | "right";
  startClientX: number;
  startLeft: number;
  startRight: number;
  linked: boolean;
};

export function SiteCreatorPageInsetRail({
  band,
  layoutWidth,
  scale,
  pageScreenHeight,
  insets,
  designInsets = null,
  onChange,
}: SiteCreatorPageInsetRailProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [snapped, setSnapped] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const enabled = insets.enabled !== false;
  const leftPx = insets.left * scale;
  const rightPx = insets.right * scale;
  const widthPx = Math.max(1, layoutWidth * scale);
  const canRestore =
    enabled &&
    Boolean(designInsets && pageInsetsAreActive(designInsets)) &&
    !pageInsetsMatch(insets, designInsets!);

  const commitDrag = (event: React.PointerEvent<HTMLButtonElement>, state: DragState) => {
    const dxPage = (event.clientX - state.startClientX) / Math.max(0.0001, scale);
    const raw = insetsFromDrag(state, dxPage, layoutWidth, insets.enabled !== false);
    const snappedNext = snapPageInsetsToDesign(raw, designInsets, layoutWidth);
    setSnapped(snappedNext.snapped);
    onChange(snappedNext.insets);
  };

  const startDrag = (
    event: React.PointerEvent<HTMLButtonElement>,
    side: "left" | "right",
  ) => {
    if (!enabled) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const next: DragState = {
      side,
      startClientX: event.clientX,
      startLeft: insets.left,
      startRight: insets.right,
      linked: insets.linked,
    };
    dragRef.current = next;
    setDrag(next);
    setSnapped(false);
  };

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[46] overflow-visible"
      data-testid="site-creator-page-inset-rail"
      data-site-creator-page-inset-band={band}
      data-site-creator-page-inset-enabled={enabled ? "1" : "0"}
      data-site-creator-floating-ui="true"
    >
      {enabled ? (
        <div
          className="absolute left-0 h-px"
          style={{
            top: LINE_TOP_PX,
            width: widthPx,
            backgroundImage: `repeating-linear-gradient(to right, ${PAGE_INSET_ACCENT} 0 5px, transparent 5px 11px)`,
          }}
          aria-hidden
        />
      ) : null}

      {enabled && drag ? (
        <>
          <Guide x={leftPx} height={pageScreenHeight} side="left" />
          <Guide x={widthPx - rightPx} height={pageScreenHeight} side="right" />
        </>
      ) : null}

      {enabled ? (
        <>
          <Handle
            side="left"
            x={leftPx}
            dragging={drag?.side === "left"}
            onPointerDown={(event) => startDrag(event, "left")}
            onPointerMove={(event) => {
              const current = dragRef.current;
              if (!current || current.side !== "left") return;
              commitDrag(event, current);
            }}
            onPointerUp={() => {
              dragRef.current = null;
              setDrag(null);
              setSnapped(false);
            }}
          />
          <Handle
            side="right"
            x={widthPx - rightPx}
            dragging={drag?.side === "right"}
            onPointerDown={(event) => startDrag(event, "right")}
            onPointerMove={(event) => {
              const current = dragRef.current;
              if (!current || current.side !== "right") return;
              commitDrag(event, current);
            }}
            onPointerUp={() => {
              dragRef.current = null;
              setDrag(null);
              setSnapped(false);
            }}
          />
        </>
      ) : null}

      <div
        className="pointer-events-none absolute left-1/2 top-0 flex -translate-x-1/2 items-center gap-1.5"
        style={{ height: LINE_TOP_PX }}
      >
        <button
          type="button"
          className={`${CHIP} ${enabled ? "" : "opacity-45"}`}
          aria-pressed={insets.linked}
          aria-label={insets.linked ? "Márgenes iguales" : "Márgenes independientes"}
          title={insets.linked ? "Márgenes iguales" : "Márgenes independientes"}
          data-testid="site-creator-page-inset-link"
          disabled={!enabled}
          onClick={() => {
            if (!enabled) return;
            if (insets.linked) {
              onChange({
                left: insets.left,
                right: insets.right,
                linked: false,
                enabled: true,
              });
              return;
            }
            const avg = Math.round((insets.left + insets.right) / 2);
            onChange(clampPageInsets(avg, avg, layoutWidth, true, true));
          }}
        >
          {insets.linked ? (
            <Link2 className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
          ) : (
            <Link2Off className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
          )}
        </button>
        <button
          type="button"
          className={CHIP}
          aria-pressed={enabled}
          aria-label={enabled ? "Usar márgenes" : "No usar márgenes"}
          title={enabled ? "Usar márgenes" : "No usar márgenes · a sangre"}
          data-testid="site-creator-page-inset-enabled"
          onClick={() => {
            onChange({
              left: insets.left,
              right: insets.right,
              linked: insets.linked,
              enabled: !enabled,
            });
          }}
        >
          {enabled ? (
            <Columns2 className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
          ) : (
            <Maximize2 className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
          )}
        </button>
        {canRestore ? (
          <button
            type="button"
            className={CHIP}
            aria-label="Restaurar margen del diseño"
            title="Restaurar margen del diseño"
            data-testid="site-creator-page-inset-restore-design"
            onClick={() => {
              if (!designInsets) return;
              onChange(
                clampPageInsets(
                  designInsets.left,
                  designInsets.right,
                  layoutWidth,
                  designInsets.linked,
                  true,
                ),
              );
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
          </button>
        ) : null}
        {drag ? (
          <span
            className="pointer-events-none text-[10px] font-semibold tabular-nums text-[#c4a882]"
            data-testid="site-creator-page-inset-readout"
          >
            {snapped
              ? `Diseño · ${Math.round(insets.left)} px`
              : `${Math.round(insets.left)} px · ${Math.round(insets.right)} px`}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function insetsFromDrag(
  drag: DragState,
  dxPage: number,
  layoutWidth: number,
  enabled: boolean,
): SitePageInsetBandV1 {
  if (drag.linked) {
    const delta = drag.side === "left" ? dxPage : -dxPage;
    const next = drag.startLeft + delta;
    return clampPageInsets(next, next, layoutWidth, true, enabled);
  }
  if (drag.side === "left") {
    return clampPageInsets(drag.startLeft + dxPage, drag.startRight, layoutWidth, false, enabled);
  }
  return clampPageInsets(drag.startLeft, drag.startRight - dxPage, layoutWidth, false, enabled);
}

function Handle({
  side,
  x,
  dragging,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  side: "left" | "right";
  x: number;
  dragging: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={side === "left" ? "Margen izquierdo de página" : "Margen derecho de página"}
      data-testid={`site-creator-page-inset-handle-${side}`}
      className="pointer-events-auto absolute cursor-ew-resize touch-none"
      style={{
        left: x,
        top: LINE_TOP_PX - HANDLE_HIT / 2,
        width: HANDLE_HIT,
        height: HANDLE_HIT,
        transform: "translate(-50%, 0)",
        zIndex: 2,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <span
        className="absolute left-1/2 top-1/2 block"
        style={{
          width: 0,
          height: 0,
          transform: `translate(-50%, -${TRIANGLE / 2}px)`,
          borderLeft: `${TRIANGLE / 2}px solid transparent`,
          borderRight: `${TRIANGLE / 2}px solid transparent`,
          borderTop: `${TRIANGLE}px solid ${PAGE_INSET_ACCENT}`,
          filter: dragging ? "brightness(1.15)" : undefined,
          boxShadow: dragging ? "0 0 0 2px rgba(255,255,255,0.55)" : undefined,
        }}
        aria-hidden
      />
    </button>
  );
}

function Guide({
  x,
  height,
  side,
}: {
  x: number;
  height: number;
  side: "left" | "right";
}) {
  return (
    <div
      className="absolute w-px"
      data-testid={`site-creator-page-inset-guide-${side}`}
      style={{
        top: LINE_TOP_PX,
        left: x,
        height: Math.max(1, height),
        transform: "translateX(-0.5px)",
        backgroundImage: `repeating-linear-gradient(to bottom, ${PAGE_INSET_ACCENT} 0 5px, transparent 5px 11px)`,
      }}
      aria-hidden
    />
  );
}
