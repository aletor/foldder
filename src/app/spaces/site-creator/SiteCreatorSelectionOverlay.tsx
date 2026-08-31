"use client";

import React, { useMemo } from "react";
import { unionPageRects, type PageRect } from "./site-creator-coordinate-space";
import { isolationUnits } from "./build-site-selection-index";
import type { SiteCreatorSelectionIndex, SiteCreatorSelectionState } from "./site-creator-selection-types";
import type { SiteCreatorUnitOutline } from "./SiteCreatorSelectionSurface";
import { isGroupingOutlineKind, SC_VISUAL } from "./site-creator-visual-tokens";

function groupingScopeVeilPath(
  pageWidth: number,
  pageHeight: number,
  holes: Array<{ x: number; y: number; width: number; height: number }>,
): string {
  const outer = `M0 0H${pageWidth}V${pageHeight}H0Z`;
  const inner = holes
    .filter((bounds) => bounds.width > 0 && bounds.height > 0)
    .map(
      (bounds) =>
        `M${bounds.x} ${bounds.y}H${bounds.x + bounds.width}V${bounds.y + bounds.height}H${bounds.x}Z`,
    )
    .join("");
  return `${outer}${inner}`;
}

function CornerMarks({
  bounds,
  color,
  len = SC_VISUAL.cornerLen,
}: {
  bounds: PageRect;
  color: string;
  len?: number;
}) {
  const { x, y, width, height } = bounds;
  const paths = [
    `M ${x} ${y + len} V ${y} H ${x + len}`,
    `M ${x + width - len} ${y} H ${x + width} V ${y + len}`,
    `M ${x} ${y + height - len} V ${y + height} H ${x + len}`,
    `M ${x + width - len} ${y + height} H ${x + width} V ${y + height - len}`,
  ];
  return (
    <g data-site-creator-corners>
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={1.25}
          strokeLinecap="square"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  );
}

export type SiteCreatorGhostOutline = {
  bounds: PageRect;
  emphasized?: boolean;
  isContainer?: boolean;
};

export interface SiteCreatorSelectionOverlayProps {
  pageWidth: number;
  pageHeight: number;
  index: SiteCreatorSelectionIndex;
  selection: SiteCreatorSelectionState;
  marquee: { x: number; y: number; width: number; height: number } | null;
  hoverName: string | null;
  unitOutlines?: SiteCreatorUnitOutline[];
  hoverOutline?: SiteCreatorUnitOutline | null;
  contextOutlines?: SiteCreatorUnitOutline[];
  /** Radiografía: hijos directos del contenedor bajo hover/selección. */
  ghostOutlines?: SiteCreatorGhostOutline[];
  sectionOutlines?: SiteCreatorUnitOutline[];
}

export function SiteCreatorSelectionOverlay({
  pageWidth,
  pageHeight,
  index,
  selection,
  marquee,
  unitOutlines = [],
  hoverOutline = null,
  contextOutlines = [],
  ghostOutlines = [],
  sectionOutlines = [],
}: SiteCreatorSelectionOverlayProps) {
  const isolation = isolationUnits(index, selection.isolationIds);
  const isolationParent = selection.isolationIds.length
    ? index.byId[selection.isolationIds[selection.isolationIds.length - 1]!]
    : null;

  const legacyRects = useMemo(() => {
    if (unitOutlines.length > 0) return [];
    return selection.selectedIds
      .map((id) => index.byId[id]?.visualBounds)
      .filter((rect): rect is NonNullable<typeof rect> => Boolean(rect));
  }, [index, selection.selectedIds, unitOutlines.length]);

  const multiHull = useMemo(() => {
    if (unitOutlines.length < 2) return null;
    return unionPageRects(unitOutlines.map((o) => o.bounds));
  }, [unitOutlines]);

  const groupingOutlines = useMemo(
    () => unitOutlines.filter((outline) => isGroupingOutlineKind(outline.kind)),
    [unitOutlines],
  );

  return (
    <svg
      className="site-creator-selection-overlay pointer-events-none absolute inset-0 block h-full w-full"
      viewBox={`0 0 ${pageWidth} ${pageHeight}`}
      preserveAspectRatio="none"
      aria-hidden
      data-site-creator-overlay
    >
      {contextOutlines.map((outline, i) => (
        <CornerMarks key={`ctx-${i}`} bounds={outline.bounds} color={SC_VISUAL.context} />
      ))}

      {/* Radiografía de hijos */}
      {ghostOutlines.map((g, i) => (
        <g key={`ghost-${i}`} data-site-creator-ghost data-emphasized={g.emphasized ? "true" : "false"}>
          <rect
            x={g.bounds.x}
            y={g.bounds.y}
            width={g.bounds.width}
            height={g.bounds.height}
            fill="none"
            stroke={SC_VISUAL.hover}
            strokeWidth={1}
            strokeOpacity={g.emphasized ? 0.82 : 0.22}
            vectorEffect="non-scaling-stroke"
          />
          {g.isContainer ? (
            <CornerMarks
              bounds={g.bounds}
              color={g.emphasized ? SC_VISUAL.hover : "rgba(235, 242, 248, 0.28)"}
            />
          ) : null}
        </g>
      ))}

      {sectionOutlines.map((outline, i) => (
        <g key={`sec-${i}`} data-site-creator-selection-container>
          <rect
            x={outline.bounds.x}
            y={outline.bounds.y}
            width={outline.bounds.width}
            height={outline.bounds.height}
            fill="none"
            stroke={SC_VISUAL.selection}
            strokeWidth={SC_VISUAL.selectionStroke}
            vectorEffect="non-scaling-stroke"
          />
          <CornerMarks bounds={outline.bounds} color={SC_VISUAL.selection} />
        </g>
      ))}

      {isolationParent ? (
        <CornerMarks bounds={isolationParent.visualBounds} color="rgba(34,211,238,0.45)" />
      ) : null}

      {hoverOutline ? (
        <g data-site-creator-hover data-role={hoverOutline.kind ?? "layer"}>
          <rect
            x={hoverOutline.bounds.x}
            y={hoverOutline.bounds.y}
            width={hoverOutline.bounds.width}
            height={hoverOutline.bounds.height}
            fill="none"
            stroke={SC_VISUAL.hover}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          {isGroupingOutlineKind(hoverOutline.kind) ? (
            <CornerMarks bounds={hoverOutline.bounds} color={SC_VISUAL.hover} />
          ) : null}
        </g>
      ) : null}

      {groupingOutlines.length > 0 ? (
        <path
          data-site-creator-scope-veil
          d={groupingScopeVeilPath(
            pageWidth,
            pageHeight,
            groupingOutlines.map((outline) => outline.bounds),
          )}
          fill={SC_VISUAL.veil}
          fillRule="evenodd"
        />
      ) : null}

      {unitOutlines.map((outline, i) => {
        const grouping = isGroupingOutlineKind(outline.kind);
        return (
          <g
            key={`unit-${i}`}
            data-site-creator-selection
            data-scope={grouping ? "group" : "object"}
          >
            <rect
              x={outline.bounds.x}
              y={outline.bounds.y}
              width={outline.bounds.width}
              height={outline.bounds.height}
              fill={SC_VISUAL.selectionFill}
              stroke={SC_VISUAL.selection}
              strokeWidth={grouping ? SC_VISUAL.groupSelectionStroke : SC_VISUAL.selectionStroke}
              vectorEffect="non-scaling-stroke"
              style={{ filter: `drop-shadow(0 0 2px ${SC_VISUAL.selectionGlow})` }}
            />
            {grouping ? <CornerMarks bounds={outline.bounds} color={SC_VISUAL.selection} /> : null}
          </g>
        );
      })}

      {legacyRects.length === 1 && legacyRects[0] ? (
        <rect
          x={legacyRects[0].x}
          y={legacyRects[0].y}
          width={legacyRects[0].width}
          height={legacyRects[0].height}
          fill={SC_VISUAL.selectionFill}
          stroke={SC_VISUAL.selection}
          strokeWidth={SC_VISUAL.selectionStroke}
          vectorEffect="non-scaling-stroke"
        />
      ) : null}

      {multiHull ? <CornerMarks bounds={multiHull} color={SC_VISUAL.context} /> : null}

      {marquee ? (
        <rect
          x={marquee.x}
          y={marquee.y}
          width={marquee.width}
          height={marquee.height}
          fill={SC_VISUAL.marqueeFill}
          stroke={SC_VISUAL.marquee}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          data-site-creator-marquee
        />
      ) : null}

      {isolation.length === 0 && isolationParent ? (
        <rect
          x={isolationParent.visualBounds.x}
          y={isolationParent.visualBounds.y}
          width={isolationParent.visualBounds.width}
          height={isolationParent.visualBounds.height}
          fill="none"
          stroke="rgba(255,255,255,0.2)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </svg>
  );
}
