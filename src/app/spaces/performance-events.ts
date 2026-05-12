"use client";

export const FOLDDER_PERFORMANCE_MEASURE_EVENT = "foldder-performance-measure";
export const FOLDDER_CANVAS_PERFORMANCE_MODE_EVENT = "foldder-canvas-performance-mode";

export type FoldderPerformanceMeasureDetail = {
  name: string;
  durationMs: number;
  bytes?: number;
  compacted?: boolean;
  worker?: boolean;
};

export function dispatchFoldderPerformanceMeasure(detail: FoldderPerformanceMeasureDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(FOLDDER_PERFORMANCE_MEASURE_EVENT, { detail }));
}

export function dispatchFoldderCanvasPerformanceMode(active: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(FOLDDER_CANVAS_PERFORMANCE_MODE_EVENT, { detail: { active } }));
}
