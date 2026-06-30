"use client";

import React from "react";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import { DesignerPagePreview } from "@/app/spaces/designer/DesignerPagePreview";
import { getPageDimensions } from "@/app/spaces/indesign/page-formats";

export type FoldderTemplatePreviewSource = {
  id: string;
  pages: DesignerPageState[];
  thumbUrl?: string;
};

export function foldderTemplatePreviewGridStyle(count: number): React.CSSProperties {
  if (count <= 1) {
    return { gridTemplateColumns: "1fr", gridTemplateRows: "1fr" };
  }
  if (count === 2) {
    return { gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr" };
  }
  if (count <= 4) {
    return { gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr" };
  }
  const cols = count <= 6 ? 3 : 4;
  const rows = Math.ceil(count / cols);
  return {
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
  };
}

export function resolveDesignerTemplatePreviewThumb(
  pages: DesignerPageState[],
  nodeData?: {
    pageThumbnails?: Record<string, string>;
    value?: string;
  },
): string | undefined {
  const firstPage = pages[0];
  if (!firstPage) return undefined;
  const cached = nodeData?.pageThumbnails?.[firstPage.id];
  if (cached) return cached;
  const value = nodeData?.value;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function FoldderTemplatePreviewGrid({
  sources,
}: {
  sources: FoldderTemplatePreviewSource[];
}) {
  if (sources.length === 0) return null;

  return (
    <div
      className="foldder-template-preview-grid nodrag"
      style={foldderTemplatePreviewGridStyle(sources.length)}
      aria-hidden
    >
      {sources.map((source) => {
        const page = source.pages[0];
        const dims = page ? getPageDimensions(page) : null;

        return (
          <div key={source.id} className="foldder-template-preview-grid__cell">
            {source.thumbUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={source.thumbUrl}
                alt=""
                className="foldder-template-preview-grid__img"
                draggable={false}
              />
            ) : page && dims ? (
              <DesignerPagePreview
                objects={page.objects ?? []}
                pageWidth={dims.width}
                pageHeight={dims.height}
              />
            ) : (
              <span className="foldder-template-preview-grid__placeholder" />
            )}
          </div>
        );
      })}
    </div>
  );
}
