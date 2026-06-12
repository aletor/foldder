"use client";

import React, { useEffect, useState } from "react";
import {
  FOLDDER_PERFORMANCE_MEASURE_EVENT,
  FOLDDER_PERFORMANCE_RENDER_EVENT,
  type FoldderPerformanceMeasureDetail,
  type FoldderPerformanceRenderDetail,
} from "./performance-events";

type PerfSample = {
  fps: number;
  minFps: number;
  avgFps: number;
  longTasks: number;
  lastMeasure: FoldderPerformanceMeasureDetail | null;
  renderHotspots: Array<{ key: string; label: string; rpm: number }>;
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
    minFps: 0,
    avgFps: 0,
    longTasks: 0,
    lastMeasure: null,
    renderHotspots: [],
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
    const fpsWindow: number[] = [];
    let longTasks = 0;
    let lastMeasure: FoldderPerformanceMeasureDetail | null = null;
    const renderTotals = new Map<string, { label: string; renders: number; intervalMs: number }>();

    const tick = (now: number) => {
      frames += 1;
      const elapsed = now - lastAt;
      if (elapsed >= 500) {
        const fps = Math.round((frames * 1000) / elapsed);
        fpsWindow.push(fps);
        if (fpsWindow.length > 30) fpsWindow.shift();
        const minFps = fpsWindow.length ? Math.min(...fpsWindow) : fps;
        const avgFps = fpsWindow.length
          ? Math.round(fpsWindow.reduce((sum, item) => sum + item, 0) / fpsWindow.length)
          : fps;
        const renderHotspots = Array.from(renderTotals.entries())
          .map(([key, value]) => ({
            key,
            label: value.label,
            rpm: Math.round((value.renders * 60000) / Math.max(1, value.intervalMs)),
          }))
          .sort((a, b) => b.rpm - a.rpm)
          .slice(0, 5);
        setSample({ fps, minFps, avgFps, longTasks, lastMeasure, renderHotspots });
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

    const onRender = (event: Event) => {
      const detail = (event as CustomEvent<FoldderPerformanceRenderDetail>).detail;
      const key = detail.id ? `${detail.name}:${detail.id}` : detail.name;
      const prev = renderTotals.get(key);
      renderTotals.set(key, {
        label: detail.id ? `${detail.name} · ${detail.id.slice(0, 8)}` : detail.name,
        renders: (prev?.renders ?? 0) + detail.renders,
        intervalMs: (prev?.intervalMs ?? 0) + detail.intervalMs,
      });
    };

    window.addEventListener(FOLDDER_PERFORMANCE_MEASURE_EVENT, onMeasure);
    window.addEventListener(FOLDDER_PERFORMANCE_RENDER_EVENT, onRender);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      window.removeEventListener(FOLDDER_PERFORMANCE_MEASURE_EVENT, onMeasure);
      window.removeEventListener(FOLDDER_PERFORMANCE_RENDER_EVENT, onRender);
    };
  }, [enabled]);

  if (!enabled) return null;

  const measure = sample.lastMeasure;
  return (
    <div className="pointer-events-none fixed bottom-3 right-3 z-[10020] min-w-[180px] rounded-none border border-white/15 bg-black/80 px-3 py-2 font-mono text-[10px] leading-relaxed text-white shadow-2xl backdrop-blur-md" data-foldder-canvas-chrome>
      <div className="flex items-center justify-between gap-5">
        <span className="text-white/55">FPS</span>
        <span className={sample.fps >= 55 ? "text-emerald-300" : sample.fps >= 40 ? "text-amber-300" : "text-rose-300"}>
          {sample.fps || "--"}
        </span>
      </div>
      <div className="flex items-center justify-between gap-5">
        <span className="text-white/55">FPS min / avg</span>
        <span>
          {sample.minFps || "--"} / {sample.avgFps || "--"}
        </span>
      </div>
      <div className="flex items-center justify-between gap-5">
        <span className="text-white/55">Long tasks</span>
        <span>{sample.longTasks}</span>
      </div>
      {sample.renderHotspots.length > 0 && (
        <div className="mt-1 border-t border-white/10 pt-1">
          <div className="text-white/55">Render hotspots/min</div>
          {sample.renderHotspots.map((item) => (
            <div key={item.key} className="flex items-center justify-between gap-4 text-white/70">
              <span className="max-w-[130px] truncate">{item.label}</span>
              <span>{item.rpm}</span>
            </div>
          ))}
        </div>
      )}
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
