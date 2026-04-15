"use client";

import React, { useMemo, forwardRef } from "react";

/** Grosor de reglas (px de pantalla). */
export const DESIGNER_RULER_THICKNESS = 22;

const BG = "#12151a";
const LINE_MAJOR = "rgba(255,255,255,0.28)";
const LINE_MINOR = "rgba(255,255,255,0.12)";
const LABEL = "rgba(161,161,170,0.95)";

export type DesignerViewport = { x: number; y: number; zoom: number };

function niceStepCanvas(zoom: number, targetScreenPx = 52): number {
  const raw = targetScreenPx / Math.max(zoom, 1e-9);
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const exp = Math.floor(Math.log10(raw));
  const base = 10 ** exp;
  const m = raw / base;
  let nice = 1;
  if (m <= 1) nice = 1;
  else if (m <= 2) nice = 2;
  else if (m <= 5) nice = 5;
  else nice = 10;
  return nice * base;
}

function formatPxLabel(c: number): string {
  const r = Math.round(c * 100) / 100;
  if (Math.abs(r - Math.round(r)) < 1e-6) return String(Math.round(r));
  return r.toFixed(1).replace(/\.0$/, "");
}

function useRulerTicks(
  viewport: DesignerViewport,
  screenSpan: number,
  axis: "x" | "y",
): { c: number; screen: number; major: boolean }[] {
  return useMemo(() => {
    if (screenSpan < 4) return [];
    const z = viewport.zoom;
    const off = axis === "x" ? viewport.x : viewport.y;
    const step = niceStepCanvas(z);
    const minorStep =
      step >= 100 ? step / 5 : step >= 20 ? step / 4 : step >= 5 ? step / 5 : step;

    const c0 = (0 - off) / z;
    const c1 = (screenSpan - off) / z;
    const n0 = Math.floor(Math.min(c0, c1) / minorStep);
    const n1 = Math.ceil(Math.max(c0, c1) / minorStep);

    const out: { c: number; screen: number; major: boolean }[] = [];
    for (let n = n0; n <= n1; n++) {
      const c = n * minorStep;
      const screen = c * z + off;
      if (screen < -3 || screen > screenSpan + 3) continue;
      const major = Math.abs(c / step - Math.round(c / step)) < 1e-4;
      out.push({ c, screen, major });
    }
    return out;
  }, [viewport.x, viewport.y, viewport.zoom, screenSpan, axis]);
}

export const DesignerRulerCorner = forwardRef<HTMLDivElement, object>(function DesignerRulerCorner(_props, ref) {
  return (
    <div
      ref={ref}
      className="shrink-0 border-b border-r border-white/[0.1]"
      style={{
        width: DESIGNER_RULER_THICKNESS,
        height: DESIGNER_RULER_THICKNESS,
        backgroundColor: BG,
      }}
      aria-hidden
    />
  );
});

export const DesignerRulerHorizontal = forwardRef<
  HTMLDivElement,
  {
    viewport: DesignerViewport;
    widthPx: number;
    /** Toda la regla: arrastrar crea guía horizontal (Y). */
    onGuideEdgePointerDown?: (e: React.PointerEvent) => void;
  }
>(function DesignerRulerHorizontal({ viewport, widthPx, onGuideEdgePointerDown }, ref) {
  const h = DESIGNER_RULER_THICKNESS;
  const ticks = useRulerTicks(viewport, widthPx, "x");

  return (
    <div
      ref={ref}
      className="relative min-w-0 flex-1 overflow-hidden border-b border-white/[0.1]"
      style={{ height: h, backgroundColor: BG }}
    >
      <svg width="100%" height={h} className="pointer-events-none block" preserveAspectRatio="none" aria-hidden>
        {ticks.map((t) => (
          <line
            key={`${t.c}-${t.major ? "M" : "m"}`}
            x1={t.screen}
            y1={h}
            x2={t.screen}
            y2={t.major ? h - 9 : h - 5}
            stroke={t.major ? LINE_MAJOR : LINE_MINOR}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            shapeRendering="crispEdges"
          />
        ))}
        {ticks
          .filter((t) => t.major)
          .map((t) => (
            <text
              key={`lbl-${t.c}`}
              x={t.screen + 2}
              y={12}
              fill={LABEL}
              fontSize={9}
              fontFamily='ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace'
              style={{ userSelect: "none" }}
            >
              {formatPxLabel(t.c)}
            </text>
          ))}
      </svg>
      {onGuideEdgePointerDown ? (
        <div
          className="absolute inset-0 z-[2] cursor-row-resize hover:bg-violet-500/10"
          style={{ touchAction: "none" }}
          title="Arrastrar guía horizontal"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onGuideEdgePointerDown(e);
          }}
        />
      ) : null}
    </div>
  );
});

export const DesignerRulerVertical = forwardRef<
  HTMLDivElement,
  {
    viewport: DesignerViewport;
    heightPx: number;
    /** Toda la regla: arrastrar crea guía vertical (X). */
    onGuideEdgePointerDown?: (e: React.PointerEvent) => void;
  }
>(function DesignerRulerVertical({ viewport, heightPx, onGuideEdgePointerDown }, ref) {
  const w = DESIGNER_RULER_THICKNESS;
  const ticks = useRulerTicks(viewport, heightPx, "y");

  return (
    <div
      ref={ref}
      className="relative shrink-0 overflow-hidden border-r border-white/[0.1]"
      style={{ width: w, height: heightPx, backgroundColor: BG }}
    >
      <svg width={w} height="100%" className="pointer-events-none block h-full" preserveAspectRatio="none" aria-hidden>
        {ticks.map((t) => (
          <line
            key={`${t.c}-${t.major ? "M" : "m"}`}
            x1={0}
            y1={t.screen}
            x2={t.major ? 9 : 5}
            y2={t.screen}
            stroke={t.major ? LINE_MAJOR : LINE_MINOR}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            shapeRendering="crispEdges"
          />
        ))}
        {ticks
          .filter((t) => t.major)
          .map((t) => (
            <text
              key={`vlbl-${t.c}`}
              x={w - 2}
              y={t.screen + 3}
              fill={LABEL}
              fontSize={9}
              fontFamily='ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace'
              textAnchor="end"
              style={{ userSelect: "none" }}
            >
              {formatPxLabel(t.c)}
            </text>
          ))}
      </svg>
      {onGuideEdgePointerDown ? (
        <div
          className="absolute inset-0 z-[2] cursor-col-resize hover:bg-violet-500/10"
          style={{ touchAction: "none" }}
          title="Arrastrar guía vertical"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onGuideEdgePointerDown(e);
          }}
        />
      ) : null}
    </div>
  );
});
