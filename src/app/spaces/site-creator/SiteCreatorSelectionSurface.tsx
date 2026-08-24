"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { SiteCreatorGroupFitHandles } from "./SiteCreatorGroupFitHandles";
import { SiteCreatorSectionHeightHandles } from "./SiteCreatorSectionHeightHandles";
import type { GroupFitOpportunity } from "./site-creator-group-fit";
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

const MARQUEE_THRESHOLD_PX = 4;

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
  onTransformCommit?: (delta: { dx: number; dy: number; dw?: number; dh?: number }) => void;
  focalLayerId?: string | null;
  onFocalPoint?: (focal: { x: number; y: number }) => void;
  onCancelFocal?: () => void;
  groupFit?: { opportunity: GroupFitOpportunity; displayBounds: { x: number; y: number; width: number; height: number } } | null;
  onGroupFit?: (action: { mode: "full" | "scale" | "content"; origin: "start" | "end" }) => void;
  sectionHeight?: { opportunity: SectionHeightOpportunity; displayBounds: { x: number; y: number; width: number; height: number } } | null;
  onSectionHeight?: (mode: "content" | "viewport") => void;
  floatingPortalHost?: HTMLElement | null;
  /** Ancla de coordenadas de página (preview-page). */
  pageAnchorRef?: React.RefObject<HTMLElement | null>;
  /** Área scroll del preview; permite marquee desde fuera de la página. */
  captureRootRef?: React.RefObject<HTMLElement | null>;
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
  onTransformCommit,
  focalLayerId = null,
  onFocalPoint,
  onCancelFocal,
  groupFit = null,
  onGroupFit,
  sectionHeight = null,
  onSectionHeight,
  floatingPortalHost = null,
  pageAnchorRef,
  captureRootRef,
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
    handle: "se" | "e" | "s";
  } | null>(null);
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

  const resolveFrontHit = useCallback(
    (point: PagePoint) => {
      if (!isPointOnPage(point, pageWidth, pageHeight)) return null;
      const units = canvasHitTestUnits(index, selection.isolationIds, blueprint);
      const directHits = entriesUnderPoint(units, point, { directClickOnly: true });
      return resolveFrontmostHit(directHits);
    },
    [blueprint, index, pageHeight, pageWidth, selection.isolationIds],
  );

  const handlePointerMove = useCallback(
    (event: PointerLike) => {
      const drag = transformDragRef.current;
      if (drag && event.pointerId === drag.pointerId) {
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
      const hit = frontmostDirectHit(index, selection.isolationIds, point, blueprint);
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
    [blueprint, dispatch, index, marqueeStart, pageHeight, pageWidth, scale, selection.isolationIds, toPage],
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
      const drag = transformDragRef.current;
      if (drag && event.pointerId === drag.pointerId) {
        const end = toPage(event.clientX, event.clientY);
        transformDragRef.current = null;
        if (!end || !onTransformCommit) return;
        const dx = end.x - drag.start.x;
        const dy = end.y - drag.start.y;
        if (drag.kind === "move") {
          if (Math.hypot(dx, dy) < MARQUEE_THRESHOLD_PX) return;
          onTransformCommit({ dx, dy });
          return;
        }
        const dw = drag.handle.includes("e") ? dx : 0;
        const dh = drag.handle.includes("s") ? dy : 0;
        if (Math.hypot(dw, dh) < MARQUEE_THRESHOLD_PX) return;
        onTransformCommit({ dx: 0, dy: 0, dw, dh });
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
    [blueprint, dispatch, index, marqueeNow, marqueeStart, onTransformCommit, scale, selection.isolationIds, toPage],
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
        !additive &&
        front &&
        selection.selectedIds.includes(front.layerId)
      ) {
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

      beginPointerSession(event, captureEl, front?.layerId ?? null, Boolean(opts?.chromeOnly));
    },
    [
      beginPointerSession,
      blueprint,
      dispatch,
      focalLayerId,
      index,
      onCancelFocal,
      onCanvasInteraction,
      onFocalPoint,
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
      const hit = frontmostDirectHit(index, selection.isolationIds, point, blueprint);
      if (!hit) {
        event.preventDefault();
        event.stopPropagation();
        onCanvasBackgroundDoubleClick?.();
        return;
      }
      // Designer groupContainer dive OR Studio handles blueprint inspect via special action
      if (canEnterContainer(hit, blueprint)) {
        const childHit = frontmostDirectHit(index, [...selection.isolationIds, hit.layerId], point, blueprint);
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
    [blueprint, dispatch, index, onCanvasBackgroundDoubleClick, selection.isolationIds, toPage],
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
      const entries = layerPickerHitsAtPoint(index, selection.isolationIds, point, blueprint);
      if (entries.length === 0) {
        setPicker(null);
        return;
      }
      setPicker({ x: event.clientX, y: event.clientY, entries });
    },
    [blueprint, index, selection.isolationIds, toPage],
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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
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
        const tag = (event.target as HTMLElement | null)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        dispatch({ type: "enterContainer" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, focalLayerId, onCancelFocal, picker]);

  useEffect(() => {
    if (!picker) return;
    const onClosePicker = () => setPicker(null);
    const timer = window.setTimeout(() => window.addEventListener("click", onClosePicker), 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("click", onClosePicker);
    };
  }, [picker]);

  return (
    <div
      ref={stageRef}
        className="site-creator-selection-surface absolute inset-0 overflow-visible"
      onPointerLeave={() => dispatch({ type: "hover", layerId: null })}
    >
      <svg
        ref={svgRef}
        className="absolute inset-0 z-[2] block h-full w-full cursor-crosshair"
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
      {groupFit && onGroupFit ? (
        <SiteCreatorGroupFitHandles
          opportunity={groupFit.opportunity}
          displayBounds={groupFit.displayBounds}
          onFit={onGroupFit}
        />
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
      {transformEnabled && transformBounds ? (
        <div className="pointer-events-none absolute inset-0 z-[4]" data-testid="site-creator-transform">
          {(["se", "e", "s"] as const).map((handle) => {
            const b = transformBounds;
            const left = handle === "s" ? b.x + b.width / 2 - 5 : b.x + b.width - 5;
            const top = handle === "e" ? b.y + b.height / 2 - 5 : b.y + b.height - 5;
            return (
              <div
                key={handle}
                data-testid={`site-creator-transform-${handle}`}
                className="pointer-events-auto absolute h-2.5 w-2.5 rounded-sm border border-[#A8FF32] bg-[#101820]"
                style={{ left, top, cursor: handle === "se" ? "nwse-resize" : handle === "e" ? "ew-resize" : "ns-resize" }}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const point = toPage(event.clientX, event.clientY);
                  if (!point) return;
                  transformDragRef.current = {
                    kind: "resize",
                    pointerId: event.pointerId,
                    start: point,
                    startBounds: b,
                    handle,
                  };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerUp={(event) => {
                  finishMarquee(event as unknown as React.PointerEvent<SVGSVGElement>);
                }}
              />
            );
          })}
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
