"use client";

import React, { useEffect, useState } from "react";
import {
  FOLDDER_PERFORMANCE_MEASURE_EVENT,
  type FoldderPerformanceMeasureDetail,
} from "./performance-events";

type PerfSample = {
  fps: number;
  longTasks: number;
  lastMeasure: FoldderPerformanceMeasureDetail | null;
};

function shouldShowPerformanceHud(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.has("perf") || window.localStorage.getItem("foldderPerfHud") === "1";
}

export function PerformanceHud() {
  const [enabled, setEnabled] = useState(false);
  const [sample, setSample] = useState<PerfSample>({
    fps: 0,
    longTasks: 0,
    lastMeasure: null,
  });

  useEffect(() => {
    const id = window.setTimeout(() => setEnabled(shouldShowPerformanceHud()), 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let raf = 0;
    let frames = 0;
    let lastAt = performance.now();
    let longTasks = 0;
    let lastMeasure: FoldderPerformanceMeasureDetail | null = null;

    const tick = (now: number) => {
      frames += 1;
      const elapsed = now - lastAt;
      if (elapsed >= 500) {
        const fps = Math.round((frames * 1000) / elapsed);
        setSample({ fps, longTasks, lastMeasure });
        frames = 0;
        lastAt = now;
      }
      raf = requestAnimationFrame(tick);
    };

    let observer: PerformanceObserver | null = null;
    try {
      if (typeof PerformanceObserver !== "undefined") {
        observer = new PerformanceObserver((list) => {
          longTasks += list.getEntries().length;
        });
        observer.observe({ entryTypes: ["longtask"] });
      }
    } catch {
      observer = null;
    }

    const onMeasure = (event: Event) => {
      lastMeasure = (event as CustomEvent<FoldderPerformanceMeasureDetail>).detail;
      setSample((current) => ({ ...current, lastMeasure }));
    };

    window.addEventListener(FOLDDER_PERFORMANCE_MEASURE_EVENT, onMeasure);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      window.removeEventListener(FOLDDER_PERFORMANCE_MEASURE_EVENT, onMeasure);
    };
  }, [enabled]);

  if (!enabled) return null;

  const measure = sample.lastMeasure;
  return (
    <div className="pointer-events-none fixed bottom-3 right-3 z-[10020] min-w-[180px] rounded-xl border border-white/15 bg-black/80 px-3 py-2 font-mono text-[10px] leading-relaxed text-white shadow-2xl backdrop-blur-md">
      <div className="flex items-center justify-between gap-5">
        <span className="text-white/55">FPS</span>
        <span className={sample.fps >= 55 ? "text-emerald-300" : sample.fps >= 40 ? "text-amber-300" : "text-rose-300"}>
          {sample.fps || "--"}
        </span>
      </div>
      <div className="flex items-center justify-between gap-5">
        <span className="text-white/55">Long tasks</span>
        <span>{sample.longTasks}</span>
      </div>
      {measure && (
        <div className="mt-1 border-t border-white/10 pt-1 text-white/70">
          <div>{measure.name}</div>
          <div>
            {Math.round(measure.durationMs)}ms
            {measure.bytes ? ` · ${Math.round(measure.bytes / 1024)}KB` : ""}
            {measure.worker ? " · worker" : ""}
            {measure.compacted ? " · compacted" : ""}
          </div>
        </div>
      )}
    </div>
  );
}
