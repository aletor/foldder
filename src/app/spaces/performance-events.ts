"use client";

export const FOLDDER_PERFORMANCE_MEASURE_EVENT = "foldder-performance-measure";
export const FOLDDER_PERFORMANCE_RENDER_EVENT = "foldder-performance-render";
export const FOLDDER_CANVAS_PERFORMANCE_MODE_EVENT = "foldder-canvas-performance-mode";

export type FoldderPerformanceMeasureDetail = {
  name: string;
  durationMs: number;
  bytes?: number;
  compacted?: boolean;
  worker?: boolean;
};

export type FoldderPerformanceRenderDetail = {
  name: string;
  id?: string;
  renders: number;
  intervalMs: number;
};

export function isFoldderPerformanceMonitoringEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return (
      params.has("perf") ||
      window.localStorage.getItem("foldderPerfHud") === "1" ||
      window.localStorage.getItem("foldderPerfProfile") === "1"
    );
  } catch {
    return false;
  }
}

export function dispatchFoldderPerformanceMeasure(detail: FoldderPerformanceMeasureDetail) {
  if (typeof window === "undefined") return;
  if (!isFoldderPerformanceMonitoringEnabled()) return;
  window.dispatchEvent(new CustomEvent(FOLDDER_PERFORMANCE_MEASURE_EVENT, { detail }));
}

export function dispatchFoldderPerformanceRender(detail: FoldderPerformanceRenderDetail) {
  if (typeof window === "undefined") return;
  if (!isFoldderPerformanceMonitoringEnabled()) return;
  window.dispatchEvent(new CustomEvent(FOLDDER_PERFORMANCE_RENDER_EVENT, { detail }));
}

export function dispatchFoldderCanvasPerformanceMode(active: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(FOLDDER_CANVAS_PERFORMANCE_MODE_EVENT, { detail: { active } }));
}
