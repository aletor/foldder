"use client";

import { useMemo } from "react";
import { getPageDimensions } from "../indesign/page-formats";
import { DesignerCanvasPresetBadge } from "./DesignerCanvasFormatLabel";
import { resolveStudioCanvasFormatDisplay } from "../studio-node/studio-canvas-presets";
import type { DesignerPageState } from "./DesignerNode";

type SlideFormatSummary = {
  key: string;
  width: number;
  height: number;
  presetId?: string | null;
  count: number;
};

function summarizeDesignerSlideFormats(pages: DesignerPageState[]): SlideFormatSummary[] {
  const map = new Map<string, SlideFormatSummary>();
  for (const page of pages) {
    const dims = getPageDimensions(page);
    const key = `${dims.width}x${dims.height}:${page.canvasPresetId ?? ""}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(key, {
        key,
        width: dims.width,
        height: dims.height,
        presetId: page.canvasPresetId,
        count: 1,
      });
    }
  }
  return Array.from(map.values());
}

function DesignerNodeDockSlideFormatRow({
  width,
  height,
  presetId,
  count,
}: {
  width: number;
  height: number;
  presetId?: string | null;
  count: number;
}) {
  const { preset, sizeLabel } = resolveStudioCanvasFormatDisplay({ width, height, presetId });

  return (
    <span className="designer-node-dock-slide-formats__row">
      <span className="designer-node-dock-slide-formats__icon">
        {preset ? <DesignerCanvasPresetBadge preset={preset} /> : null}
      </span>
      <span className="designer-node-dock-slide-formats__label">
        {preset ? (
          <>
            <span className="designer-node-dock-slide-formats__title">{preset.title}</span>
            <span className="designer-node-dock-slide-formats__size">{sizeLabel}</span>
          </>
        ) : (
          <span className="designer-node-dock-slide-formats__size">{sizeLabel}</span>
        )}
        {count > 1 ? <span className="designer-node-dock-slide-formats__count">×{count}</span> : null}
      </span>
    </span>
  );
}

export function DesignerNodeDockSlideFormats({ pages }: { pages: DesignerPageState[] }) {
  const summaries = useMemo(() => summarizeDesignerSlideFormats(pages), [pages]);

  if (summaries.length === 0) return <>—</>;

  return (
    <span
      className={`designer-node-dock-slide-formats${summaries.length > 1 ? " designer-node-dock-slide-formats--multi" : ""}`}
    >
      {summaries.map((row) => (
        <DesignerNodeDockSlideFormatRow
          key={row.key}
          width={row.width}
          height={row.height}
          presetId={row.presetId}
          count={row.count}
        />
      ))}
    </span>
  );
}
