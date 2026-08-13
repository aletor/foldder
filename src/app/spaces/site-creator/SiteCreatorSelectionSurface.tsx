"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { isolationUnits } from "./build-site-selection-index";
import {
  clientPointToPagePoint,
  normalizePageRect,
  type PagePoint,
} from "./site-creator-coordinate-space";
import {
  canEnterContainer,
  entriesUnderPoint,
  frontmostDirectHit,
  layerPickerHitsAtPoint,
  marqueeHits,
  resolveFrontmostHit,
} from "./site-creator-hit-test";
import { SiteCreatorLayerPicker } from "./SiteCreatorLayerPicker";
import { SiteCreatorSelectionOverlay } from "./SiteCreatorSelectionOverlay";
import { SiteCreatorIsolationBreadcrumb } from "./SiteCreatorSelectionToolbar";
import type {
  SiteCreatorSelectionAction,
  SiteCreatorSelectionIndex,
  SiteCreatorSelectionState,
} from "./site-creator-selection-types";

const MARQUEE_THRESHOLD_PX = 4;

function clientToPage(
  svg: SVGSVGElement | null,
  stage: HTMLElement | null,
  scale: number,
  clientX: number,
  clientY: number,
): PagePoint | null {
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
  if (!stage) return null;
  const rect = stage.getBoundingClientRect();
  return clientPointToPagePoint(clientX, clientY, rect, scale);
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
  /** Solo para aislamiento Designer (groupContainer) y hover de capa cruda. */
  selection: SiteCreatorSelectionState;
  dispatch: (action: SiteCreatorSelectionAction) => void;
  unitOutlines?: SiteCreatorUnitOutline[];
  hoverOutline?: SiteCreatorUnitOutline | null;
  contextOutlines?: SiteCreatorUnitOutline[];
  sectionOutlines?: SiteCreatorUnitOutline[];
  ghostOutlines?: import("./SiteCreatorSelectionOverlay").SiteCreatorGhostOutline[];
  onCanvasInteraction?: () => void;
}

export function SiteCreatorSelectionSurface({
  pageWidth,
  pageHeight,
  scale,
  index,
  selection,
  dispatch,
  unitOutlines = [],
  hoverOutline = null,
  contextOutlines = [],
  sectionOutlines = [],
  ghostOutlines = [],
  onCanvasInteraction,
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

  const marqueeRect =
    marqueeStart && marqueeNow
      ? normalizePageRect(marqueeStart.x, marqueeStart.y, marqueeNow.x, marqueeNow.y)
      : null;

  const toPage = useCallback(
    (clientX: number, clientY: number) =>
      clientToPage(svgRef.current, stageRef.current, scale, clientX, clientY),
    [scale],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (marqueeStart) {
        const point = toPage(event.clientX, event.clientY);
        if (point) setMarqueeNow(point);
        return;
      }
      const point = toPage(event.clientX, event.clientY);
      if (!point) return;
      const hit = frontmostDirectHit(index, selection.isolationIds, point);
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
    [dispatch, index, marqueeStart, selection.isolationIds, toPage],
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

  const finishMarquee = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (!marqueeStart) return;
      const end = toPage(event.clientX, event.clientY) ?? marqueeNow ?? marqueeStart;
      const dx = (end.x - marqueeStart.x) * scale;
      const dy = (end.y - marqueeStart.y) * scale;
      const rect = normalizePageRect(marqueeStart.x, marqueeStart.y, end.x, end.y);
      setMarqueeStart(null);
      setMarqueeNow(null);
      const additive = event.ctrlKey || event.metaKey;
      if (Math.hypot(dx, dy) < MARQUEE_THRESHOLD_PX) {
        if (!additive) {
          dispatch({ type: "click", layerId: null, additive: false });
        }
        return;
      }
      const hits = marqueeHits(index, selection.isolationIds, rect);
      dispatch({
        type: "marquee",
        layerIds: hits.map((entry) => entry.layerId),
        additive,
      });
    },
    [dispatch, index, marqueeNow, marqueeStart, scale, selection.isolationIds, toPage],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (event.button === 2) return;
      onCanvasInteraction?.();
      const point = toPage(event.clientX, event.clientY);
      if (!point) return;
      const units = isolationUnits(index, selection.isolationIds);
      const directHits = entriesUnderPoint(units, point, { directClickOnly: true });
      const cycleHits = entriesUnderPoint(units, point, { directClickOnly: false });
      const additive = event.ctrlKey || event.metaKey;

      // Alt/Option: recorrer solapes (ya no Ctrl/Cmd).
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

      const front = resolveFrontmostHit(directHits);
      if (!front) {
        if (additive) {
          // Ctrl/Cmd+clic en vacío: conservar selección
          return;
        }
        (event.target as SVGSVGElement).setPointerCapture(event.pointerId);
        setMarqueeStart(point);
        setMarqueeNow(point);
        return;
      }

      if (additive) event.preventDefault();
      dispatch({ type: "click", layerId: front.layerId, additive });
    },
    [dispatch, index, onCanvasInteraction, selection.isolationIds, toPage],
  );

  const onDoubleClick = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      const point = toPage(event.clientX, event.clientY);
      if (!point) return;
      const hit = frontmostDirectHit(index, selection.isolationIds, point);
      if (!hit) return;
      // Designer groupContainer dive OR Studio handles blueprint inspect via special action
      if (canEnterContainer(hit)) {
        const childHit = frontmostDirectHit(index, [...selection.isolationIds, hit.layerId], point);
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
    [dispatch, index, selection.isolationIds, toPage],
  );

  const onContextMenu = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      // Ctrl+clic primario en macOS dispara contextmenu: no abrir picker.
      if (event.ctrlKey) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      const point = toPage(event.clientX, event.clientY);
      if (!point) return;
      const entries = layerPickerHitsAtPoint(index, selection.isolationIds, point);
      if (entries.length === 0) {
        setPicker(null);
        return;
      }
      setPicker({ x: event.clientX, y: event.clientY, entries });
    },
    [index, selection.isolationIds, toPage],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
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
  }, [dispatch, picker]);

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
    <div ref={stageRef} className="site-creator-selection-surface absolute inset-0">
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
        onPointerLeave={() => dispatch({ type: "hover", layerId: null })}
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
