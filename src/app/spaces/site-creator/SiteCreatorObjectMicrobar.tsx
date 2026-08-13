"use client";

import React, { useLayoutEffect, useRef, useState } from "react";
import type { PageRect } from "./site-creator-coordinate-space";
import { pageRectToStageRect } from "./site-creator-coordinate-space";
import { SC_VISUAL } from "./site-creator-visual-tokens";
import type { SiteCreatorPrimaryAction } from "./site-creator-contextual-actions";
import type { SiteCreatorSelectionUnit } from "./site-creator-display-labels";

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
};

export interface SiteCreatorObjectMicrobarProps {
  scale: number;
  stageWidth: number;
  stageHeight: number;
  model: SiteCreatorMicrobarModel | null;
  onNavigate?: (unit: SiteCreatorSelectionUnit) => void;
  onAction?: (action: SiteCreatorPrimaryAction) => void;
}

function placeBar(
  stageBounds: PageRect,
  stageWidth: number,
  stageHeight: number,
  barHeight: number,
  barWidth: number,
): { left: number; top: number } {
  const gap = 6;
  let left = stageBounds.x;
  let top = stageBounds.y - barHeight - gap;
  if (top < 4) {
    top = stageBounds.y + stageBounds.height + gap;
  }
  if (top + barHeight > stageHeight - 4) {
    top = Math.max(4, stageBounds.y + gap);
  }
  if (left + barWidth > stageWidth - 4) {
    left = Math.max(4, stageWidth - barWidth - 4);
  }
  if (left < 4) left = 4;
  return { left, top };
}

export function SiteCreatorObjectMicrobar({
  scale,
  stageWidth,
  stageHeight,
  model,
  onNavigate,
  onAction,
}: SiteCreatorObjectMicrobarProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!model) {
      setPos(null);
      return;
    }
    const stageBounds = pageRectToStageRect(model.bounds, scale);
    const w = ref.current?.offsetWidth ?? (model.hoverOnly ? 140 : 280);
    const h = model.hoverOnly ? 24 : 32;
    setPos(placeBar(stageBounds, stageWidth, stageHeight, h, w));
  }, [model, scale, stageHeight, stageWidth]);

  if (!model) return null;
  if (model.segments.length === 0 && !model.summary && (model.hoverOnly || model.actions.length === 0)) {
    return null;
  }

  const title =
    model.segments.length > 0
      ? model.segments.map((s) => s.label).join(" › ")
      : model.summary ?? "";
  const actions = model.hoverOnly ? [] : model.actions.slice(0, 3);

  return (
    <div
      className="site-creator-object-microbar pointer-events-none absolute inset-0 z-[5] overflow-hidden"
      data-site-creator-microbar-root
    >
      <div
        ref={ref}
        data-site-creator-microbar
        data-hover-only={model.hoverOnly ? "true" : "false"}
        title={title}
        className="pointer-events-auto absolute flex max-w-[min(420px,94%)] items-center gap-1.5 rounded-md border px-2 shadow-lg"
        style={{
          left: pos?.left ?? 0,
          top: pos?.top ?? 0,
          height: model.hoverOnly ? 24 : 32,
          background: SC_VISUAL.chipBg,
          borderColor: SC_VISUAL.chipBorder,
          color: SC_VISUAL.chipFg,
          fontSize: 11,
          transition: "opacity 100ms linear",
          opacity: pos ? 1 : 0,
        }}
      >
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
                >
                  {seg.label}
                </span>
              ) : (
                <button
                  type="button"
                  className="min-w-0 truncate font-medium hover:underline"
                  style={{ color: SC_VISUAL.chipMuted }}
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
        </div>

        {model.summary && model.segments.length === 0 ? (
          <span className="font-semibold">{model.summary}</span>
        ) : null}

        {actions.length > 0 ? (
          <>
            <span className="mx-0.5 h-4 w-px shrink-0 bg-white/15" aria-hidden />
            <div className="flex shrink-0 items-center gap-1">
              {actions.map((action) => {
                const primary = Boolean(action.primary) || action.id === "createButton" || action.id === "addToContainer";
                const destructive =
                  action.id === "undoButton" ||
                  action.id === "undoSection" ||
                  action.id === "separateGroup" ||
                  action.id === "removeFromContainer";
                return (
                  <button
                    key={action.id + (action.targetContainerId ?? "")}
                    type="button"
                    data-testid={`site-creator-micro-${action.id}`}
                    aria-label={action.label}
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
      </div>
    </div>
  );
}
