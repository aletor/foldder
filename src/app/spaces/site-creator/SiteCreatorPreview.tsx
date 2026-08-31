"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import { collectDesignerPageFontFamilies } from "@/app/spaces/designer/designer-page-text-frame-sync";
import { ensureGoogleFontPreviewBatchLoaded } from "@/app/spaces/freehand/google-fonts-preview-loader";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";
import { getPageDimensions } from "@/app/spaces/indesign/page-formats";
import { DesignerPageCanvasView } from "@/app/spaces/presenter/DesignerPageCanvasView";
import { collectSemanticCoverageLayerIds } from "./site-blueprint-ownership";
import type { SiteCreatorSelectionUnit } from "./site-creator-display-labels";
import {
  SiteCreatorSelectionSurface,
  type SiteCreatorClipImageEdit,
  type SiteCreatorUnitOutline,
} from "./SiteCreatorSelectionSurface";
import type { ItemTransformKind } from "./site-creator-text-frame";
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
import { SiteCreatorMultiCardNavOverlay } from "./SiteCreatorMultiCardNav";
import type { MultiCardContainerLayout } from "./site-creator-multicard-layout";
import type {
  SiteCreatorSelectionAction,
  SiteCreatorSelectionIndex,
  SiteCreatorSelectionState,
} from "./site-creator-selection-types";
import type { SiteCreatorGhostOutline } from "./SiteCreatorSelectionOverlay";
import type { SiteCreatorPrimaryAction } from "./site-creator-contextual-actions";
import type {
  ResponsiveEditableBand,
  SiteBlueprintV1,
  SitePageInsetBandV1,
  SiteSectionHeightMode,
  SiteSectionScrollKind,
} from "./site-creator-types";
import {
  SiteCreatorSectionSpine,
  SITE_CREATOR_SECTION_SPINE_GUTTER_PX,
  SITE_CREATOR_SECTION_SPINE_PAGE_GAP_PX,
  type SectionSpineStation,
} from "./SiteCreatorSectionSpine";
import {
  SiteCreatorPageInsetRail,
  SITE_CREATOR_PAGE_INSET_RAIL_GUTTER_PX,
} from "./SiteCreatorPageInsetRail";
import type { ResolvedPageInsets } from "./site-creator-page-insets";
import {
  listDocumentSections,
  listSectionScrollHops,
  scrollFlowUsesKind,
} from "./site-creator-section-scroll";
import { bindSectionScroller } from "./site-creator-section-scroll-runtime";
import {
  pagePointFromClientRect,
  resolveMultiCardWheelTarget,
} from "./site-creator-multicard-wheel";
import {
  liveViewportHeightInPageUnits,
  sectionDisplayTop,
  type SectionHeightBand,
  type SectionScrollStationPoint,
} from "./site-creator-section-height";
import {
  clampViewportWidth,
  forwardWorkAreaWheelToScroller,
  isSiteCreatorPreviewChromeBackgroundTarget,
  measureSiteCreatorPreviewAvailableSize,
  resolveSiteCreatorDeviceChromeKind,
  shouldRedirectCanvasWheelToWorkArea,
  SITE_CREATOR_MIN_VIEWPORT_WIDTH,
  siteCreatorDeviceChrome,
  viewportWidthDeltaFromCenteredEdgeDrag,
  type SiteCreatorDeviceFrame,
} from "./site-creator-viewport";
import { ScrubNumberInput } from "@/app/spaces/ScrubNumberInput";

/** @deprecated Prefer numeric previewZoom (6A). Kept for import compatibility. */
export type SiteCreatorPreviewZoomMode = "fit" | 0.5 | 1;

function pageBackground(page: DesignerPageState): string {
  if (page.pageBackground === "black") return "#000000";
  if (page.pageBackground === "transparent") return "transparent";
  return "#fafafa";
}

function objectTreeTouchesPinned(obj: FreehandObject, pinnedIds: Set<string>): boolean {
  if (pinnedIds.has(obj.id)) return true;
  if (obj.type === "groupContainer" || obj.type === "booleanGroup") {
    return ((obj as { children?: FreehandObject[] }).children ?? []).some((child) =>
      objectTreeTouchesPinned(child, pinnedIds),
    );
  }
  if (obj.type === "clippingContainer") {
    const clip = obj as { mask?: FreehandObject; content?: FreehandObject[] };
    return [clip.mask, ...(clip.content ?? [])]
      .filter(Boolean)
      .some((child) => objectTreeTouchesPinned(child as FreehandObject, pinnedIds));
  }
  return false;
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
  deviceFrame?: SiteCreatorDeviceFrame | null;
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
  /** CSS de fondo de página detectado del Designer (color / degradado). */
  canvasBackground?: string | null;
  /** Clips por capa del layout responsive resuelto (6B.1). */
  objectClipById?: Record<string, { x: number; y: number; width: number; height: number }>;
  /** Carruseles MultiCard resueltos (flechas / rueda). */
  multiCardNav?: MultiCardContainerLayout[];
  onMultiCardScrollIndex?: (nodeId: string, index: number) => void;
  /** Hojas y recortes Dataset sobre el MultiCard. */
  datasetOverlay?: React.ReactNode;
  /** Recorte Dataset armado: el clic siguiente enlaza una capa compatible. */
  datasetChipArmed?: boolean;
  /** Host para portal de microbarra / popover (capa Studio sin clip). */
  floatingPortalHost?: HTMLElement | null;
  transformEnabled?: boolean;
  transformBounds?: { x: number; y: number; width: number; height: number } | null;
  transformKind?: ItemTransformKind;
  textBoxLockWidth?: boolean;
  transformCorrection?: {
    shiftX: number;
    shiftY: number;
    scale: number;
    boxW?: number;
    boxH?: number | null;
    fontScale?: number;
  } | null;
  onTransformCommit?: (
    delta: { dx: number; dy: number; dw?: number; dh?: number },
    meta: { startBounds: { x: number; y: number; width: number; height: number } },
  ) => void;
  onTransformLive?: (
    draft: {
      delta: { dx: number; dy: number; dw: number; dh: number };
      startBounds: { x: number; y: number; width: number; height: number };
    } | null,
  ) => void;
  fontScale?: number;
  onFontScale?: (value: number) => void;
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
  /** Tope CSS de la página en Preview Ordenador. Ausente = llenar el ancho. */
  previewPageMaxWidth?: number;
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
    mode?: "structure" | "device";
  } | null;
  onSpineSelectSection?: (sectionId: string) => void;
  onSpineRemoveSection?: (sectionId: string) => void;
  onSpineAddSection?: () => void;
  onSpineScrollChange?: (fromId: string | null, toId: string, kind: SiteSectionScrollKind) => void;
  onSpineHeightModeChange?: (sectionId: string, mode: SiteSectionHeightMode) => void;
  onSpineCustomHeightChange?: (sectionId: string, heightPx: number) => void;
  onSpineSourceRangeBottomChange?: (sectionId: string, bottom: number) => void;
  onSpinePinToTopChange?: (sectionId: string, pinToTop: boolean) => void;
  /** false mientras un contenedor semántico está inspeccionado (segundo clic en hijos). */
  canvasHitPassthroughImages?: boolean;
  /** Rail horizontal de márgenes de página (solo vistas de dispositivo). */
  pageInsets?: {
    band: ResponsiveEditableBand;
    insets: ResolvedPageInsets;
    designInsets?: SitePageInsetBandV1 | null;
  } | null;
  onPageInsetsChange?: (next: SitePageInsetBandV1) => void;
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
  canvasBackground = null,
  objectClipById,
  multiCardNav = [],
  onMultiCardScrollIndex,
  datasetOverlay = null,
  datasetChipArmed = false,
  floatingPortalHost = null,
  transformEnabled = false,
  transformBounds = null,
  transformKind = "uniform",
  textBoxLockWidth = false,
  transformCorrection = null,
  onTransformCommit,
  onTransformLive,
  fontScale = 1,
  onFontScale,
  focalLayerId = null,
  onFocalPoint,
  onCancelFocal,
  clipImageEdit = null,
  onEnterClipImageEdit,
  onClipImageTuneChange,
  onResetClipImageEdit,
  onExitClipImageEdit,
  readOnly = false,
  previewPageMaxWidth,
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
  onSpineSourceRangeBottomChange,
  onSpinePinToTopChange,
  canvasHitPassthroughImages = true,
  pageInsets = null,
  onPageInsetsChange,
}: SiteCreatorPreviewProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const deviceScrollRef = useRef<HTMLDivElement | null>(null);
  const pinOverlayRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const [scrollTick, setScrollTick] = useState(0);
  const [deviceScrollTop, setDeviceScrollTop] = useState(0);
  const [frameTick, setFrameTick] = useState(0);
  const [dragLabel, setDragLabel] = useState<string | null>(null);
  const lastAvailableSizeRef = useRef<{ width: number; height: number } | null>(null);
  const lastStudioGeometryRef = useRef("");
  const dragRef = useRef<{
    side: "left" | "right";
    startClientX: number;
    startWidth: number;
    pointerId: number;
  } | null>(null);
  const setDeviceScrollRef = useCallback((el: HTMLDivElement | null) => {
    deviceScrollRef.current = el;
    const next = el?.scrollTop ?? 0;
    setDeviceScrollTop((prev) => (Math.abs(prev - next) < 0.5 ? prev : next));
  }, []);

  const { width: pageWidth, height: pageHeight } = getPageDimensions(page);
  const zoom = previewZoom > 0 ? previewZoom : 1;
  const deviceMode = deviceFrame != null;

  const pinnedTopSection = useMemo(() => {
    if (!blueprint) return null;
    const first = listDocumentSections(blueprint)[0] ?? null;
    return first?.pinToTop ? first : null;
  }, [blueprint]);

  const pinnedLayerIds = useMemo(() => {
    if (!blueprint || !pinnedTopSection) return null;
    const ids = collectSemanticCoverageLayerIds(blueprint, pinnedTopSection.id);
    return ids.length ? new Set(ids) : null;
  }, [blueprint, pinnedTopSection]);

  const pinPreviewActive = Boolean(
    pinnedTopSection && pinnedLayerIds && (deviceMode || readOnly),
  );
  /** Preview P: overlay fuera del stage → sticky nativo. Dispositivo: sync DOM (overflow-hidden rompe sticky). */
  const pinOverlayUsesSticky = Boolean(pinPreviewActive && readOnly && !deviceMode);

  const syncPinOverlayToScroll = useCallback((scrollTop: number) => {
    const el = pinOverlayRef.current;
    if (!el) return;
    el.style.transform = scrollTop > 0.5 ? `translate3d(0, ${scrollTop}px, 0)` : "";
    el.dataset.pinScrollOffset = String(Math.round(scrollTop));
  }, []);

  const treeTouchesPinned = useCallback((obj: FreehandObject, coverage: Set<string>): boolean => {
    return objectTreeTouchesPinned(obj, coverage);
  }, []);

  const { objects, pinnedObjects, pinPageHeight, pinnedObjectClipById } = useMemo(() => {
    const base = page.objects ?? [];
    if (!pinPreviewActive || !pinnedLayerIds || !pinnedTopSection) {
      return {
        objects: base,
        pinnedObjects: null as FreehandObject[] | null,
        pinPageHeight: 0,
        pinnedObjectClipById: undefined as
          | Record<string, { x: number; y: number; width: number; height: number }>
          | undefined,
      };
    }
    const unpinned: FreehandObject[] = [];
    const pinned: FreehandObject[] = [];
    for (const obj of base) {
      if (treeTouchesPinned(obj, pinnedLayerIds)) pinned.push(obj);
      else unpinned.push(obj);
    }
    // Altura del layout ya resuelto (estación / clips), no sourceRange de Original:
    // en móvil el rango de diseño deja un hueco enorme bajo la cabecera.
    const stationH = sectionSpine?.stations.find(
      (station) => station.sectionId === pinnedTopSection.id,
    )?.height;
    let clipBottom = 0;
    if (objectClipById) {
      for (const layerId of pinnedLayerIds) {
        const clip = objectClipById[layerId];
        if (!clip) continue;
        clipBottom = Math.max(clipBottom, clip.y + clip.height);
      }
    }
    const pinH =
      (typeof stationH === "number" && stationH > 0 ? stationH : null) ??
      (clipBottom > 0.5 ? clipBottom : null) ??
      Math.max(1, pinnedTopSection.sourceRange.bottom - pinnedTopSection.sourceRange.top);
    const pinnedObjectClipById =
      objectClipById && pinnedLayerIds.size
        ? Object.fromEntries(
            Object.entries(objectClipById).filter(([layerId]) => pinnedLayerIds.has(layerId)),
          )
        : undefined;
    return {
      objects: unpinned,
      pinnedObjects: pinned.length ? pinned : null,
      pinPageHeight: Math.max(1, pinH),
      pinnedObjectClipById:
        pinnedObjectClipById && Object.keys(pinnedObjectClipById).length
          ? pinnedObjectClipById
          : undefined,
    };
  }, [
    pinPreviewActive,
    objectClipById,
    page.objects,
    pinnedLayerIds,
    pinnedTopSection,
    sectionSpine?.stations,
    treeTouchesPinned,
  ]);

  const pinDisplayHeight = Math.max(0, Math.round(pinPageHeight * zoom));
  const deviceChrome =
    !readOnly && deviceMode && deviceFrame
      ? siteCreatorDeviceChrome(resolveSiteCreatorDeviceChromeKind(deviceFrame))
      : null;
  const layoutWidth = pageWidth;
  const layoutHeight = pageHeight;
  const screenScale = zoom;
  const contentDisplayWidth = Math.max(1, Math.round(layoutWidth * zoom));
  const contentDisplayHeight = Math.max(1, Math.round(layoutHeight * zoom));
  const showSpine = Boolean(
    !readOnly && sectionSpine && onSpineSelectSection && onSpineAddSection,
  );
  const showInsetRail = Boolean(
    !readOnly && deviceMode && pageInsets && onPageInsetsChange,
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
    if (readOnly) return;
    const outer = scrollRef.current;
    const inner = deviceScrollRef.current;
    if (outer) {
      outer.scrollTop = 0;
      outer.scrollLeft = 0;
    }
    if (inner) {
      inner.scrollTop = 0;
      inner.scrollLeft = 0;
    }
    setDeviceScrollTop(0);
    syncPinOverlayToScroll(0);
    setScrollTick((n) => n + 1);
  }, [readOnly, deviceMode, deviceFrame?.width, deviceFrame?.height, previewZoom, syncPinOverlayToScroll]);

  useLayoutEffect(() => {
    if (!pinPreviewActive || pinOverlayUsesSticky) return;
    // Tras cada scroll/re-render React puede pisar style.transform; reaplicar en layout.
    syncPinOverlayToScroll(deviceScrollRef.current?.scrollTop ?? deviceScrollTop);
  }, [
    pinPreviewActive,
    pinOverlayUsesSticky,
    pinDisplayHeight,
    syncPinOverlayToScroll,
    deviceScrollTop,
  ]);

  useEffect(() => {
    const bump = () => setScrollTick((n) => n + 1);
    const onDeviceScroll = () => {
      const top = deviceScrollRef.current?.scrollTop ?? 0;
      if (!pinOverlayUsesSticky) syncPinOverlayToScroll(top);
      setDeviceScrollTop(top);
      bump();
    };
    const onPreviewScroll = () => bump();
    const outer = scrollRef.current;
    const inner = deviceScrollRef.current;
    outer?.addEventListener("scroll", onPreviewScroll, { passive: true });
    inner?.addEventListener("scroll", onDeviceScroll, { passive: true });
    onDeviceScroll();
    return () => {
      outer?.removeEventListener("scroll", onPreviewScroll);
      inner?.removeEventListener("scroll", onDeviceScroll);
    };
  }, [deviceMode, readOnly, pinPreviewActive, pinOverlayUsesSticky, syncPinOverlayToScroll]);

  useEffect(() => {
    if (readOnly) return;
    const canvas = scrollRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      const inner = deviceScrollRef.current;
      if (
        inner &&
        shouldRedirectCanvasWheelToWorkArea({
          readOnly,
          ctrlOrMeta: event.ctrlKey || event.metaKey,
          innerScroller: inner,
          eventTarget: event.target,
        })
      ) {
        event.preventDefault();
        forwardWorkAreaWheelToScroller(inner, {
          deltaX: event.deltaX,
          deltaY: event.deltaY,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
        });
        return;
      }
      if (deviceMode || readOnly || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      canvas.scrollTop = 0;
      canvas.scrollLeft = 0;
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [deviceMode, readOnly]);

  const stationsFnRef = useRef<() => { id: string; y: number }[]>(() => []);
  const multiCardNavRef = useRef(multiCardNav);
  multiCardNavRef.current = multiCardNav;

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

  const liveSectionScroll = Boolean(
    blueprint &&
      (deviceMode || readOnly) &&
      (scrollFlowUsesKind(blueprint, "smooth", heightBand) ||
        scrollFlowUsesKind(blueprint, "snap", heightBand)),
  );

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
    if (!liveSectionScroll || !blueprint) return;
    const scroller = deviceMode ? deviceScrollRef.current : scrollRef.current;
    if (!scroller) return;
    return bindSectionScroller({
      scroller,
      hops: listSectionScrollHops(blueprint, heightBand),
      stations: () => stationsFnRef.current(),
      pinPadPx: () => (pinPreviewActive ? pinDisplayHeight : 0),
      bindKeyboard: readOnly,
      shouldIgnoreWheel: (event) => {
        const pageEl = pageRef.current;
        if (!pageEl || multiCardNavRef.current.length === 0) return false;
        const point = pagePointFromClientRect(
          event.clientX,
          event.clientY,
          pageEl.getBoundingClientRect(),
          pageWidth,
          pageHeight,
        );
        if (!point) return false;
        return (
          resolveMultiCardWheelTarget(multiCardNavRef.current, point, {
            deltaX: event.deltaX,
            deltaY: event.deltaY,
            shiftKey: event.shiftKey,
          }) != null
        );
      },
    });
  }, [
    blueprint,
    deviceMode,
    heightBand,
    liveSectionScroll,
    pageHeight,
    pageWidth,
    pinDisplayHeight,
    pinPreviewActive,
    readOnly,
  ]);

  useEffect(() => {
    const onWin = () => setFrameTick((n) => n + 1);
    window.addEventListener("resize", onWin);
    return () => window.removeEventListener("resize", onWin);
  }, []);

  // After React commits a new stage size (zoom / device), remeasure the microbar.
  // Do not ResizeObserver the stage or device scroller: their size is React-driven
  // and observing them + setState looped (Maximum update depth) when fit zoom shifted.
  useLayoutEffect(() => {
    setFrameTick((n) => n + 1);
  }, [contentDisplayHeight, contentDisplayWidth, displayHeight, displayWidth, zoom, deviceMode]);

  useEffect(() => {
    const studio = viewportRef.current;
    if (!studio) return;
    let frame = 0;
    const bump = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const geometry = `${studio.clientWidth}:${studio.clientHeight}`;
        if (geometry === lastStudioGeometryRef.current) return;
        lastStudioGeometryRef.current = geometry;
        setFrameTick((n) => n + 1);
      });
    };
    const ro = new ResizeObserver(bump);
    ro.observe(studio);
    bump();
    return () => {
      ro.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

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
          background: canvasBackground || undefined,
        }}
      >
        <DesignerPageCanvasView
          objects={objects}
          pageWidth={pageWidth}
          pageHeight={pageHeight}
          background={canvasBackground ? "transparent" : pageBackground(page)}
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
            transformKind={transformKind}
            textBoxLockWidth={textBoxLockWidth}
            transformCorrection={transformCorrection}
            onTransformCommit={onTransformCommit}
            onTransformLive={onTransformLive}
            fontScale={fontScale}
            onFontScale={onFontScale}
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
            canvasHitPassthroughImages={canvasHitPassthroughImages}
            objectClipById={objectClipById}
          />
        ) : null}
        {datasetOverlay}
        {multiCardNav.length > 0 && onMultiCardScrollIndex ? (
          <SiteCreatorMultiCardNavOverlay
            containers={multiCardNav}
            pageWidth={pageWidth}
            pageHeight={pageHeight}
            scrollRootRef={scrollRef}
            extraScrollRootRef={deviceScrollRef}
            pageAnchorRef={pageRef}
            onScrollIndex={onMultiCardScrollIndex}
          />
        ) : null}
      </div>
    </div>
  );

  const pinnedHeaderOverlay =
    pinPreviewActive && pinnedObjects && pinDisplayHeight > 0 ? (
      <div
        ref={pinOverlayRef}
        className={`site-creator-section-pin-overlay pointer-events-none z-[100000] overflow-visible ${
          pinOverlayUsesSticky ? "sticky top-0" : "absolute left-0 top-0"
        }`}
        style={{
          height: pinDisplayHeight,
          width: contentDisplayWidth,
          ...(pinOverlayUsesSticky
            ? { marginBottom: -pinDisplayHeight }
            : {
                willChange: "transform",
                // Estilo React (no solo DOM): setDeviceScrollTop re-renderiza y
                // si transform solo vivía en el nodo, React lo borraba al scroll.
                transform:
                  deviceScrollTop > 0.5
                    ? `translate3d(0, ${deviceScrollTop}px, 0)`
                    : undefined,
              }),
        }}
        data-testid="site-creator-section-pin-overlay"
        data-pin-scroll-mode={pinOverlayUsesSticky ? "sticky" : "sync"}
        data-pin-scroll-offset={String(Math.round(deviceScrollTop))}
        aria-hidden
      >
        {/* Fondo transparente: el scroll debe verse bajo los picos de máscaras irregulares. */}
        <div
          className="origin-top-left overflow-visible"
          style={{
            width: pageWidth,
            height: pinPageHeight,
            transform: `scale(${zoom})`,
            background: "transparent",
          }}
          data-testid="site-creator-section-pin-surface"
        >
          <DesignerPageCanvasView
            objects={pinnedObjects}
            pageWidth={pageWidth}
            pageHeight={pinPageHeight}
            background="transparent"
            objectClipById={pinnedObjectClipById}
          />
        </div>
      </div>
    ) : null;

  const spineLayer =
    showSpine && sectionSpine && onSpineSelectSection && onSpineAddSection ? (
      <div
        className="pointer-events-none absolute top-0 z-[45] overflow-visible"
        style={{
          width: spineGutterPx,
          height: deviceMode ? displayHeight : contentDisplayHeight,
          right: "100%",
          marginRight:
            SITE_CREATOR_SECTION_SPINE_PAGE_GAP_PX - (deviceChrome?.bezelPx ?? 0),
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
            onSourceRangeBottomChange={(id, bottom) =>
              onSpineSourceRangeBottomChange?.(id, bottom)
            }
            onPinToTopChange={(id, pin) => onSpinePinToTopChange?.(id, pin)}
            mode={sectionSpine.mode}
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
      {!readOnly && deviceFrame?.kind === "monitor" && onViewportWidthChange ? (
        <div
          className="flex shrink-0 items-center justify-center gap-2 border-b border-white/10 bg-[#101820] px-3 py-1.5"
          data-testid="site-creator-monitor-max-width"
        >
          <label
            htmlFor="site-creator-monitor-max-width-input"
            className="text-[11px] font-medium text-white/55"
          >
            Ancho máximo:
          </label>
          <div className="flex items-stretch border border-white/12 bg-black/35">
            <ScrubNumberInput
              id="site-creator-monitor-max-width-input"
              value={viewportWidth}
              min={SITE_CREATOR_MIN_VIEWPORT_WIDTH}
              step={1}
              title="Arrastra horizontalmente para cambiar el valor · Mayús = ×10 · Clic para escribir"
              aria-label="Ancho máximo"
              onKeyboardCommit={(n) => applyWidth(n)}
              onScrubLive={(n) => applyWidth(n)}
              onScrubEnd={() => undefined}
              className="w-[4.5rem] cursor-ew-resize bg-transparent px-2 py-1 text-center font-mono text-[12px] tabular-nums text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span className="flex items-center border-l border-white/10 px-1.5 text-[10px] font-semibold text-white/40">
              px
            </span>
          </div>
        </div>
      ) : null}
      <div
        ref={scrollRef}
        data-site-creator-dataset-armed={datasetChipArmed ? "1" : undefined}
        className={`site-creator-preview-scroll min-h-0 flex-1 ${
          readOnly
            ? "cursor-default overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable]"
            : datasetChipArmed
              ? "cursor-copy overflow-hidden overscroll-none"
              : "cursor-crosshair overflow-hidden overscroll-none"
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
            readOnly
              ? "items-stretch justify-stretch px-0 py-0"
              : deviceMode
                ? "items-center justify-center px-8 py-8"
                : "items-center px-8 py-8"
          }`}
          style={
            showInsetRail
              ? { paddingTop: 32 + SITE_CREATOR_PAGE_INSET_RAIL_GUTTER_PX }
              : undefined
          }
        >
          <div
            className="relative"
            style={
              readOnly && pinPreviewActive
                ? {
                    width: "100%",
                    maxWidth: previewPageMaxWidth,
                    marginLeft: previewPageMaxWidth ? "auto" : undefined,
                    marginRight: previewPageMaxWidth ? "auto" : undefined,
                  }
                : undefined
            }
          >
            {readOnly && pinPreviewActive ? pinnedHeaderOverlay : null}
            {spineLayer}
            {showInsetRail && pageInsets && onPageInsetsChange ? (
              <div
                className="pointer-events-none absolute z-[46] overflow-visible"
                style={{
                  left: deviceChrome?.bezelPx ?? 0,
                  width: displayWidth,
                  top: -SITE_CREATOR_PAGE_INSET_RAIL_GUTTER_PX,
                  height: SITE_CREATOR_PAGE_INSET_RAIL_GUTTER_PX + displayHeight,
                }}
                data-testid="site-creator-page-inset-rail-host"
              >
                <SiteCreatorPageInsetRail
                  band={pageInsets.band}
                  layoutWidth={pageWidth}
                  scale={zoom}
                  pageScreenHeight={displayHeight}
                  insets={pageInsets.insets}
                  designInsets={pageInsets.designInsets}
                  onChange={onPageInsetsChange}
                />
              </div>
            ) : null}
            <div
              className={deviceChrome ? "site-creator-device-chrome" : undefined}
              data-testid={deviceChrome ? "site-creator-device-chrome" : undefined}
              data-device-kind={deviceChrome?.kind}
              style={
                deviceChrome
                  ? {
                      padding: deviceChrome.bezelPx,
                      borderRadius: deviceChrome.radiusPx,
                      background: deviceChrome.color,
                      boxShadow: deviceChrome.rim,
                    }
                  : undefined
              }
            >
            <div
              className={`site-creator-preview-stage relative ${
                readOnly
                  ? "overflow-hidden border-0 bg-transparent shadow-none"
                  : deviceChrome
                    ? "overflow-hidden border-0 bg-[#0e131a] shadow-none"
                    : "border border-white/12 bg-[#0e131a] shadow-[0_8px_28px_rgba(0,0,0,0.28)]"
              }`}
              style={
                readOnly
                  ? {
                      width: "100%",
                      maxWidth: previewPageMaxWidth,
                      marginLeft: previewPageMaxWidth ? "auto" : undefined,
                      marginRight: previewPageMaxWidth ? "auto" : undefined,
                      height: contentDisplayHeight,
                    }
                  : {
                      width: displayWidth,
                      height: displayHeight,
                      borderRadius: deviceChrome ? deviceChrome.innerRadiusPx : undefined,
                    }
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
                  className="site-creator-device-scroll relative h-full w-full overflow-x-hidden overflow-y-auto [scrollbar-width:thin]"
                  data-testid="site-creator-device-scroll"
                >
                  {pinnedHeaderOverlay}
                  <div
                    ref={stageRef}
                    className="site-creator-preview-page-host relative"
                    style={{ width: contentDisplayWidth, height: contentDisplayHeight }}
                  >
                    {pageContent}
                  </div>
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
          </div>
        </div>
      </div>
    </div>
  );
}
