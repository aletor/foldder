"use client";

import React, { useMemo } from "react";
import { computeRgbHistogram, histogramToPath } from "./lightroom-histogram";

export type LightroomHistogramProps = {
  pixels: Uint8ClampedArray | null;
  width: number;
  height: number;
  className?: string;
  /** Clic en zona tonal (0…1) */
  onZoneClick?: (zone: "shadows" | "darks" | "lights" | "highlights") => void;
};

const W = 220;
const H = 56;

export function LightroomHistogram({ pixels, width, height, className = "", onZoneClick }: LightroomHistogramProps) {
  const hist = useMemo(() => {
    if (!pixels || width <= 0 || height <= 0) return null;
    return computeRgbHistogram(pixels, width, height);
  }, [pixels, width, height]);

  if (!hist) {
    return <div className={`lr-histogram lr-histogram--empty ${className}`.trim()} aria-hidden />;
  }

  const rPath = histogramToPath(hist.r, W, H);
  const gPath = histogramToPath(hist.g, W, H);
  const bPath = histogramToPath(hist.b, W, H);

  return (
    <div className={`lr-histogram ${className}`.trim()}>
      <svg viewBox={`0 0 ${W} ${H}`} className="lr-histogram__svg" preserveAspectRatio="none">
        <path d={rPath} fill="rgba(248,113,113,0.35)" />
        <path d={gPath} fill="rgba(74,222,128,0.28)" />
        <path d={bPath} fill="rgba(96,165,250,0.32)" />
        {onZoneClick ? (
          <>
            <rect x={0} y={0} width={W * 0.25} height={H} fill="transparent" className="lr-histogram__zone" onClick={() => onZoneClick("shadows")} />
            <rect x={W * 0.25} y={0} width={W * 0.25} height={H} fill="transparent" className="lr-histogram__zone" onClick={() => onZoneClick("darks")} />
            <rect x={W * 0.5} y={0} width={W * 0.25} height={H} fill="transparent" className="lr-histogram__zone" onClick={() => onZoneClick("lights")} />
            <rect x={W * 0.75} y={0} width={W * 0.25} height={H} fill="transparent" className="lr-histogram__zone" onClick={() => onZoneClick("highlights")} />
          </>
        ) : null}
      </svg>
    </div>
  );
}
