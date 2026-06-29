import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";

export type StudioViewport = { x: number; y: number; zoom: number };

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

export function pointerAsMouseEvent(e: ReactPointerEvent): ReactMouseEvent {
  return e as unknown as ReactMouseEvent;
}

type PinchSession = {
  startDist: number;
  startCentroid: { x: number; y: number };
  startViewport: StudioViewport;
};

export function useFreehandStudioTouchCanvasHandlers(options: {
  enabled: boolean;
  containerRef: RefObject<HTMLElement | null>;
  getViewport: () => StudioViewport;
  setViewport: React.Dispatch<React.SetStateAction<StudioViewport>>;
  handleMouseDown: (e: ReactMouseEvent) => void;
  handleMouseMove: (e: ReactMouseEvent) => void;
  handleMouseUp: (e: ReactMouseEvent) => void;
  onClearHover: () => void;
  cancelActiveGesture: () => void;
}) {
  const optionsRef = useRef(options);
  useLayoutEffect(() => {
    optionsRef.current = options;
  });

  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchSessionRef = useRef<PinchSession | null>(null);
  const multiTouchRef = useRef(false);

  const beginPinchSession = useCallback(() => {
    const pointers = pointersRef.current;
    if (pointers.size < 2) return;
    multiTouchRef.current = true;
    optionsRef.current.cancelActiveGesture();
    pinchSessionRef.current = {
      startDist: Math.max(pointerDistance(pointers), 1),
      startCentroid: pointerCentroid(pointers),
      startViewport: { ...optionsRef.current.getViewport() },
    };
  }, []);

  const applyPinchPan = useCallback(() => {
    const session = pinchSessionRef.current;
    const pointers = pointersRef.current;
    if (!session || pointers.size < 2) return;
    const rect = optionsRef.current.containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const dist = Math.max(pointerDistance(pointers), 1);
    const centroid = pointerCentroid(pointers);
    const sv = session.startViewport;
    const nz = clamp(sv.zoom * (dist / session.startDist), 0.05, 20);
    const mx = session.startCentroid.x - rect.left;
    const my = session.startCentroid.y - rect.top;
    const ratio = nz / sv.zoom;
    const x = mx - ratio * (mx - sv.x) + (centroid.x - session.startCentroid.x);
    const y = my - ratio * (my - sv.y) + (centroid.y - session.startCentroid.y);
    optionsRef.current.setViewport({ zoom: nz, x, y });
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      const opts = optionsRef.current;
      if (!opts.enabled) return;
      if (e.pointerType === "mouse") return;
      const tgt = e.target as HTMLElement | null;
      if (tgt?.closest?.("[data-fh-text-editor]")) return;
      if (tgt?.closest?.("[data-foldder-effect-layer-panel]")) return;

      e.preventDefault();
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointersRef.current.size === 1) {
        multiTouchRef.current = false;
        pinchSessionRef.current = null;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        opts.handleMouseDown(pointerAsMouseEvent(e));
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

      if (pointersRef.current.size === 1 && !multiTouchRef.current) {
        opts.handleMouseMove(pointerAsMouseEvent(e));
      }
    },
    [applyPinchPan],
  );

  const releasePointer = useCallback((e: ReactPointerEvent) => {
    const opts = optionsRef.current;
    pointersRef.current.delete(e.pointerId);

    if (pointersRef.current.size < 2) {
      multiTouchRef.current = false;
      pinchSessionRef.current = null;
    }

    if (pointersRef.current.size === 0) {
      opts.onClearHover();
      opts.handleMouseUp(pointerAsMouseEvent(e));
      return;
    }

    if (pointersRef.current.size === 1 && multiTouchRef.current) {
      opts.cancelActiveGesture();
      multiTouchRef.current = false;
      pinchSessionRef.current = null;
    }
  }, []);

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
