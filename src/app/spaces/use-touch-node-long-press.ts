"use client";

import { useEffect } from "react";

type UseTouchNodeLongPressOptions = {
  enabled: boolean;
  containerRef: React.RefObject<HTMLElement | null>;
  onLongPress: (detail: { nodeId: string; clientX: number; clientY: number }) => void;
  delayMs?: number;
  moveThresholdPx?: number;
};

export function useTouchNodeLongPress({
  enabled,
  containerRef,
  onLongPress,
  delayMs = 500,
  moveThresholdPx = 12,
}: UseTouchNodeLongPressOptions) {
  useEffect(() => {
    if (!enabled) return;
    const root = containerRef.current;
    if (!root) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let startX = 0;
    let startY = 0;
    let nodeId: string | null = null;

    const cancel = () => {
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
      nodeId = null;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
      const nodeEl = (event.target as Element | null)?.closest(".react-flow__node");
      if (!nodeEl) return;
      const id = nodeEl.getAttribute("data-id");
      if (!id) return;

      startX = event.clientX;
      startY = event.clientY;
      nodeId = id;
      timer = setTimeout(() => {
        timer = null;
        if (!nodeId) return;
        onLongPress({ nodeId, clientX: startX, clientY: startY });
        nodeId = null;
      }, delayMs);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (timer == null) return;
      if (Math.hypot(event.clientX - startX, event.clientY - startY) > moveThresholdPx) {
        cancel();
      }
    };

    root.addEventListener("pointerdown", onPointerDown, { capture: true });
    root.addEventListener("pointermove", onPointerMove, { capture: true });
    root.addEventListener("pointerup", cancel, { capture: true });
    root.addEventListener("pointercancel", cancel, { capture: true });

    return () => {
      cancel();
      root.removeEventListener("pointerdown", onPointerDown, { capture: true });
      root.removeEventListener("pointermove", onPointerMove, { capture: true });
      root.removeEventListener("pointerup", cancel, { capture: true });
      root.removeEventListener("pointercancel", cancel, { capture: true });
    };
  }, [containerRef, delayMs, enabled, moveThresholdPx, onLongPress]);
}
