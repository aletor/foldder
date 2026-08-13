"use client";

import React, { useLayoutEffect, useState } from "react";
import type { PageRect } from "./site-creator-coordinate-space";
import { pageRectToStageRect } from "./site-creator-coordinate-space";
import { SC_VISUAL } from "./site-creator-visual-tokens";
import type { BreadcrumbSegment } from "./site-creator-hierarchy";
import type { SiteCreatorSelectionUnit } from "./site-creator-display-labels";

export type SiteCreatorChipModel = {
  bounds: PageRect;
  segments: BreadcrumbSegment[];
  kind?: "layer" | "component" | "section" | "group";
  /** Solo hover (menor énfasis). */
  muted?: boolean;
};

export interface SiteCreatorSelectionChipsProps {
  scale: number;
  stageWidth: number;
  stageHeight: number;
  chip: SiteCreatorChipModel | null;
  onNavigate?: (unit: SiteCreatorSelectionUnit) => void;
}

function placeChip(
  stageBounds: PageRect,
  stageWidth: number,
  stageHeight: number,
): { left: number; top: number } {
  const chipH = 24;
  const gap = 6;
  let left = stageBounds.x;
  let top = stageBounds.y - chipH - gap;
  if (top < 4) {
    top = stageBounds.y + gap;
  }
  if (left < 4) left = 4;
  if (left > stageWidth - 80) left = Math.max(4, stageWidth - 80);
  if (top > stageHeight - chipH - 4) top = Math.max(4, stageHeight - chipH - 4);
  return { left, top };
}

export function SiteCreatorSelectionChips({
  scale,
  stageWidth,
  stageHeight,
  chip,
  onNavigate,
}: SiteCreatorSelectionChipsProps) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!chip) {
      setPos(null);
      return;
    }
    const stageBounds = pageRectToStageRect(chip.bounds, scale);
    setPos(placeChip(stageBounds, stageWidth, stageHeight));
  }, [chip, scale, stageHeight, stageWidth]);

  if (!chip || !pos || chip.segments.length === 0) return null;

  const title = chip.segments.map((s) => s.label).join(" / ");

  return (
    <div
      className="site-creator-selection-chips pointer-events-none absolute inset-0 z-[4] overflow-hidden"
      data-site-creator-chips
      aria-hidden={false}
    >
      <div
        role="navigation"
        aria-label="Ruta"
        title={title}
        data-site-creator-chip
        data-muted={chip.muted ? "true" : "false"}
        className="pointer-events-auto absolute flex max-w-[min(360px,90%)] items-center gap-1 rounded-md border px-2 text-[11px] leading-none shadow-lg"
        style={{
          left: pos.left,
          top: pos.top,
          height: 24,
          background: SC_VISUAL.chipBg,
          borderColor: SC_VISUAL.chipBorder,
          color: SC_VISUAL.chipFg,
          transition: "opacity 90ms linear",
        }}
      >
        {chip.kind === "section" || chip.kind === "group" || chip.kind === "component" ? (
          <span className="shrink-0 opacity-60" aria-hidden>
            {chip.kind === "component" ? "◇" : chip.kind === "group" ? "▣" : "▤"}
          </span>
        ) : null}
        {chip.segments.map((seg, i) => (
          <React.Fragment key={`${seg.label}-${i}`}>
            {i > 0 ? (
              <span className="shrink-0" style={{ color: SC_VISUAL.chipMuted }}>
                /
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
    </div>
  );
}
