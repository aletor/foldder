"use client";

import { useEffect, useRef, useState } from "react";
import { FOLDDER_CANVAS_PERFORMANCE_MODE_EVENT } from "./performance-events";

export function useCanvasPerformanceMode(): boolean {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const handlePerformanceMode = (event: Event) => {
      setActive(Boolean((event as CustomEvent<{ active?: boolean }>).detail?.active));
    };
    window.addEventListener(FOLDDER_CANVAS_PERFORMANCE_MODE_EVENT, handlePerformanceMode);
    return () => {
      window.removeEventListener(FOLDDER_CANVAS_PERFORMANCE_MODE_EVENT, handlePerformanceMode);
    };
  }, []);

  return active;
}

export function useCanvasPerformanceModeRef(onChange?: (active: boolean) => void) {
  const activeRef = useRef(false);

  useEffect(() => {
    const handlePerformanceMode = (event: Event) => {
      const active = Boolean((event as CustomEvent<{ active?: boolean }>).detail?.active);
      activeRef.current = active;
      onChange?.(active);
    };
    window.addEventListener(FOLDDER_CANVAS_PERFORMANCE_MODE_EVENT, handlePerformanceMode);
    return () => {
      window.removeEventListener(FOLDDER_CANVAS_PERFORMANCE_MODE_EVENT, handlePerformanceMode);
    };
  }, [onChange]);

  return activeRef;
}

