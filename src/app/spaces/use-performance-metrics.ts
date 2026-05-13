"use client";

import { useEffect, useRef } from "react";
import { dispatchFoldderPerformanceRender } from "./performance-events";

export function useFoldderRenderMetric(name: string, id?: string): void {
  const renderCountRef = useRef(0);
  const lastFlushAtRef = useRef(0);

  useEffect(() => {
    renderCountRef.current += 1;
  });

  useEffect(() => {
    if (lastFlushAtRef.current === 0) lastFlushAtRef.current = performance.now();
    const intervalId = window.setInterval(() => {
      const now = performance.now();
      const intervalMs = now - lastFlushAtRef.current;
      const renders = renderCountRef.current;
      renderCountRef.current = 0;
      lastFlushAtRef.current = now;
      if (renders <= 0 || intervalMs <= 0) return;
      dispatchFoldderPerformanceRender({ name, id, renders, intervalMs });
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [id, name]);
}
