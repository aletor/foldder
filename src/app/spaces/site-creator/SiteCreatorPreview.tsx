"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import { collectDesignerPageFontFamilies } from "@/app/spaces/designer/designer-page-text-frame-sync";
import { ensureGoogleFontPreviewBatchLoaded } from "@/app/spaces/freehand/google-fonts-preview-loader";
import { getPageDimensions } from "@/app/spaces/indesign/page-formats";
import { DesignerPageCanvasView } from "@/app/spaces/presenter/DesignerPageCanvasView";
import {
  SiteCreatorSelectionSurface,
  type SiteCreatorUnitOutline,
} from "./SiteCreatorSelectionSurface";
import {
  SiteCreatorObjectMicrobar,
  type SiteCreatorMicrobarModel,
} from "./SiteCreatorObjectMicrobar";
import { SiteCreatorIsolationBreadcrumb } from "./SiteCreatorSelectionToolbar";
import type {
  SiteCreatorSelectionAction,
  SiteCreatorSelectionIndex,
  SiteCreatorSelectionState,
} from "./site-creator-selection-types";
import type { SiteCreatorSelectionUnit } from "./site-creator-display-labels";
import type { PageRect } from "./site-creator-coordinate-space";
import type { SiteCreatorGhostOutline } from "./SiteCreatorSelectionOverlay";
import type { SiteCreatorPrimaryAction } from "./site-creator-contextual-actions";

export type SiteCreatorPreviewZoomMode = "fit" | 0.5 | 1;

function pageBackground(page: DesignerPageState): string {
  if (page.pageBackground === "black") return "#000000";
  if (page.pageBackground === "transparent") return "transparent";
  return "#fafafa";
}

export interface SiteCreatorPreviewProps {
  page: DesignerPageState;
  zoomMode?: SiteCreatorPreviewZoomMode;
  onZoomPercentChange?: (percent: number) => void;
  selection?: SiteCreatorSelectionState;
  selectionIndex?: SiteCreatorSelectionIndex;
  onSelectionAction?: (action: SiteCreatorSelectionAction) => void;
  unitOutlines?: SiteCreatorUnitOutline[];
  hoverOutline?: SiteCreatorUnitOutline | null;
  contextOutlines?: SiteCreatorUnitOutline[];
  sectionOutlines?: SiteCreatorUnitOutline[];
  ghostOutlines?: SiteCreatorGhostOutline[];
  microbar?: SiteCreatorMicrobarModel | null;
  onMicrobarNavigate?: (unit: SiteCreatorSelectionUnit) => void;
  onMicrobarAction?: (action: SiteCreatorPrimaryAction) => void;
  onCanvasInteraction?: () => void;
}

export function SiteCreatorPreview({
  page,
  zoomMode = "fit",
  onZoomPercentChange,
  selection,
  selectionIndex,
  onSelectionAction,
  unitOutlines,
  hoverOutline,
  contextOutlines,
  sectionOutlines,
  ghostOutlines,
  microbar = null,
  onMicrobarNavigate,
  onMicrobarAction,
  onCanvasInteraction,
}: SiteCreatorPreviewProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(960);
  const [scrollTick, setScrollTick] = useState(0);

  const { width: pageWidth, height: pageHeight } = getPageDimensions(page);
  const objects = page.objects ?? [];

  const fontFamilies = useMemo(() => collectDesignerPageFontFamilies(page), [page]);

  useEffect(() => {
    if (!fontFamilies.length) return;
    void ensureGoogleFontPreviewBatchLoaded(fontFamilies).catch(() => undefined);
  }, [fontFamilies]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = () => setContainerWidth(Math.max(240, el.clientWidth - 48));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setScrollTick((n) => n + 1);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const scale =
    zoomMode === "fit"
      ? Math.min(1, containerWidth / Math.max(1, pageWidth))
      : zoomMode === 0.5
        ? 0.5
        : 1;

  const displayWidth = Math.max(1, Math.round(pageWidth * scale));
  const displayHeight = Math.max(1, Math.round(pageHeight * scale));
  const zoomPercent = Math.round(scale * 100);

  useEffect(() => {
    onZoomPercentChange?.(zoomPercent);
  }, [onZoomPercentChange, zoomPercent]);

  // scrollTick fuerza recálculo de chips al hacer scroll
  void scrollTick;

  return (
    <div ref={viewportRef} className="site-creator-preview-viewport flex min-h-0 flex-1 flex-col">
      {selection && selectionIndex && onSelectionAction && selection.isolationIds.length > 0 ? (
        <div className="site-creator-isolation-bar shrink-0 border-b border-white/10 bg-[#101820]">
          <SiteCreatorIsolationBreadcrumb
            index={selectionIndex}
            isolationIds={selection.isolationIds}
            onNavigate={(isolationIds) => onSelectionAction({ type: "setIsolation", isolationIds })}
          />
        </div>
      ) : null}
      <div ref={scrollRef} className="site-creator-preview-scroll min-h-0 flex-1 overflow-auto">
        <div className="site-creator-preview-scroll-inner flex min-h-full justify-center py-8">
          <div
            className="site-creator-preview-stage relative shadow-[0_12px_40px_rgba(0,0,0,0.35)]"
            style={{ width: displayWidth, height: displayHeight }}
            data-site-creator-preview-scale={scale}
          >
            <div
              className="site-creator-preview-stage__inner origin-top-left"
              style={{
                width: pageWidth,
                height: pageHeight,
                transform: `scale(${scale})`,
              }}
            >
              <DesignerPageCanvasView
                objects={objects}
                pageWidth={pageWidth}
                pageHeight={pageHeight}
                background={pageBackground(page)}
              />
              {selection && selectionIndex && onSelectionAction ? (
                <SiteCreatorSelectionSurface
                  pageWidth={pageWidth}
                  pageHeight={pageHeight}
                  scale={scale}
                  index={selectionIndex}
                  selection={selection}
                  dispatch={onSelectionAction}
                  unitOutlines={unitOutlines}
                  hoverOutline={hoverOutline}
                  contextOutlines={contextOutlines}
                  sectionOutlines={sectionOutlines}
                  ghostOutlines={ghostOutlines}
                  onCanvasInteraction={onCanvasInteraction}
                />
              ) : null}
            </div>
            <SiteCreatorObjectMicrobar
              scale={scale}
              stageWidth={displayWidth}
              stageHeight={displayHeight}
              model={microbar}
              onNavigate={onMicrobarNavigate}
              onAction={onMicrobarAction}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
