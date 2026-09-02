"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClippingContainerObject, FreehandObject } from "../FreehandStudio";
import {
  canEnterContainer,
  canvasHitTestUnits,
  entriesUnderPoint,
  frontmostDirectHit,
  layerPickerHitsAtPoint,
  marqueeHits,
  resolveFrontmostHit,
} from "./site-creator-hit-test";
import { SiteCreatorLayerPicker } from "./SiteCreatorLayerPicker";
import { SiteCreatorSelectionOverlay } from "./SiteCreatorSelectionOverlay";
import { SiteCreatorIsolationBreadcrumb } from "./SiteCreatorSelectionToolbar";
import { SiteCreatorSectionHeightHandles } from "./SiteCreatorSectionHeightHandles";
import type { SectionHeightOpportunity } from "./site-creator-section-height";
import type {
  SiteCreatorSelectionAction,
  SiteCreatorSelectionIndex,
  SiteCreatorSelectionState,
} from "./site-creator-selection-types";
import type { SiteBlueprintV1 } from "./site-creator-types";
import { isolationUnits } from "./build-site-selection-index";
import {
  clientPointToPagePoint,
  normalizePageRect,
  type PagePoint,
} from "./site-creator-coordinate-space";
import { isSiteCreatorPreviewChromeBackgroundTarget } from "./site-creator-viewport";
import {
  formatItemCorrectionChip,
  itemGeometryFromDelta,
  itemTextBoxFromDelta,
  ITEM_FONT_SCALE_MAX,
  ITEM_FONT_SCALE_MIN,
} from "./site-creator-responsive-tunes";
import type { ItemTransformKind } from "./site-creator-text-frame";
import {
  imageFrameGeometryForSiteCreator,
  imageFrameContentForSiteCreator,
} from "./site-creator-image-frame";
import {
  CLIP_IMAGE_ZOOM_MAX,
  clampClipImageZoom,
  clipImageMinZoomFromRendered,
} from "./site-creator-clipping-resize";

const MARQUEE_THRESHOLD_PX = 4;

type TransformHandle = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

function resizeDeltaFromHandle(
  handle: TransformHandle,
  dx: number,
  dy: number,
): { dw: number; dh: number } {
  const dw =
    handle === "se" || handle === "ne" || handle === "e"
      ? dx
      : handle === "nw" || handle === "sw" || handle === "w"
        ? -dx
        : 0;
  const dh =
    handle === "se" || handle === "sw" || handle === "s"
      ? dy
      : handle === "nw" || handle === "ne" || handle === "n"
        ? -dy
        : 0;
  return { dw, dh };
}

function boxDeltaFromHandle(
  handle: TransformHandle,
  dx: number,
  dy: number,
): { dx: number; dy: number; dw: number; dh: number } {
  const { dw, dh } = resizeDeltaFromHandle(handle, dx, dy);
  const moveX = handle === "w" || handle === "nw" || handle === "sw" ? dx : 0;
  const moveY = handle === "n" || handle === "nw" || handle === "ne" ? dy : 0;
  return { dx: moveX, dy: moveY, dw, dh };
}

function isTypingKeyTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

const NUDGE_STEP_PX = 1;
const NUDGE_STEP_LARGE_PX = 10;

export type SiteCreatorClipImageEdit = {
  kind?: "clip" | "imageFrame";
  clipId: string;
  imageId: string;
  focal: { x: number; y: number };
  zoom: number;
};

type ClipImageDrag = {
  pointerId: number;
  start: PagePoint;
  rotation: number;
  mask: { x: number; y: number; width: number; height: number };
  image: { x: number; y: number; width: number; height: number };
  lastFocal: { x: number; y: number };
};

type PointerLike = {
  button: number;
  pointerId: number;
  clientX: number;
  clientY: number;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
  preventDefault(): void;
  composedPath?: () => EventTarget[];
};

function isEventFromFloatingUi(event: { target: EventTarget | null }): boolean {
  const withPath = event as { composedPath?: () => EventTarget[] };
  const path = typeof withPath.composedPath === "function" ? withPath.composedPath() : [];
  for (const n of path) {
    if (n instanceof HTMLElement && n.dataset?.siteCreatorFloatingUi === "true") {
      return true;
    }
  }
  return false;
}

function shouldIgnoreCaptureTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  if (target.closest("[data-site-creator-floating-ui]")) return true;
  if (target.closest(".site-creator-viewport-resize")) return true;
  if (target.closest(".site-creator-selection-surface")) return true;
  if (target.closest("[data-testid^='site-creator-transform-']")) return true;
  return false;
}

function clientToPage(
  svg: SVGSVGElement | null,
  stage: HTMLElement | null,
  pageAnchor: HTMLElement | null,
  scale: number,
  clientX: number,
  clientY: number,
): PagePoint | null {
  const anchor = pageAnchor ?? stage;
  if (anchor) {
    const rect = anchor.getBoundingClientRect();
    return clientPointToPagePoint(clientX, clientY, rect, scale);
  }
  if (svg) {
    const ctm = svg.getScreenCTM();
    if (ctm) {
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const mapped = pt.matrixTransform(ctm.inverse());
      return { x: mapped.x, y: mapped.y };
    }
  }
  return null;
}

function isPointOnPage(point: PagePoint, pageWidth: number, pageHeight: number): boolean {
  return point.x >= 0 && point.y >= 0 && point.x <= pageWidth && point.y <= pageHeight;
}

function clamp(min: number, value: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clipImageEditMinZoom(
  edit: SiteCreatorClipImageEdit,
  index: SiteCreatorSelectionIndex,
): number {
  if (edit.kind === "imageFrame") return 1;
  const clipEntry = index.byId[edit.clipId];
  const imageEntry = index.byId[edit.imageId];
  const clip = clipEntry?.object as ClippingContainerObject | undefined;
  const image = imageEntry?.object;
  if (!clip || clip.type !== "clippingContainer" || image?.type !== "image") return 1;
  return clipImageMinZoomFromRendered({
    image: { width: Math.max(1, image.width), height: Math.max(1, image.height) },
    mask: {
      width: Math.max(1, clip.mask.width),
      height: Math.max(1, clip.mask.height),
    },
    currentZoom: edit.zoom,
  });
}

function directClipImage(
  entry: SiteCreatorSelectionIndex["entries"][number] | undefined,
): FreehandObject | null {
  if (!entry || entry.type !== "clippingContainer") return null;
  const clip = entry.object as ClippingContainerObject;
  return clip.content.find((child) => child.type === "image") ?? null;
}

function imageEditTarget(
  entry: SiteCreatorSelectionIndex["entries"][number] | undefined,
): {
  kind?: "clip" | "imageFrame";
  clipId: string;
  imageId: string;
} | null {
  const clipImage = directClipImage(entry);
  if (entry && clipImage) {
    return {
      clipId: entry.layerId,
      imageId: clipImage.id,
    };
  }
  if (entry && imageFrameContentForSiteCreator(entry.object)) {
    return {
      kind: "imageFrame",
      clipId: entry.layerId,
      imageId: entry.layerId,
    };
  }
  return null;
}

function focalForClipDrag(drag: ClipImageDrag, point: PagePoint): { x: number; y: number } {
  const dx = point.x - drag.start.x;
  const dy = point.y - drag.start.y;
  const radians = (drag.rotation * Math.PI) / 180;
  const localDx = dx * Math.cos(radians) + dy * Math.sin(radians);
  const localDy = -dx * Math.sin(radians) + dy * Math.cos(radians);
  const maskRight = drag.mask.x + drag.mask.width;
  const maskBottom = drag.mask.y + drag.mask.height;
  const x = clamp(maskRight - drag.image.width, drag.image.x + localDx, drag.mask.x);
  const y = clamp(maskBottom - drag.image.height, drag.image.y + localDy, drag.mask.y);
  return {
    x:
      drag.image.width <= drag.mask.width + 0.01
        ? 0.5
        : clamp(0, (drag.mask.x + drag.mask.width / 2 - x) / drag.image.width, 1),
    y:
      drag.image.height <= drag.mask.height + 0.01
        ? 0.5
        : clamp(0, (drag.mask.y + drag.mask.height / 2 - y) / drag.image.height, 1),
  };
}

export interface SiteCreatorUnitOutline {
  bounds: { x: number; y: number; width: number; height: number };
  label?: string | null;
  kind?: "layer" | "component" | "section" | "group";
}

export interface SiteCreatorSelectionSurfaceProps {
  pageWidth: number;
  pageHeight: number;
  scale: number;
  index: SiteCreatorSelectionIndex;
  /** Para promover hijos de carpetas desagrupadas en hit-test del lienzo. */
  blueprint?: SiteBlueprintV1 | null;
  /** Solo para aislamiento Designer (groupContainer) y hover de capa cruda. */
  selection: SiteCreatorSelectionState;
  dispatch: (action: SiteCreatorSelectionAction) => void;
  unitOutlines?: SiteCreatorUnitOutline[];
  hoverOutline?: SiteCreatorUnitOutline | null;
  contextOutlines?: SiteCreatorUnitOutline[];
  sectionOutlines?: SiteCreatorUnitOutline[];
  ghostOutlines?: import("./SiteCreatorSelectionOverlay").SiteCreatorGhostOutline[];
  onCanvasInteraction?: () => void;
  /** Doble clic en vacío del lienzo (sin capa bajo el puntero). */
  onCanvasBackgroundDoubleClick?: () => void;
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
  /** Borrador en vivo mientras se arrastra (mismo math que al soltar). */
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
  sectionHeight?: { opportunity: SectionHeightOpportunity; displayBounds: { x: number; y: number; width: number; height: number } } | null;
  onSectionHeight?: (mode: "content" | "viewport") => void;
  floatingPortalHost?: HTMLElement | null;
  /** Ancla de coordenadas de página (preview-page). */
  pageAnchorRef?: React.RefObject<HTMLElement | null>;
  /** Área scroll del preview; permite marquee desde fuera de la página. */
  captureRootRef?: React.RefObject<HTMLElement | null>;
  /**
   * En raíz, atraviesa imágenes frontales para alcanzar capas debajo (p. ej. sección).
   * Desactivar mientras se inspecciona un contenedor para poder elegir la imagen.
   */
  canvasHitPassthroughImages?: boolean;
  /** Recorte de preview (p. ej. carrusel MultiCard). */
  objectClipById?: Record<string, { x: number; y: number; width: number; height: number }>;
}

export function SiteCreatorSelectionSurface({
  pageWidth,
  pageHeight,
  scale,
  index,
  blueprint = null,
  selection,
  dispatch,
  unitOutlines = [],
  hoverOutline = null,
  contextOutlines = [],
  sectionOutlines = [],
  ghostOutlines = [],
  onCanvasInteraction,
  onCanvasBackgroundDoubleClick,
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
  sectionHeight = null,
  onSectionHeight,
  floatingPortalHost = null,
  pageAnchorRef,
  captureRootRef,
  canvasHitPassthroughImages = true,
  objectClipById,
}: SiteCreatorSelectionSurfaceProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const hoverRafRef = useRef<number | null>(null);
  const pendingHoverRef = useRef<string | null | undefined>(undefined);
  const lastHoverRef = useRef<string | null>(selection.hoverId);
  const [marqueeStart, setMarqueeStart] = useState<PagePoint | null>(null);
  const [marqueeNow, setMarqueeNow] = useState<PagePoint | null>(null);
  const [picker, setPicker] = useState<{
    x: number;
    y: number;
    entries: ReturnType<typeof layerPickerHitsAtPoint>;
  } | null>(null);
  const transformDragRef = useRef<{
    kind: "move" | "resize";
    pointerId: number;
    start: PagePoint;
    startBounds: { x: number; y: number; width: number; height: number };
    handle: TransformHandle;
  } | null>(null);
  const [transformLive, setTransformLive] = useState<{
    dx: number;
    dy: number;
    dw: number;
    dh: number;
    startBounds: { x: number; y: number; width: number; height: number };
  } | null>(null);
  const clipImageDragRef = useRef<ClipImageDrag | null>(null);
  const pointerSessionRef = useRef<{
    pointerId: number;
    start: PagePoint;
    additive: boolean;
    frontLayerId: string | null;
    fromChrome: boolean;
  } | null>(null);
  const chromePointerRef = useRef(false);

  const marqueeRect =
    marqueeStart && marqueeNow
      ? normalizePageRect(marqueeStart.x, marqueeStart.y, marqueeNow.x, marqueeNow.y)
      : null;

  const toPage = useCallback(
    (clientX: number, clientY: number) =>
      clientToPage(
        svgRef.current,
        stageRef.current,
        pageAnchorRef?.current ?? null,
        scale,
        clientX,
        clientY,
      ),
    [pageAnchorRef, scale],
  );

  const frontHitOptions = useMemo(
    () => ({ passthroughImages: canvasHitPassthroughImages, clipById: objectClipById }),
    [canvasHitPassthroughImages, objectClipById],
  );

  const resolveFrontHit = useCallback(
    (point: PagePoint) => {
      if (!isPointOnPage(point, pageWidth, pageHeight)) return null;
      const units = canvasHitTestUnits(index, selection.isolationIds, blueprint);
      const directHits = entriesUnderPoint(units, point, {
        directClickOnly: true,
        clipById: objectClipById,
      });
      return resolveFrontmostHit(directHits, frontHitOptions);
    },
    [blueprint, frontHitOptions, index, objectClipById, pageHeight, pageWidth, selection.isolationIds],
  );

  const handlePointerMove = useCallback(
    (event: PointerLike) => {
      const clipDrag = clipImageDragRef.current;
      if (clipDrag && event.pointerId === clipDrag.pointerId) {
        const point = toPage(event.clientX, event.clientY);
        if (!point || !clipImageEdit || !onClipImageTuneChange) return;
        event.preventDefault();
        const focal = focalForClipDrag(clipDrag, point);
        clipDrag.lastFocal = focal;
        onClipImageTuneChange({ focal, zoom: clipImageEdit.zoom }, false);
        return;
      }
      const drag = transformDragRef.current;
      if (drag && event.pointerId === drag.pointerId) {
        const point = toPage(event.clientX, event.clientY);
        if (!point) return;
        const dx = point.x - drag.start.x;
        const dy = point.y - drag.start.y;
        let next: {
          dx: number;
          dy: number;
          dw: number;
          dh: number;
          startBounds: { x: number; y: number; width: number; height: number };
        };
        if (drag.kind === "move") {
          next = { dx, dy, dw: 0, dh: 0, startBounds: drag.startBounds };
        } else if (transformKind === "textBox") {
          next = { ...boxDeltaFromHandle(drag.handle, dx, dy), startBounds: drag.startBounds };
        } else {
          const { dw, dh } = resizeDeltaFromHandle(drag.handle, dx, dy);
          next = { dx: 0, dy: 0, dw, dh, startBounds: drag.startBounds };
        }
        setTransformLive(next);
        onTransformLive?.({
          delta: { dx: next.dx, dy: next.dy, dw: next.dw, dh: next.dh },
          startBounds: next.startBounds,
        });
        return;
      }
      const session = pointerSessionRef.current;
      if (session && session.pointerId === event.pointerId && !marqueeStart) {
        const point = toPage(event.clientX, event.clientY);
        if (point) {
          const dx = (point.x - session.start.x) * scale;
          const dy = (point.y - session.start.y) * scale;
          if (Math.hypot(dx, dy) >= MARQUEE_THRESHOLD_PX) {
            setMarqueeStart(session.start);
            setMarqueeNow(point);
            return;
          }
        }
      }
      if (marqueeStart) {
        const point = toPage(event.clientX, event.clientY);
        if (point) setMarqueeNow(point);
        return;
      }
      const point = toPage(event.clientX, event.clientY);
      if (!point || !isPointOnPage(point, pageWidth, pageHeight)) {
        if (lastHoverRef.current != null) {
          lastHoverRef.current = null;
          dispatch({ type: "hover", layerId: null });
        }
        return;
      }
      const hit = frontmostDirectHit(
        index,
        selection.isolationIds,
        point,
        blueprint,
        frontHitOptions,
      );
      const nextHover = hit?.layerId ?? null;
      if (nextHover === lastHoverRef.current) return;
      pendingHoverRef.current = nextHover;
      if (hoverRafRef.current != null) return;
      hoverRafRef.current = window.requestAnimationFrame(() => {
        hoverRafRef.current = null;
        const pending = pendingHoverRef.current;
        pendingHoverRef.current = undefined;
        if (pending === undefined || pending === lastHoverRef.current) return;
        lastHoverRef.current = pending;
        dispatch({ type: "hover", layerId: pending });
      });
    },
    [
      blueprint,
      clipImageEdit,
      dispatch,
      frontHitOptions,
      index,
      onClipImageTuneChange,
      onTransformLive,
      pageHeight,
      pageWidth,
      scale,
      selection.isolationIds,
      toPage,
      transformKind,
    ],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      handlePointerMove(event);
    },
    [handlePointerMove],
  );

  useEffect(() => {
    lastHoverRef.current = selection.hoverId;
  }, [selection.hoverId]);

  useEffect(() => {
    return () => {
      if (hoverRafRef.current != null) {
        window.cancelAnimationFrame(hoverRafRef.current);
      }
    };
  }, []);

  const finishPointer = useCallback(
    (event: PointerLike) => {
      const clipDrag = clipImageDragRef.current;
      if (clipDrag && event.pointerId === clipDrag.pointerId) {
        const point = toPage(event.clientX, event.clientY);
        clipImageDragRef.current = null;
        if (!clipImageEdit || !onClipImageTuneChange) return;
        const focal = point ? focalForClipDrag(clipDrag, point) : clipDrag.lastFocal;
        onClipImageTuneChange({ focal, zoom: clipImageEdit.zoom }, true);
        return;
      }
      const drag = transformDragRef.current;
      if (drag && event.pointerId === drag.pointerId) {
        const end = toPage(event.clientX, event.clientY);
        transformDragRef.current = null;
        setTransformLive(null);
        onTransformLive?.(null);
        if (!end || !onTransformCommit) return;
        const dx = end.x - drag.start.x;
        const dy = end.y - drag.start.y;
        const meta = { startBounds: drag.startBounds };
        if (drag.kind === "move") {
          if (Math.hypot(dx, dy) < MARQUEE_THRESHOLD_PX) return;
          onTransformCommit({ dx, dy }, meta);
          return;
        }
        if (transformKind === "textBox") {
          const box = boxDeltaFromHandle(drag.handle, dx, dy);
          if (Math.hypot(box.dx, box.dy, box.dw, box.dh) < MARQUEE_THRESHOLD_PX) return;
          onTransformCommit(box, meta);
          return;
        }
        const { dw, dh } = resizeDeltaFromHandle(drag.handle, dx, dy);
        if (Math.hypot(dw, dh) < MARQUEE_THRESHOLD_PX) return;
        onTransformCommit({ dx: 0, dy: 0, dw, dh }, meta);
        return;
      }
      if (!marqueeStart && !pointerSessionRef.current) return;
      const end = toPage(event.clientX, event.clientY) ?? marqueeNow ?? marqueeStart!;
      const session = pointerSessionRef.current;
      const start = marqueeStart ?? session?.start;
      if (!start) return;

      pointerSessionRef.current = null;
      chromePointerRef.current = false;
      const dx = (end.x - start.x) * scale;
      const dy = (end.y - start.y) * scale;
      const rect = normalizePageRect(start.x, start.y, end.x, end.y);
      setMarqueeStart(null);
      setMarqueeNow(null);
      const additive = event.ctrlKey || event.metaKey || Boolean(session?.additive);

      if (Math.hypot(dx, dy) >= MARQUEE_THRESHOLD_PX) {
        const hits = marqueeHits(index, selection.isolationIds, rect, blueprint);
        dispatch({
          type: "marquee",
          layerIds: hits.map((entry) => entry.layerId),
          additive,
        });
        return;
      }

      if (!session) return;
      if (session.frontLayerId) {
        dispatch({ type: "click", layerId: session.frontLayerId, additive: session.additive });
        return;
      }
      if (!session.additive) {
        dispatch({ type: "click", layerId: null, additive: false });
      }
    },
    [
      blueprint,
      clipImageEdit,
      dispatch,
      index,
      marqueeNow,
      marqueeStart,
      onClipImageTuneChange,
      onTransformCommit,
      onTransformLive,
      scale,
      selection.isolationIds,
      toPage,
      transformKind,
    ],
  );

  const finishMarquee = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      finishPointer(event);
    },
    [finishPointer],
  );

  const beginPointerSession = useCallback(
    (event: PointerLike, captureEl: Element, frontLayerId: string | null, fromChrome: boolean) => {
      const point = toPage(event.clientX, event.clientY);
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
      chromePointerRef.current = fromChrome;
      pointerSessionRef.current = {
        pointerId: event.pointerId,
        start: point,
        additive: event.ctrlKey || event.metaKey,
        frontLayerId,
        fromChrome,
      };
      if (typeof captureEl.setPointerCapture === "function") {
        captureEl.setPointerCapture(event.pointerId);
      }
      if (event.ctrlKey || event.metaKey) event.preventDefault();
    },
    [toPage],
  );

  const handlePointerDown = useCallback(
    (event: PointerLike, captureEl: Element, opts?: { chromeOnly?: boolean }) => {
      if (event.button === 2) return;
      if (isEventFromFloatingUi(event)) return;
      if (opts?.chromeOnly) {
        if (shouldIgnoreCaptureTarget(event.target)) return;
        if (!isSiteCreatorPreviewChromeBackgroundTarget(event.target)) return;
      }

      onCanvasInteraction?.();
      const point = toPage(event.clientX, event.clientY);
      if (!point) return;
      const units = canvasHitTestUnits(index, selection.isolationIds, blueprint);
      const cycleHits = isPointOnPage(point, pageWidth, pageHeight)
        ? entriesUnderPoint(units, point, { directClickOnly: false })
        : [];
      const additive = event.ctrlKey || event.metaKey;

      if (event.altKey) {
        event.preventDefault();
        dispatch({
          type: "cycle",
          layerIdsUnderPoint: cycleHits.map((entry) => entry.layerId),
          x: point.x,
          y: point.y,
        });
        return;
      }

      const front = resolveFrontHit(point);

      if (clipImageEdit) {
        const clipEntry = index.byId[clipImageEdit.clipId];
        const imageEntry = index.byId[clipImageEdit.imageId];
        const clip = clipEntry?.object as ClippingContainerObject | undefined;
        const image = imageEntry?.object;
        const frameGeometry =
          clipImageEdit.kind === "imageFrame"
            ? imageFrameGeometryForSiteCreator(clipEntry?.object)
            : null;
        const editGeometry = frameGeometry
          ? frameGeometry
          : clipEntry &&
              clip &&
              image?.type === "image"
            ? {
                rotation: clip.rotation ?? 0,
                mask: {
                  x: clip.mask.x,
                  y: clip.mask.y,
                  width: Math.max(1, clip.mask.width),
                  height: Math.max(1, clip.mask.height),
                },
                image: {
                  x: image.x,
                  y: image.y,
                  width: Math.max(1, image.width),
                  height: Math.max(1, image.height),
                },
              }
            : null;
        if (
          clipEntry &&
          editGeometry &&
          point.x >= clipEntry.visualBounds.x &&
          point.y >= clipEntry.visualBounds.y &&
          point.x <= clipEntry.visualBounds.x + clipEntry.visualBounds.width &&
          point.y <= clipEntry.visualBounds.y + clipEntry.visualBounds.height
        ) {
          event.preventDefault();
          clipImageDragRef.current = {
            pointerId: event.pointerId,
            start: point,
            rotation: editGeometry.rotation,
            mask: editGeometry.mask,
            image: editGeometry.image,
            lastFocal: clipImageEdit.focal,
          };
          if (typeof captureEl.setPointerCapture === "function") {
            captureEl.setPointerCapture(event.pointerId);
          }
        } else {
          onExitClipImageEdit?.();
        }
        return;
      }

      if (focalLayerId) {
        event.preventDefault();
        const bounds = index.byId[focalLayerId]?.visualBounds;
        if (bounds && onFocalPoint && isPointOnPage(point, pageWidth, pageHeight)) {
          const x = (point.x - bounds.x) / Math.max(1, bounds.width);
          const y = (point.y - bounds.y) / Math.max(1, bounds.height);
          onFocalPoint({
            x: Math.min(1, Math.max(0, x)),
            y: Math.min(1, Math.max(0, y)),
          });
        } else {
          onCancelFocal?.();
        }
        return;
      }

      if (
        transformEnabled &&
        transformBounds &&
        onTransformCommit &&
        !additive
      ) {
        const b = transformBounds;
        const inside =
          point.x >= b.x &&
          point.x <= b.x + b.width &&
          point.y >= b.y &&
          point.y <= b.y + b.height;
        if (inside) {
          transformDragRef.current = {
            kind: "move",
            pointerId: event.pointerId,
            start: point,
            startBounds: transformBounds,
            handle: "se",
          };
          if (typeof captureEl.setPointerCapture === "function") {
            captureEl.setPointerCapture(event.pointerId);
          }
          return;
        }
      }

      beginPointerSession(event, captureEl, front?.layerId ?? null, Boolean(opts?.chromeOnly));
    },
    [
      beginPointerSession,
      blueprint,
      clipImageEdit,
      dispatch,
      focalLayerId,
      index,
      onCancelFocal,
      onCanvasInteraction,
      onFocalPoint,
      onExitClipImageEdit,
      onTransformCommit,
      pageHeight,
      pageWidth,
      resolveFrontHit,
      selection.isolationIds,
      selection.selectedIds,
      toPage,
      transformBounds,
      transformEnabled,
    ],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      handlePointerDown(event, event.currentTarget);
    },
    [handlePointerDown],
  );

  const onDoubleClick = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (isEventFromFloatingUi(event)) return;
      const point = toPage(event.clientX, event.clientY);
      if (!point) return;
      const hit = frontmostDirectHit(
        index,
        selection.isolationIds,
        point,
        blueprint,
        frontHitOptions,
      );
      if (!hit) {
        event.preventDefault();
        event.stopPropagation();
        onCanvasBackgroundDoubleClick?.();
        return;
      }
      const editTarget = onEnterClipImageEdit
        ? imageEditTarget(hit)
        : null;
      if (editTarget && onEnterClipImageEdit) {
        event.preventDefault();
        event.stopPropagation();
        onEnterClipImageEdit(editTarget);
        return;
      }
      // Designer groupContainer dive OR Studio handles blueprint inspect via special action
      if (canEnterContainer(hit, blueprint)) {
        const childHit = frontmostDirectHit(
          index,
          [...selection.isolationIds, hit.layerId],
          point,
          blueprint,
          frontHitOptions,
        );
        dispatch({
          type: "doubleClickEnter",
          containerId: hit.layerId,
          childId:
            childHit?.layerId ??
            isolationUnits(index, [...selection.isolationIds, hit.layerId])[0]?.layerId ??
            null,
        });
        return;
      }
      dispatch({ type: "doubleClickLayer", layerId: hit.layerId });
    },
    [
      blueprint,
      dispatch,
      frontHitOptions,
      index,
      onCanvasBackgroundDoubleClick,
      onEnterClipImageEdit,
      selection.isolationIds,
      toPage,
    ],
  );

  const onContextMenu = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (isEventFromFloatingUi(event)) return;
      // Ctrl+clic primario en macOS dispara contextmenu: no abrir picker.
      if (event.ctrlKey) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      const point = toPage(event.clientX, event.clientY);
      if (!point) return;
      const entries = layerPickerHitsAtPoint(
        index,
        selection.isolationIds,
        point,
        blueprint,
        objectClipById,
      );
      if (entries.length === 0) {
        setPicker(null);
        return;
      }
      setPicker({ x: event.clientX, y: event.clientY, entries });
    },
    [blueprint, index, objectClipById, selection.isolationIds, toPage],
  );

  useEffect(() => {
    const root = captureRootRef?.current;
    if (!root) return;

    const onDown = (event: PointerEvent) => {
      handlePointerDown(event, root, { chromeOnly: true });
    };
    const onMove = (event: PointerEvent) => {
      if (!chromePointerRef.current) return;
      handlePointerMove(event);
    };
    const onUp = (event: PointerEvent) => {
      if (!chromePointerRef.current) return;
      finishPointer(event);
    };

    root.addEventListener("pointerdown", onDown);
    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerup", onUp);
    root.addEventListener("pointercancel", onUp);

    return () => {
      root.removeEventListener("pointerdown", onDown);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerup", onUp);
      root.removeEventListener("pointercancel", onUp);
    };
  }, [
    captureRootRef,
    finishPointer,
    handlePointerDown,
    handlePointerMove,
  ]);

  // Los handles de resize capturan el puntero fuera del SVG: sin esto no hay
  // pointermove hasta soltar y el texto/caja no se actualizan en vivo.
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!transformDragRef.current) return;
      handlePointerMove(event);
    };
    const onUp = (event: PointerEvent) => {
      if (!transformDragRef.current) return;
      finishPointer(event);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [finishPointer, handlePointerMove]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (clipImageEdit) {
          onExitClipImageEdit?.();
          return;
        }
        if (focalLayerId) {
          onCancelFocal?.();
          return;
        }
        if (picker) {
          setPicker(null);
          return;
        }
        dispatch({ type: "escape" });
        return;
      }
      if (event.key === "Enter" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (isTypingKeyTarget(event.target)) return;
        dispatch({ type: "enterContainer" });
        return;
      }
      if (
        transformEnabled &&
        transformBounds &&
        onTransformCommit &&
        !clipImageEdit &&
        !focalLayerId &&
        (event.key === "ArrowLeft" ||
          event.key === "ArrowRight" ||
          event.key === "ArrowUp" ||
          event.key === "ArrowDown")
      ) {
        if (isTypingKeyTarget(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
        const step = event.shiftKey ? NUDGE_STEP_LARGE_PX : NUDGE_STEP_PX;
        const dx =
          event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy =
          event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        onTransformCommit({ dx, dy }, { startBounds: transformBounds });
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [
    clipImageEdit,
    dispatch,
    focalLayerId,
    onCancelFocal,
    onExitClipImageEdit,
    onTransformCommit,
    picker,
    transformBounds,
    transformEnabled,
  ]);

  useEffect(() => {
    if (!picker) return;
    const onClosePicker = () => setPicker(null);
    const timer = window.setTimeout(() => window.addEventListener("click", onClosePicker), 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("click", onClosePicker);
    };
  }, [picker]);

  const selectedClipEntry =
    selection.selectedIds.length === 1 ? index.byId[selection.selectedIds[0]!] : undefined;
  const selectedImageEditTarget = imageEditTarget(selectedClipEntry);
  const activeClipBounds = clipImageEdit
    ? index.byId[clipImageEdit.clipId]?.visualBounds ?? null
    : null;
  const clipImageMinZoom = clipImageEdit
    ? clipImageEditMinZoom(clipImageEdit, index)
    : 1;

  const transformPreview = (() => {
    if (!transformLive || !transformLive.startBounds) return null;
    const basis = transformLive.startBounds;
    const tune = {
      shiftX: transformCorrection?.shiftX ?? 0,
      shiftY: transformCorrection?.shiftY ?? 0,
      scale: transformCorrection?.scale ?? 1,
      boxW: transformCorrection?.boxW,
      boxH: transformCorrection?.boxH ?? undefined,
      fontScale: transformCorrection?.fontScale,
    };
    const predicted =
      transformKind === "textBox"
        ? {
            x: basis.x + transformLive.dx,
            y: basis.y + transformLive.dy,
            width: Math.max(8, basis.width + transformLive.dw),
            height: Math.max(8, basis.height + transformLive.dh),
          }
        : (() => {
            const geometry = itemGeometryFromDelta({
              tune,
              delta: transformLive,
              displayBounds: basis,
            });
            const scaleFactor = geometry.scale / Math.max(0.001, tune.scale || 1);
            return {
              x: basis.x + transformLive.dx,
              y: basis.y + transformLive.dy,
              width: Math.max(8, basis.width * scaleFactor),
              height: Math.max(8, basis.height * scaleFactor),
            };
          })();
    // Si el borrador en vivo ya movió el display (p. ej. reflujo de texto), seguir ese resultado.
    const liveApplied =
      Boolean(transformBounds) &&
      (transformBounds!.x !== basis.x ||
        transformBounds!.y !== basis.y ||
        transformBounds!.width !== basis.width ||
        transformBounds!.height !== basis.height);
    const bounds = liveApplied && transformBounds ? transformBounds : predicted;
    if (transformKind === "textBox") {
      const geometry = itemTextBoxFromDelta({
        tune,
        delta: transformLive,
        displayBounds: basis,
      });
      return {
        bounds,
        label: formatItemCorrectionChip({
          shiftX: geometry.shiftX,
          shiftY: geometry.shiftY,
          boxW: geometry.boxW,
          boxH: geometry.boxH ?? undefined,
          fontScale: tune.fontScale,
        }),
      };
    }
    const geometry = itemGeometryFromDelta({
      tune,
      delta: transformLive,
      displayBounds: basis,
    });
    return {
      bounds,
      label: formatItemCorrectionChip(geometry),
    };
  })();

  const transformHandleSpecs = (() => {
    const b = transformPreview?.bounds ?? transformBounds;
    if (!b || transformKind === "textFontOnly") return [];
    if (transformKind === "textBox") {
      const specs: Array<{ handle: TransformHandle; left: number; top: number; cursor: string }> = [
        { handle: "n", left: b.x + b.width / 2, top: b.y, cursor: "ns-resize" },
        { handle: "s", left: b.x + b.width / 2, top: b.y + b.height, cursor: "ns-resize" },
      ];
      if (!textBoxLockWidth) {
        specs.push(
          { handle: "w", left: b.x, top: b.y + b.height / 2, cursor: "ew-resize" },
          { handle: "e", left: b.x + b.width, top: b.y + b.height / 2, cursor: "ew-resize" },
          { handle: "nw", left: b.x, top: b.y, cursor: "nwse-resize" },
          { handle: "ne", left: b.x + b.width, top: b.y, cursor: "nesw-resize" },
          { handle: "sw", left: b.x, top: b.y + b.height, cursor: "nesw-resize" },
          { handle: "se", left: b.x + b.width, top: b.y + b.height, cursor: "nwse-resize" },
        );
      }
      return specs;
    }
    return [
      { handle: "nw" as const, left: b.x + 8, top: b.y + 8, cursor: "nwse-resize" },
      { handle: "ne" as const, left: b.x + b.width - 8, top: b.y + 8, cursor: "nesw-resize" },
      { handle: "sw" as const, left: b.x + 8, top: b.y + b.height - 8, cursor: "nesw-resize" },
      { handle: "se" as const, left: b.x + b.width - 8, top: b.y + b.height - 8, cursor: "nwse-resize" },
    ];
  })();

  const showFontSlider =
    Boolean(onFontScale) &&
    (transformKind === "textBox" || transformKind === "textFontOnly") &&
    !transformLive;
  const fontPct = Math.round(
    Math.max(ITEM_FONT_SCALE_MIN, Math.min(ITEM_FONT_SCALE_MAX, fontScale)) * 100,
  );
  const transformChromeBounds = transformPreview?.bounds ?? transformBounds;

  return (
    <div
      ref={stageRef}
        className="site-creator-selection-surface absolute inset-0 overflow-visible"
      onPointerLeave={() => dispatch({ type: "hover", layerId: null })}
    >
      <svg
        ref={svgRef}
        className={`absolute inset-0 z-[2] block h-full w-full ${
          clipImageEdit ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair"
        }`}
        viewBox={`0 0 ${pageWidth} ${pageHeight}`}
        preserveAspectRatio="none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishMarquee}
        onPointerCancel={finishMarquee}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
      >
        <rect width={pageWidth} height={pageHeight} fill="transparent" />
      </svg>
      <SiteCreatorSelectionOverlay
        pageWidth={pageWidth}
        pageHeight={pageHeight}
        index={index}
        selection={selection}
        marquee={marqueeRect}
        hoverName={null}
        unitOutlines={unitOutlines}
        hoverOutline={hoverOutline}
        contextOutlines={contextOutlines}
        sectionOutlines={sectionOutlines}
        ghostOutlines={ghostOutlines}
      />
      {clipImageEdit && activeClipBounds ? (
        <svg
          className="pointer-events-none absolute inset-0 z-[3] block h-full w-full"
          viewBox={`0 0 ${pageWidth} ${pageHeight}`}
          preserveAspectRatio="none"
          data-testid="site-creator-clip-image-overlay"
        >
          <path
            d={`M0 0H${pageWidth}V${pageHeight}H0Z M${activeClipBounds.x} ${activeClipBounds.y}H${activeClipBounds.x + activeClipBounds.width}V${activeClipBounds.y + activeClipBounds.height}H${activeClipBounds.x}Z`}
            fill="rgba(7,12,18,0.48)"
            fillRule="evenodd"
          />
          <rect
            x={activeClipBounds.x}
            y={activeClipBounds.y}
            width={activeClipBounds.width}
            height={activeClipBounds.height}
            fill="none"
            stroke="#A8FF32"
            strokeWidth={Math.max(1, 1 / Math.max(0.25, scale))}
            strokeDasharray={`${4 / Math.max(0.25, scale)} ${3 / Math.max(0.25, scale)}`}
          />
        </svg>
      ) : null}
      {sectionHeight && onSectionHeight ? (
        <SiteCreatorSectionHeightHandles
          opportunity={sectionHeight.opportunity}
          displayBounds={sectionHeight.displayBounds}
          onChange={onSectionHeight}
          portalHost={floatingPortalHost}
          pageAnchorRef={pageAnchorRef}
          pageWidth={pageWidth}
          pageHeight={pageHeight}
        />
      ) : null}
      {focalLayerId ? (
        <div
          className="pointer-events-none absolute left-1/2 top-3 z-[5] -translate-x-1/2 rounded border border-white/15 bg-[#101820]/90 px-2 py-1 text-[10px] font-semibold text-white/80"
          data-testid="site-creator-focal-hint"
        >
          Clic en la imagen para el punto focal · Esc cancela
        </div>
      ) : null}
      {clipImageEdit ? (
        <div
          className="pointer-events-auto absolute left-1/2 top-3 z-[6] flex -translate-x-1/2 items-center gap-1 rounded-md border border-white/15 bg-[#101820]/95 p-1 text-[10px] font-semibold text-white shadow-xl"
          data-testid="site-creator-clip-image-toolbar"
          data-site-creator-floating-ui="true"
        >
          <span className="px-1.5 text-white/75">Arrastra para encuadrar</span>
          <button
            type="button"
            aria-label="Alejar imagen"
            disabled={clipImageEdit.zoom <= clipImageMinZoom + 0.001}
            className="rounded px-1.5 py-0.5 text-white/70 hover:bg-white/10 disabled:opacity-30"
            onClick={() =>
              onClipImageTuneChange?.(
                {
                  focal: clipImageEdit.focal,
                  zoom: clampClipImageZoom(clipImageEdit.zoom - 0.1, clipImageMinZoom),
                },
                true,
              )
            }
          >
            −
          </button>
          <span className="min-w-9 text-center tabular-nums text-white/60">
            {Math.round(clipImageEdit.zoom * 100)}%
          </span>
          <button
            type="button"
            aria-label="Acercar imagen"
            disabled={clipImageEdit.zoom >= CLIP_IMAGE_ZOOM_MAX}
            className="rounded px-1.5 py-0.5 text-white/70 hover:bg-white/10 disabled:opacity-30"
            onClick={() =>
              onClipImageTuneChange?.(
                {
                  focal: clipImageEdit.focal,
                  zoom: clampClipImageZoom(clipImageEdit.zoom + 0.1, clipImageMinZoom),
                },
                true,
              )
            }
          >
            +
          </button>
          <button
            type="button"
            className="rounded px-2 py-0.5 text-white/65 hover:bg-white/10 hover:text-white"
            onClick={onResetClipImageEdit}
          >
            Restablecer
          </button>
          <button
            type="button"
            className="rounded bg-[#A8FF32] px-2 py-0.5 text-[#101820]"
            onClick={onExitClipImageEdit}
          >
            Hecho
          </button>
        </div>
      ) : selectedClipEntry && selectedImageEditTarget && onEnterClipImageEdit ? (
        <button
          type="button"
          className="pointer-events-auto absolute z-[5] rounded border border-white/15 bg-[#101820]/92 px-2 py-1 text-[10px] font-semibold text-white/80 shadow-lg hover:bg-[#18212c] hover:text-white"
          style={{
            left: selectedClipEntry.visualBounds.x + 8,
            top: selectedClipEntry.visualBounds.y + 8,
          }}
          data-testid="site-creator-edit-clip-image"
          data-site-creator-floating-ui="true"
          onClick={() =>
            onEnterClipImageEdit(selectedImageEditTarget)
          }
        >
          Editar encuadre
        </button>
      ) : null}
      {transformEnabled && transformChromeBounds ? (
        <div className="pointer-events-none absolute inset-0 z-[6]" data-testid="site-creator-transform">
          <div
            className="absolute rounded-[1px]"
            style={{
              left: transformChromeBounds.x,
              top: transformChromeBounds.y,
              width: transformChromeBounds.width,
              height: transformChromeBounds.height,
              boxShadow: "inset 0 0 0 1.5px #A8FF32",
            }}
          />
          {showFontSlider ? (
            <div
              data-testid="site-creator-font-scale"
              data-site-creator-floating-ui="true"
              className="pointer-events-auto absolute flex items-center gap-1.5 rounded-full border border-white/12 bg-[#101820]/75 px-2 py-1 shadow-md"
              style={{
                left: transformChromeBounds.x,
                top: Math.max(0, transformChromeBounds.y - 28),
                width: Math.min(168, Math.max(128, transformChromeBounds.width * 0.55)),
              }}
            >
              <span className="shrink-0 text-[9px] tabular-nums text-white/45">50</span>
              <input
                type="range"
                aria-label="Tamaño de letra (50% a 200%)"
                min={Math.round(ITEM_FONT_SCALE_MIN * 100)}
                max={Math.round(ITEM_FONT_SCALE_MAX * 100)}
                value={fontPct}
                className="site-creator-font-scale-input h-1.5 min-w-0 flex-1 cursor-ew-resize appearance-none rounded-full bg-white/30 accent-[#A8FF32] [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#A8FF32] [&::-webkit-slider-thumb]:shadow-[0_0_0_2px_rgba(16,24,32,0.85)] [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-[#A8FF32]"
                onPointerDown={(event) => event.stopPropagation()}
                onChange={(event) => onFontScale?.(Number(event.target.value) / 100)}
              />
              <span className="shrink-0 text-[9px] tabular-nums text-white/45">200</span>
              <span className="w-9 shrink-0 text-right text-[10px] font-semibold tabular-nums text-white/85">
                {fontPct}%
              </span>
            </div>
          ) : null}
          {transformPreview ? (
            <>
              <div
                className="absolute rounded-sm border border-dashed border-[#A8FF32]/80"
                style={{
                  left: transformPreview.bounds.x,
                  top: transformPreview.bounds.y,
                  width: transformPreview.bounds.width,
                  height: transformPreview.bounds.height,
                }}
              />
              <div
                data-testid="site-creator-transform-hud"
                className="absolute rounded border border-white/15 bg-[#101820]/92 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white/90 shadow-lg"
                style={{
                  left: transformPreview.bounds.x,
                  top: Math.max(0, transformPreview.bounds.y - 22),
                }}
              >
                {transformPreview.label}
              </div>
            </>
          ) : null}
          {transformHandleSpecs.map(({ handle, left, top, cursor }) => (
            <div
              key={handle}
              data-testid={`site-creator-transform-${handle}`}
              className="pointer-events-auto absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-[#A8FF32] bg-[#101820] shadow-[0_1px_6px_rgba(0,0,0,0.45)]"
              style={{ left, top, cursor }}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const point = toPage(event.clientX, event.clientY);
                if (!point || !transformBounds) return;
                transformDragRef.current = {
                  kind: "resize",
                  pointerId: event.pointerId,
                  start: point,
                  startBounds: transformBounds,
                  handle,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerUp={(event) => {
                finishMarquee(event as unknown as React.PointerEvent<SVGSVGElement>);
              }}
            />
          ))}
        </div>
      ) : null}
      {selection.isolationIds.length > 0 ? (
        <div className="pointer-events-none absolute left-0 right-0 top-0 z-[3]">
          <SiteCreatorIsolationBreadcrumb
            index={index}
            isolationIds={selection.isolationIds}
            onNavigate={(isolationIds) => dispatch({ type: "setIsolation", isolationIds })}
          />
        </div>
      ) : null}
      <SiteCreatorLayerPicker
        open={Boolean(picker)}
        x={picker?.x ?? 0}
        y={picker?.y ?? 0}
        entries={picker?.entries ?? []}
        index={index}
        onPick={(layerId) => dispatch({ type: "pickExact", layerId })}
        onClose={() => setPicker(null)}
      />
    </div>
  );
}
