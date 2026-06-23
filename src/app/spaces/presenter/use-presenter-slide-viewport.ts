"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PresenterSlideViewport = {
  zoom: number;
  x: number;
  y: number;
};

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 6;
const ZOOM_WHEEL_FACTOR = 1.08;

export const PRESENTER_SLIDE_VIEWPORT_DEFAULT: PresenterSlideViewport = { zoom: 1, x: 0, y: 0 };

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

export function isPresenterSlideBackgroundTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest("[data-fh-obj]")) return false;
  if (target.closest("foreignObject")) return false;
  return Boolean(target.closest("[data-presenter-slide-viewport]"));
}

export function usePresenterSlideViewport(enabled: boolean, resetKey: string | number) {
  const [viewport, setViewport] = useState<PresenterSlideViewport>(PRESENTER_SLIDE_VIEWPORT_DEFAULT);
  const slideRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  useEffect(() => {
    setViewport(PRESENTER_SLIDE_VIEWPORT_DEFAULT);
  }, [resetKey]);

  const fitToView = useCallback(() => {
    setViewport(PRESENTER_SLIDE_VIEWPORT_DEFAULT);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const host = hostRef.current;
    if (!host) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const slide = slideRef.current;
      if (!slide) return;

      const factor = e.deltaY < 0 ? ZOOM_WHEEL_FACTOR : 1 / ZOOM_WHEEL_FACTOR;
      const v = viewportRef.current;
      const nz = clampZoom(v.zoom * factor);
      if (Math.abs(nz - v.zoom) < 1e-6) return;

      const rect = slide.getBoundingClientRect();
      const ox = e.clientX - (rect.left + rect.width / 2);
      const oy = e.clientY - (rect.top + rect.height / 2);
      const ratio = nz / v.zoom;

      setViewport({
        zoom: nz,
        x: v.x - ox * (ratio - 1),
        y: v.y - oy * (ratio - 1),
      });
    };

    host.addEventListener("wheel", onWheel, { passive: false });
    return () => host.removeEventListener("wheel", onWheel);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const host = hostRef.current;
    if (!host) return;

    let panSession: { startX: number; startY: number; origX: number; origY: number; pointerId: number } | null =
      null;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 1) return;
      e.preventDefault();
      const v = viewportRef.current;
      panSession = {
        startX: e.clientX,
        startY: e.clientY,
        origX: v.x,
        origY: v.y,
        pointerId: e.pointerId,
      };
      host.setPointerCapture(e.pointerId);
      host.style.cursor = "grabbing";
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!panSession || e.pointerId !== panSession.pointerId) return;
      setViewport((v) => ({
        ...v,
        x: panSession!.origX + (e.clientX - panSession!.startX),
        y: panSession!.origY + (e.clientY - panSession!.startY),
      }));
    };

    const endPan = (e: PointerEvent) => {
      if (!panSession || e.pointerId !== panSession.pointerId) return;
      try {
        host.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      panSession = null;
      host.style.cursor = "";
    };

    host.addEventListener("pointerdown", onPointerDown);
    host.addEventListener("pointermove", onPointerMove);
    host.addEventListener("pointerup", endPan);
    host.addEventListener("pointercancel", endPan);
    return () => {
      host.removeEventListener("pointerdown", onPointerDown);
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerup", endPan);
      host.removeEventListener("pointercancel", endPan);
      host.style.cursor = "";
    };
  }, [enabled]);

  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!enabled) return;
      if (!isPresenterSlideBackgroundTarget(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      fitToView();
    },
    [enabled, fitToView],
  );

  return {
    viewport,
    slideRef,
    hostRef,
    fitToView,
    onDoubleClick,
    viewportEnabled: enabled,
  };
}
