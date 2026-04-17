"use client";

import React, { useMemo } from "react";
import type { FreehandObject } from "../FreehandStudio";
import {
  flattenObjectsForGradientDefs,
  renderClipDef,
  renderObj,
  type RenderObjOpts,
} from "../FreehandStudio";
import { gradientDefId, migrateFill, renderFillDef } from "../freehand/fill";

const PRESENTER_RENDER_OPTS: RenderObjOpts = {
  /** Sin marcos azules de marcos de texto — vista final. */
  canvasZenMode: true,
  designerMode: true,
  textEditingId: null,
  imageFrameOptimizeShowFrameId: null,
};

/**
 * Misma pipeline de pintura que el lienzo del Designer (renderObj + defs de degradados y clips).
 * Sustituye el preview esquemático para Presenter.
 */
export function DesignerPageCanvasView({
  objects,
  pageWidth,
  pageHeight,
  background = "#fafafa",
}: {
  objects: FreehandObject[];
  pageWidth: number;
  pageHeight: number;
  background?: string;
}) {
  const pw = Math.max(1, pageWidth);
  const ph = Math.max(1, pageHeight);

  const clipObjects = useMemo(() => objects.filter((o) => o.isClipMask), [objects]);
  const clippedGroups = useMemo(() => {
    const map = new Map<string, FreehandObject[]>();
    for (const o of objects) {
      if (o.clipMaskId) {
        const arr = map.get(o.clipMaskId) || [];
        arr.push(o);
        map.set(o.clipMaskId, arr);
      }
    }
    return map;
  }, [objects]);

  return (
    <svg
      className="block h-full w-full"
      viewBox={`0 0 ${pw} ${ph}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        {flattenObjectsForGradientDefs(objects).map((o) => {
          const f = migrateFill(o.fill);
          return f.type === "solid" ? null : renderFillDef(f, gradientDefId(o.id));
        })}
        {clipObjects.map((co) => renderClipDef(co))}
        <clipPath id="presenter-page-clip" clipPathUnits="userSpaceOnUse">
          <rect x={0} y={0} width={pw} height={ph} />
        </clipPath>
      </defs>
      <rect width={pw} height={ph} fill={background} />
      <g clipPath="url(#presenter-page-clip)">
        {objects.map((obj) => {
          if (obj.isClipMask) return null;
          if (obj.clipMaskId) return null;
          return (
            <g key={obj.id} data-fh-obj={obj.id}>
              {renderObj(obj, objects, new Set(), PRESENTER_RENDER_OPTS)}
            </g>
          );
        })}
        {Array.from(clippedGroups.entries()).map(([clipId, members]) => (
          <g key={`cg-${clipId}`} data-fh-clip-root={clipId} clipPath={`url(#clip-${clipId})`}>
            {members.map((m) => (
              <g key={m.id} data-fh-obj={m.id}>
                {renderObj(m, objects, new Set(), PRESENTER_RENDER_OPTS)}
              </g>
            ))}
          </g>
        ))}
      </g>
    </svg>
  );
}
