"use client";

import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

export type ImageViewerTransform = {
  zoom: number;
  pan: { x: number; y: number };
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function pointerCentroid(pointers: Map<number, { x: number; y: number }>): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let n = 0;
  for (const p of pointers.values()) {
    x += p.x;
    y += p.y;
    n += 1;
  }
  return n > 0 ? { x: x / n, y: y / n } : { x: 0, y: 0 };
}

function pointerDistance(pointers: Map<number, { x: number; y: number }>): number {
  const pts = [...pointers.values()];
  if (pts.length < 2) return 0;
  return Math.hypot(pts[1]!.x - pts[0]!.x, pts[1]!.y - pts[0]!.y);
}

type PinchSession = {
  startDist: number;
  startCentroid: { x: number; y: number };
  startView: ImageViewerTransform;
};

export function useNanoBananaViewerTouch({
  enabled,
  containerRef,
  canInteract,
  getView,
  setView,
  minZoom = 0.25,
  maxZoom = 10,
  onDragActiveChange,
}: {
  enabled: boolean;
  containerRef: RefObject<HTMLElement | null>;
  canInteract: () => boolean;
  getView: () => ImageViewerTransform;
  setView: (view: ImageViewerTransform) => void;
  minZoom?: number;
  maxZoom?: number;
  onDragActiveChange?: (active: boolean) => void;
}) {
  const optionsRef = useRef({
    enabled,
    containerRef,
    canInteract,
    getView,
    setView,
    minZoom,
    maxZoom,
    onDragActiveChange,
  });
  useLayoutEffect(() => {
    optionsRef.current = {
      enabled,
      containerRef,
      canInteract,
      getView,
      setView,
      minZoom,
      maxZoom,
      onDragActiveChange,
    };
  });

  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchSessionRef = useRef<PinchSession | null>(null);
  const multiTouchRef = useRef(false);
  const panDragRef = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);

  const cancelPanDrag = useCallback(() => {
    if (panDragRef.current) {
      panDragRef.current = null;
      optionsRef.current.onDragActiveChange?.(false);
    }
  }, []);

  const beginPinchSession = useCallback(() => {
    const pointers = pointersRef.current;
    if (pointers.size < 2) return;
    multiTouchRef.current = true;
    cancelPanDrag();
    pinchSessionRef.current = {
      startDist: Math.max(pointerDistance(pointers), 1),
      startCentroid: pointerCentroid(pointers),
      startView: {
        zoom: optionsRef.current.getView().zoom,
        pan: { ...optionsRef.current.getView().pan },
      },
    };
  }, [cancelPanDrag]);

  const applyPinchPan = useCallback(() => {
    const session = pinchSessionRef.current;
    const pointers = pointersRef.current;
    if (!session || pointers.size < 2) return;
    const rect = optionsRef.current.containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const dist = Math.max(pointerDistance(pointers), 1);
    const centroid = pointerCentroid(pointers);
    const sv = session.startView;
    const nz = clamp(sv.zoom * (dist / session.startDist), optionsRef.current.minZoom, optionsRef.current.maxZoom);
    const mx = session.startCentroid.x - rect.left;
    const my = session.startCentroid.y - rect.top;
    const ratio = nz / sv.zoom;
    const x = mx - ratio * (mx - sv.pan.x) + (centroid.x - session.startCentroid.x);
    const y = my - ratio * (my - sv.pan.y) + (centroid.y - session.startCentroid.y);
    optionsRef.current.setView({ zoom: nz, pan: { x, y } });
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      const opts = optionsRef.current;
      if (!opts.enabled) return;
      if (e.pointerType === "mouse") return;
      if (!opts.canInteract()) return;

      e.preventDefault();
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointersRef.current.size === 1) {
        multiTouchRef.current = false;
        pinchSessionRef.current = null;
        const view = opts.getView();
        panDragRef.current = {
          mx: e.clientX,
          my: e.clientY,
          px: view.pan.x,
          py: view.pan.y,
        };
        opts.onDragActiveChange?.(true);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        return;
      }

      if (pointersRef.current.size >= 2) {
        beginPinchSession();
        applyPinchPan();
      }
    },
    [applyPinchPan, beginPinchSession],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const opts = optionsRef.current;
      if (!opts.enabled) return;
      if (e.pointerType === "mouse") return;
      if (!pointersRef.current.has(e.pointerId)) return;

      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (multiTouchRef.current && pointersRef.current.size >= 2) {
        e.preventDefault();
        applyPinchPan();
        return;
      }

      const drag = panDragRef.current;
      if (drag && pointersRef.current.size === 1 && !multiTouchRef.current) {
        opts.setView({
          zoom: opts.getView().zoom,
          pan: {
            x: drag.px + e.clientX - drag.mx,
            y: drag.py + e.clientY - drag.my,
          },
        });
      }
    },
    [applyPinchPan],
  );

  const releasePointer = useCallback(
    (e: ReactPointerEvent) => {
      pointersRef.current.delete(e.pointerId);

      if (pointersRef.current.size < 2) {
        multiTouchRef.current = false;
        pinchSessionRef.current = null;
      }

      if (pointersRef.current.size === 0) {
        cancelPanDrag();
        return;
      }

      if (pointersRef.current.size === 1 && multiTouchRef.current) {
        cancelPanDrag();
        multiTouchRef.current = false;
        pinchSessionRef.current = null;
      }
    },
    [cancelPanDrag],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent) => {
      if (!optionsRef.current.enabled || e.pointerType === "mouse") return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      releasePointer(e);
    },
    [releasePointer],
  );

  const onPointerCancel = onPointerUp;

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
