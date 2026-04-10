import { type RefObject, useLayoutEffect } from "react";

/**
 * Trackpad pinch emits wheel events with ctrlKey; the browser treats them as page zoom.
 * React's synthetic onWheel is often registered passive, so preventDefault there can be ignored.
 * A capture listener with { passive: false } reliably blocks page zoom inside fullscreen studios.
 */
export function usePreventBrowserPinchZoom(
  containerRef: RefObject<HTMLElement | null>,
): void {
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheelCapture = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };

    el.addEventListener("wheel", onWheelCapture, { passive: false, capture: true });
    return () => {
      el.removeEventListener("wheel", onWheelCapture, { capture: true });
    };
  }, [containerRef]);
}
