"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import { collectDesignerPageFontFamilies } from "@/app/spaces/designer/designer-page-text-frame-sync";
import { ensureGoogleFontPreviewBatchLoaded } from "@/app/spaces/freehand/google-fonts-preview-loader";
import { getPageDimensions } from "@/app/spaces/indesign/page-formats";
import { DesignerPageCanvasView } from "@/app/spaces/presenter/DesignerPageCanvasView";
import {
  SiteCreatorSelectionSurface,
  type SiteCreatorClipImageEdit,
  type SiteCreatorUnitOutline,
} from "./SiteCreatorSelectionSurface";
import type { GroupFitOpportunity } from "./site-creator-group-fit";
import type { SectionHeightOpportunity } from "./site-creator-section-height";
import {
  SiteCreatorObjectMicrobar,
  type FloatingChromeGeometry,
  type SiteCreatorMicrobarModel,
} from "./SiteCreatorObjectMicrobar";
import type { PageRect } from "./site-creator-coordinate-space";
import { pageRectToStageRect } from "./site-creator-coordinate-space";
import { SiteCreatorIsolationBreadcrumb } from "./SiteCreatorSelectionToolbar";
import type {
  SiteCreatorSelectionAction,
  SiteCreatorSelectionIndex,
  SiteCreatorSelectionState,
} from "./site-creator-selection-types";
import type { SiteCreatorSelectionUnit } from "./site-creator-display-labels";
import type { SiteCreatorGhostOutline } from "./SiteCreatorSelectionOverlay";
import type { SiteCreatorPrimaryAction } from "./site-creator-contextual-actions";
import type { SiteBlueprintV1, SiteSectionHeightMode, SiteSectionScrollKind } from "./site-creator-types";
import {
  SiteCreatorSectionSpine,
  SITE_CREATOR_SECTION_SPINE_GUTTER_PX,
  SITE_CREATOR_SECTION_SPINE_PAGE_GAP_PX,
  type SectionSpineStation,
} from "./SiteCreatorSectionSpine";
import {
  lastDocumentSection,
  listDocumentSections,
  listSectionScrollHops,
  sectionScrollNeedsViewportPad,
} from "./site-creator-section-scroll";
import { bindSectionScroller } from "./site-creator-section-scroll-runtime";
import {
  liveViewportHeightInPageUnits,
  planSectionHeightLayout,
  sectionDisplayTop,
  sectionHeightModeForBand,
  type SectionHeightBand,
  type SectionScrollStationPoint,
} from "./site-creator-section-height";
import {
  applyWorkAreaWheelDelta,
  clampViewportWidth,
  isSiteCreatorPreviewChromeBackgroundTarget,
  measureSiteCreatorPreviewAvailableSize,
  shouldRedirectCanvasWheelToWorkArea,
  viewportWidthDeltaFromCenteredEdgeDrag,
} from "./site-creator-viewport";

/** @deprecated Prefer numeric previewZoom (6A). Kept for import compatibility. */
export type SiteCreatorPreviewZoomMode = "fit" | 0.5 | 1;

function pageBackground(page: DesignerPageState): string {
  if (page.pageBackground === "black") return "#000000";
  if (page.pageBackground === "transparent") return "transparent";
  return "#fafafa";
}

export interface SiteCreatorPreviewProps {
  page: DesignerPageState;
  /** Ancho CSS de la vista web (no es zoom). */
  viewportWidth: number;
  /** Ancho de referencia del diseño original (para clamp del resize). */
  referenceWidth: number;
  /** Zoom de edición numérico (no modo reactivo). */
  previewZoom: number;
  /** Frame de dispositivo (tablet/móvil). Null = vista Original. */
  deviceFrame?: { width: number; height: number } | null;
  onViewportWidthChange?: (width: number) => void;
  onAvailableSizeChange?: (size: { width: number; height: number }) => void;
  /** @deprecated Ignorado en 6A; el zoom lo controla el Studio. */
  zoomMode?: SiteCreatorPreviewZoomMode;
  selection?: SiteCreatorSelectionState;
  selectionIndex?: SiteCreatorSelectionIndex;
  blueprint?: SiteBlueprintV1 | null;
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
  /** Doble clic en fondo del lienzo → Ajustar. */
  onCanvasBackgroundDoubleClick?: () => void;
  /** Clips por capa del layout responsive resuelto (6B.1). */
  objectClipById?: Record<string, { x: number; y: number; width: number; height: number }>;
  /** Host para portal de microbarra / popover (capa Studio sin clip). */
  floatingPortalHost?: HTMLElement | null;
  transformEnabled?: boolean;
  transformBounds?: { x: number; y: number; width: number; height: number } | null;
  onTransformCommit?: (delta: { dx: number; dy: number; dw?: number; dh?: number }) => void;
  focalLayerId?: string | null;
  onFocalPoint?: (focal: { x: number; y: number }) => void;
  onCancelFocal?: () => void;
  clipImageEdit?: SiteCreatorClipImageEdit | null;
  onEnterClipImageEdit?: (edit: {
    kind?: "clip" | "imageFrame";
    clipId: string;
    imageId: string;
  }) => void;
  onClipImageTuneChange?: (
    tune: { focal: { x: number; y: number }; zoom: number },
    commit: boolean,
  ) => void;
  onResetClipImageEdit?: () => void;
  onExitClipImageEdit?: () => void;
  /** Vista de página: sin selección, edición, ni chrome de diseño. */
  readOnly?: boolean;
  groupFit?: { opportunity: GroupFitOpportunity; displayBounds: PageRect } | null;
  onGroupFit?: (action: { mode: "full" | "scale" | "content"; origin: "start" | "end" }) => void;
  sectionHeight?: { opportunity: SectionHeightOpportunity; displayBounds: PageRect } | null;
  onSectionHeight?: (mode: "content" | "viewport") => void;
  /** Alto de página de diseño (una pantalla), no el lienzo ya expandido. */
  pageScreenHeight?: number;
  /** Banda de alto de sección (Original / tablet / móvil). */
  heightBand?: SectionHeightBand;
  /** Tops de sección en el espacio del display (preview P / publicación). */
  sectionScrollStations?: SectionScrollStationPoint[];
  /** Rail vertical de secciones (edición). */
  sectionSpine?: {
    stations: SectionSpineStation[];
    addSectionY: number | null;
    canAddSection: boolean;
  } | null;
  onSpineSelectSection?: (sectionId: string) => void;
  onSpineRemoveSection?: (sectionId: string) => void;
  onSpineAddSection?: () => void;
  onSpineScrollChange?: (fromId: string | null, toId: string, kind: SiteSectionScrollKind) => void;
  onSpineHeightModeChange?: (sectionId: string, mode: SiteSectionHeightMode) => void;
  onSpineCustomHeightChange?: (sectionId: string, heightPx: number) => void;
}

function ResizeHandle({
  side,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  side: "left" | "right";
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>, side: "left" | "right") => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={side === "left" ? "Redimensionar ancho izquierdo" : "Redimensionar ancho derecho"}
      data-testid={`site-creator-resize-${side}`}
      className="site-creator-viewport-resize group absolute top-0 z-[6] flex h-full w-3 cursor-ew-resize items-center justify-center"
      style={{ [side]: -6 } as React.CSSProperties}
      onPointerDown={(e) => onPointerDown(e, side)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <span className="pointer-events-none h-full w-px bg-white/15 transition group-hover:bg-white/45" />
      <span className="pointer-events-none absolute h-6 w-1 rounded-sm bg-white/0 transition group-hover:bg-white/35" />
    </div>
  );
}

export function SiteCreatorPreview({
  page,
  viewportWidth,
  referenceWidth,
  previewZoom,
  deviceFrame = null,
  onViewportWidthChange,
  onAvailableSizeChange,
  selection,
  selectionIndex,
  blueprint = null,
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
  onCanvasBackgroundDoubleClick,
  objectClipById,
  floatingPortalHost = null,
  transformEnabled = false,
  transformBounds = null,
  onTransformCommit,
  focalLayerId = null,
  onFocalPoint,
  onCancelFocal,
  clipImageEdit = null,
  onEnterClipImageEdit,
  onClipImageTuneChange,
  onResetClipImageEdit,
  onExitClipImageEdit,
  readOnly = false,
  groupFit = null,
  onGroupFit,
  sectionHeight = null,
  onSectionHeight,
  pageScreenHeight,
  heightBand = "wide",
  sectionScrollStations = [],
  sectionSpine = null,
  onSpineSelectSection,
  onSpineRemoveSection,
  onSpineAddSection,
  onSpineScrollChange,
  onSpineHeightModeChange,
  onSpineCustomHeightChange,
}: SiteCreatorPreviewProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const deviceScrollRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const [scrollTick, setScrollTick] = useState(0);
  const [deviceScrollTop, setDeviceScrollTop] = useState(0);
  const [frameTick, setFrameTick] = useState(0);
  const [scrollPad, setScrollPad] = useState(0);
  const [dragLabel, setDragLabel] = useState<string | null>(null);
  const lastAvailableSizeRef = useRef<{ width: number; height: number } | null>(null);
  const dragRef = useRef<{
    side: "left" | "right";
    startClientX: number;
    startWidth: number;
    pointerId: number;
  } | null>(null);
  const setDeviceScrollRef = useCallback((el: HTMLDivElement | null) => {
    deviceScrollRef.current = el;
    setDeviceScrollTop(el?.scrollTop ?? 0);
  }, []);

  const { width: pageWidth, height: pageHeight } = getPageDimensions(page);
  const objects = page.objects ?? [];

  const zoom = previewZoom > 0 ? previewZoom : 1;
  const deviceMode = deviceFrame != null;
  const layoutWidth = pageWidth;
  const layoutHeight = pageHeight;
  const screenScale = zoom;
  const contentDisplayWidth = Math.max(1, Math.round(layoutWidth * zoom));
  const contentDisplayHeight = Math.max(1, Math.round(layoutHeight * zoom));
  const showSpine = Boolean(
    !readOnly && sectionSpine && onSpineSelectSection && onSpineAddSection,
  );
  const spineGutterPx = showSpine ? SITE_CREATOR_SECTION_SPINE_GUTTER_PX : 0;
  const displayWidth = deviceMode
    ? Math.max(1, Math.round(deviceFrame.width * zoom))
    : contentDisplayWidth;
  const displayHeight = deviceMode
    ? Math.max(1, Math.round(deviceFrame.height * zoom))
    : contentDisplayHeight;

  const fontFamilies = useMemo(() => collectDesignerPageFontFamilies(page), [page]);

  useEffect(() => {
    if (!fontFamilies.length) return;
    void ensureGoogleFontPreviewBatchLoaded(fontFamilies).catch(() => undefined);
  }, [fontFamilies]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = () => {
      const measureEl = readOnly && scrollRef.current ? scrollRef.current : el;
      const size = measureSiteCreatorPreviewAvailableSize({
        clientWidth: measureEl.clientWidth,
        clientHeight: measureEl.clientHeight,
        fillViewport: readOnly,
      });
      const previous = lastAvailableSizeRef.current;
      if (previous && previous.width === size.width && previous.height === size.height) return;
      lastAvailableSizeRef.current = size;
      onAvailableSizeChange?.(size);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (scrollRef.current) ro.observe(scrollRef.current);
    return () => ro.disconnect();
  }, [onAvailableSizeChange, readOnly]);

  useEffect(() => {
    const bump = () => setScrollTick((n) => n + 1);
    const bumpDevice = () => {
      setDeviceScrollTop(deviceScrollRef.current?.scrollTop ?? 0);
      bump();
    };
    const outer = scrollRef.current;
    const inner = deviceScrollRef.current;
    outer?.addEventListener("scroll", bump, { passive: true });
    inner?.addEventListener("scroll", bumpDevice, { passive: true });
    return () => {
      outer?.removeEventListener("scroll", bump);
      inner?.removeEventListener("scroll", bumpDevice);
    };
  }, [deviceMode]);

  useEffect(() => {
    if (readOnly) return;
    const canvas = scrollRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      const inner = deviceScrollRef.current;
      if (
        !inner ||
        !shouldRedirectCanvasWheelToWorkArea({
          readOnly,
          ctrlOrMeta: event.ctrlKey || event.metaKey,
          innerScroller: inner,
          eventTarget: event.target,
        })
      ) {
        return;
      }
      event.preventDefault();
      applyWorkAreaWheelDelta(inner, { deltaX: event.deltaX, deltaY: event.deltaY });
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [deviceMode, readOnly]);

  const needsSectionScrollPad = Boolean(
    blueprint && sectionScrollNeedsViewportPad(blueprint, heightBand),
  );
  const stationsFnRef = useRef<() => { id: string; y: number }[]>(() => []);

  const liveScreenHeight = useCallback((): number => {
    if (deviceMode && deviceFrame) return Math.max(1, deviceFrame.height);
    const scroller = deviceMode ? deviceScrollRef.current : scrollRef.current;
    if (scroller && scroller.clientWidth > 1 && scroller.clientHeight > 1) {
      return liveViewportHeightInPageUnits({
        pageWidth,
        availableWidth: scroller.clientWidth,
        availableHeight: scroller.clientHeight,
      });
    }
    return Math.max(1, pageScreenHeight ?? pageHeight);
  }, [deviceFrame, deviceMode, pageHeight, pageScreenHeight, pageWidth]);

  useLayoutEffect(() => {
    if (!readOnly || !blueprint || !needsSectionScrollPad) {
      setScrollPad(0);
      return;
    }
    const scroller = deviceMode ? deviceScrollRef.current : scrollRef.current;
    if (!scroller) return;
    const update = () => {
      const last = lastDocumentSection(blueprint);
      if (!last) {
        setScrollPad(0);
        return;
      }
      if (sectionHeightModeForBand(blueprint, last, heightBand) === "viewport") {
        setScrollPad(0);
        return;
      }
      const station = sectionScrollStations.find((item) => item.id === last.id);
      const lastPageH =
        station?.height ??
        planSectionHeightLayout(blueprint, liveScreenHeight(), heightBand).ranges.at(-1)?.height ??
        Math.max(1, last.sourceRange.bottom - last.sourceRange.top);
      const stageH = stageRef.current?.getBoundingClientRect().height ?? contentDisplayHeight;
      const lastScreen = (lastPageH / Math.max(1, pageHeight)) * stageH;
      setScrollPad(Math.max(0, scroller.clientHeight - lastScreen));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(scroller);
    if (stageRef.current) ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, [
    blueprint,
    contentDisplayHeight,
    deviceMode,
    heightBand,
    liveScreenHeight,
    needsSectionScrollPad,
    pageHeight,
    readOnly,
    sectionScrollStations,
  ]);

  const sectionScrollPadEl =
    readOnly && needsSectionScrollPad && scrollPad > 0 ? (
      <div
        aria-hidden
        data-testid="site-creator-section-scroll-pad"
        className="pointer-events-none w-full shrink-0"
        style={{ height: scrollPad }}
      />
    ) : null;

  stationsFnRef.current = () => {
    const boxScroller = deviceMode ? deviceScrollRef.current : scrollRef.current;
    const stage = stageRef.current;
    if (!boxScroller || !stage || !blueprint) return [];
    const stageBox = stage.getBoundingClientRect();
    const scrollerBox = boxScroller.getBoundingClientRect();
    const screenH = liveScreenHeight();
    return listDocumentSections(blueprint).map((section) => {
      const yDoc =
        sectionScrollStations.find((item) => item.id === section.id)?.y ??
        sectionDisplayTop(blueprint, section.id, screenH, heightBand) ??
        section.sourceRange.top;
      const yOnStage = (yDoc / Math.max(1, pageHeight)) * stageBox.height;
      return {
        id: section.id,
        y: boxScroller.scrollTop + (stageBox.top + yOnStage - scrollerBox.top),
      };
    });
  };

  useEffect(() => {
    if (!readOnly || !blueprint || !needsSectionScrollPad) return;
    const scroller = deviceMode ? deviceScrollRef.current : scrollRef.current;
    if (!scroller) return;
    return bindSectionScroller({
      scroller,
      hops: listSectionScrollHops(blueprint, heightBand),
      stations: () => stationsFnRef.current(),
    });
  }, [blueprint, deviceMode, heightBand, needsSectionScrollPad, readOnly]);

  useEffect(() => {
    const onWin = () => setFrameTick((n) => n + 1);
    window.addEventListener("resize", onWin);
    return () => window.removeEventListener("resize", onWin);
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    const studio = viewportRef.current;
    if (!stage || !studio) return;
    let frame = 0;
    let lastGeometry = "";
    const bump = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const geometry = [
          stage.offsetWidth,
          stage.offsetHeight,
          studio.clientWidth,
          studio.clientHeight,
          deviceScrollRef.current?.clientWidth ?? 0,
          deviceScrollRef.current?.clientHeight ?? 0,
        ].join(":");
        if (geometry === lastGeometry) return;
        lastGeometry = geometry;
        setFrameTick((n) => n + 1);
      });
    };
    const ro = new ResizeObserver(bump);
    ro.observe(stage);
    ro.observe(studio);
    if (deviceScrollRef.current) ro.observe(deviceScrollRef.current);
    bump();
    return () => {
      ro.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [contentDisplayHeight, contentDisplayWidth, deviceMode, displayHeight, displayWidth, viewportWidth, zoom]);

  const floatingGeometry = useMemo((): FloatingChromeGeometry | null => {
    void scrollTick;
    void frameTick;
    const stage = stageRef.current;
    const studio = viewportRef.current;
    if (!stage || !studio || !microbar) return null;
    const stageBox = stage.getBoundingClientRect();
    const studioBox = studio.getBoundingClientRect();
    const pageFrameRect: PageRect = {
      x: stageBox.left,
      y: stageBox.top,
      width: stageBox.width,
      height: stageBox.height,
    };
    const studioViewportRect: PageRect = {
      x: studioBox.left,
      y: studioBox.top,
      width: studioBox.width,
      height: studioBox.height,
    };
    const stageSel = pageRectToStageRect(microbar.bounds, screenScale);
    const selectionClientRect: PageRect = {
      x: stageBox.left + stageSel.x,
      y: stageBox.top + stageSel.y,
      width: stageSel.width,
      height: stageSel.height,
    };
    const relevantContentClientRects = (microbar.avoidBounds ?? []).map((r) => {
      const s = pageRectToStageRect(r, screenScale);
      return {
        x: stageBox.left + s.x,
        y: stageBox.top + s.y,
        width: s.width,
        height: s.height,
      };
    });
    return {
      pageFrameRect,
      studioViewportRect,
      selectionClientRect,
      relevantContentClientRects,
    };
  }, [
    frameTick,
    microbar ? 1 : 0,
    microbar?.bounds.x,
    microbar?.bounds.y,
    microbar?.bounds.width,
    microbar?.bounds.height,
    microbar?.avoidBounds,
    screenScale,
    scrollTick,
  ]);

  const applyWidth = useCallback(
    (next: number) => {
      onViewportWidthChange?.(clampViewportWidth(next, referenceWidth));
    },
    [onViewportWidthChange, referenceWidth],
  );

  const onResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, side: "left" | "right") => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      onCanvasInteraction?.();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        side,
        startClientX: event.clientX,
        startWidth: viewportWidth,
        pointerId: event.pointerId,
      };
      setDragLabel(`${Math.round(viewportWidth)} px`);
    },
    [onCanvasInteraction, viewportWidth],
  );

  const onResizePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      const outward =
        drag.side === "right"
          ? event.clientX - drag.startClientX
          : drag.startClientX - event.clientX;
      const delta = viewportWidthDeltaFromCenteredEdgeDrag({
        deltaClientAlongOutward: outward,
        previewZoom: zoom,
      });
      const next = clampViewportWidth(drag.startWidth + delta, referenceWidth);
      applyWidth(next);
      setDragLabel(`${next} px`);
    },
    [applyWidth, referenceWidth, zoom],
  );

  const endResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    setDragLabel(null);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* noop */
    }
  }, []);

  const pageContent = (
    <div
      className="site-creator-preview-layout origin-top-left overflow-hidden"
      style={{
        width: layoutWidth,
        height: layoutHeight,
        transform: `scale(${zoom})`,
      }}
    >
      <div
        ref={pageRef}
        className={`site-creator-preview-page origin-top-left overflow-x-hidden ${
          readOnly ? "pointer-events-none" : ""
        }`}
        style={{
          width: pageWidth,
          height: pageHeight,
        }}
      >
        <DesignerPageCanvasView
          objects={objects}
          pageWidth={pageWidth}
          pageHeight={pageHeight}
          background={pageBackground(page)}
          objectClipById={objectClipById}
        />
        {!readOnly && selection && selectionIndex && onSelectionAction ? (
          <SiteCreatorSelectionSurface
            pageWidth={pageWidth}
            pageHeight={pageHeight}
            scale={screenScale}
            index={selectionIndex}
            blueprint={blueprint}
            pageAnchorRef={pageRef}
            captureRootRef={scrollRef}
            selection={selection}
            dispatch={onSelectionAction}
            unitOutlines={unitOutlines}
            hoverOutline={hoverOutline}
            contextOutlines={contextOutlines}
            sectionOutlines={sectionOutlines}
            ghostOutlines={ghostOutlines}
            onCanvasInteraction={onCanvasInteraction}
            onCanvasBackgroundDoubleClick={onCanvasBackgroundDoubleClick}
            transformEnabled={transformEnabled}
            transformBounds={transformBounds}
            onTransformCommit={onTransformCommit}
            focalLayerId={focalLayerId}
            onFocalPoint={onFocalPoint}
            onCancelFocal={onCancelFocal}
            clipImageEdit={clipImageEdit}
            onEnterClipImageEdit={onEnterClipImageEdit}
            onClipImageTuneChange={onClipImageTuneChange}
            onResetClipImageEdit={onResetClipImageEdit}
            onExitClipImageEdit={onExitClipImageEdit}
            groupFit={groupFit}
            onGroupFit={onGroupFit}
            sectionHeight={sectionHeight}
            onSectionHeight={onSectionHeight}
            floatingPortalHost={floatingPortalHost}
          />
        ) : null}
      </div>
    </div>
  );

  const spineLayer =
    showSpine && sectionSpine && onSpineSelectSection && onSpineAddSection ? (
      <div
        className="pointer-events-none absolute top-0 z-[45] overflow-visible"
        style={{
          width: spineGutterPx,
          height: deviceMode ? displayHeight : contentDisplayHeight,
          right: "100%",
          marginRight: SITE_CREATOR_SECTION_SPINE_PAGE_GAP_PX,
          clipPath: deviceMode ? "inset(0 -100vw 0 -100vw)" : undefined,
        }}
        data-testid="site-creator-section-spine-gutter"
        data-site-creator-floating-ui="true"
      >
        <div
          className="relative"
          style={{
            height: contentDisplayHeight,
            transform: deviceMode ? `translate3d(0, ${-deviceScrollTop}px, 0)` : undefined,
            willChange: deviceMode ? "transform" : undefined,
          }}
          data-testid="site-creator-section-spine-scroll-content"
          data-spine-scroll-offset={deviceMode ? deviceScrollTop : 0}
        >
          <SiteCreatorSectionSpine
            pageHeight={pageHeight}
            scale={zoom}
            stations={sectionSpine.stations}
            addSectionY={sectionSpine.addSectionY}
            canAddSection={sectionSpine.canAddSection}
            portalHost={floatingPortalHost}
            onSelectSection={onSpineSelectSection}
            onRemoveSection={(id) => onSpineRemoveSection?.(id)}
            onAddSection={onSpineAddSection}
            onScrollChange={(fromId, toId, kind) => onSpineScrollChange?.(fromId, toId, kind)}
            onHeightModeChange={(id, mode) => onSpineHeightModeChange?.(id, mode)}
            onCustomHeightChange={(id, px) => onSpineCustomHeightChange?.(id, px)}
          />
        </div>
      </div>
    ) : null;

  return (
    <div
      ref={viewportRef}
      className="site-creator-preview-viewport flex min-h-0 flex-1 flex-col"
      data-site-creator-viewport-width={viewportWidth}
      data-site-creator-preview-zoom={zoom}
      data-site-creator-layout-scale={1}
      data-site-creator-device-mode={deviceMode ? "1" : "0"}
      data-site-creator-page-preview={readOnly ? "1" : undefined}
    >
      {!readOnly && selection && selectionIndex && onSelectionAction && selection.isolationIds.length > 0 ? (
        <div className="site-creator-isolation-bar shrink-0 border-b border-white/10 bg-[#101820]">
          <SiteCreatorIsolationBreadcrumb
            index={selectionIndex}
            isolationIds={selection.isolationIds}
            onNavigate={(isolationIds) => onSelectionAction({ type: "setIsolation", isolationIds })}
          />
        </div>
      ) : null}
      <div
        ref={scrollRef}
        className={`site-creator-preview-scroll min-h-0 flex-1 ${
          readOnly
            ? "cursor-default overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable]"
            : "cursor-crosshair overflow-hidden"
        }`}
        onDoubleClick={(event) => {
          if (readOnly) return;
          if (!isSiteCreatorPreviewChromeBackgroundTarget(event.target)) return;
          event.preventDefault();
          event.stopPropagation();
          onCanvasBackgroundDoubleClick?.();
        }}
      >
        <div
          className={`site-creator-preview-scroll-inner flex min-h-full flex-col ${
            readOnly ? "items-stretch justify-stretch px-0 py-0" : "items-center px-8 py-8"
          }`}
        >
          <div className="relative">
            {spineLayer}
            <div
              className={`site-creator-preview-stage relative ${
                readOnly
                  ? "overflow-hidden border-0 bg-transparent shadow-none"
                  : "border border-white/12 bg-[#0e131a] shadow-[0_8px_28px_rgba(0,0,0,0.28)]"
              }`}
              style={
                readOnly
                  ? { width: "100%", height: contentDisplayHeight }
                  : { width: displayWidth, height: displayHeight }
              }
              data-site-creator-preview-scale={screenScale}
              data-testid="site-creator-preview-stage"
            >
              {!readOnly && !deviceMode ? (
                <>
                  <ResizeHandle
                    side="left"
                    onPointerDown={onResizePointerDown}
                    onPointerMove={onResizePointerMove}
                    onPointerUp={endResize}
                  />
                  <ResizeHandle
                    side="right"
                    onPointerDown={onResizePointerDown}
                    onPointerMove={onResizePointerMove}
                    onPointerUp={endResize}
                  />
                </>
              ) : null}
              {deviceMode ? (
                <div
                  ref={setDeviceScrollRef}
                  className="site-creator-device-scroll h-full w-full overflow-x-hidden overflow-y-auto [scrollbar-width:thin]"
                  data-testid="site-creator-device-scroll"
                >
                  <div
                    ref={stageRef}
                    className="site-creator-preview-page-host relative"
                    style={{ width: contentDisplayWidth, height: contentDisplayHeight }}
                  >
                    {pageContent}
                  </div>
                  {sectionScrollPadEl}
                </div>
              ) : (
                <div ref={stageRef} className="relative h-full w-full">
                  {pageContent}
                </div>
              )}
              {!readOnly ? (
              <SiteCreatorObjectMicrobar
                scale={screenScale}
                stageWidth={displayWidth}
                stageHeight={displayHeight}
                model={microbar}
                floatingGeometry={floatingGeometry}
                portalHost={floatingPortalHost}
                onNavigate={onMicrobarNavigate}
                onAction={onMicrobarAction}
              />
              ) : null}
              {dragLabel ? (
                <div
                  data-testid="site-creator-resize-label"
                  className="pointer-events-none absolute left-1/2 top-2 z-[8] -translate-x-1/2 rounded border border-white/15 bg-[#101820]/95 px-2 py-0.5 text-[10px] font-semibold text-white/80"
                >
                  {dragLabel}
                </div>
              ) : null}
            </div>
          </div>
          {deviceMode ? null : sectionScrollPadEl}
        </div>
      </div>
    </div>
  );
}
