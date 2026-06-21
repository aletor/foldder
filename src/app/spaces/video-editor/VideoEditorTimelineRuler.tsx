"use client";

import React, { useCallback, useMemo } from "react";

import { formatTimecode } from "./video-editor-timecode";
import type { VideoEditorTimelineMarker } from "./video-editor-edit-types";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function VideoEditorTimelineRuler({
  durationSeconds,
  timelineScale,
  playheadTime,
  fps,
  markers,
  inPoint,
  outPoint,
  onScrub,
  labelWidth,
}: {
  durationSeconds: number;
  timelineScale: number;
  playheadTime: number;
  fps: number;
  markers: VideoEditorTimelineMarker[];
  inPoint?: number;
  outPoint?: number;
  onScrub: (time: number) => void;
  labelWidth: number;
}) {
  const tickCount = Math.ceil(durationSeconds) + 1;
  const majorEvery = fps >= 30 ? 5 : fps >= 25 ? 5 : 4;

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const scrub = (clientX: number) => {
        const time = Math.max(0, Math.min(durationSeconds, (clientX - rect.left) / timelineScale));
        onScrub(time);
      };
      scrub(event.clientX);
      event.currentTarget.setPointerCapture(event.pointerId);
      const onMove = (moveEvent: PointerEvent) => scrub(moveEvent.clientX);
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp, { once: true });
    },
    [durationSeconds, onScrub, timelineScale],
  );

  const playheadLeft = playheadTime * timelineScale;
  const rangeMarkers = useMemo(() => markers.filter((m) => m.time >= 0 && m.time <= durationSeconds + 0.01), [durationSeconds, markers]);

  return (
    <div className="sticky top-0 z-30 grid border-b border-white/10 bg-[#202329]" style={{ gridTemplateColumns: `${labelWidth}px 1fr` }}>
      <div className="sticky left-0 z-30 flex h-9 items-center border-r border-black/45 bg-[#202329] px-3 text-[10px] font-black uppercase tracking-[0.12em] text-white/32">
        TC
      </div>
      <div className="relative h-9 cursor-col-resize select-none" onPointerDown={handlePointerDown}>
        {Array.from({ length: tickCount }).map((_, second) => (
          <div
            key={second}
            className={cx("absolute top-0 h-full border-l", second % majorEvery === 0 ? "border-white/22" : "border-white/10")}
            style={{ left: second * timelineScale }}
          >
            {second % majorEvery === 0 ? (
              <span className="ml-0.5 text-[9px] tabular-nums text-white/32">{formatTimecode(second, fps).slice(3, 8)}</span>
            ) : null}
          </div>
        ))}
        {inPoint !== undefined ? (
          <div className="pointer-events-none absolute top-0 h-full w-px bg-emerald-300/70" style={{ left: inPoint * timelineScale }} title="In" />
        ) : null}
        {outPoint !== undefined ? (
          <div className="pointer-events-none absolute top-0 h-full w-px bg-rose-300/70" style={{ left: outPoint * timelineScale }} title="Out" />
        ) : null}
        {inPoint !== undefined && outPoint !== undefined && outPoint > inPoint ? (
          <div
            className="pointer-events-none absolute top-0 h-full bg-[#3a8f96]/10"
            style={{ left: inPoint * timelineScale, width: (outPoint - inPoint) * timelineScale }}
          />
        ) : null}
        {rangeMarkers.map((marker) => (
          <div
            key={marker.id}
            className="pointer-events-none absolute top-0 z-10 h-full w-px bg-amber-200/75"
            style={{ left: marker.time * timelineScale }}
            title={marker.label ?? `Marker ${formatTimecode(marker.time, fps)}`}
          />
        ))}
        <div
          className="pointer-events-none absolute top-0 z-20 h-full w-0.5 -translate-x-1/2 bg-[#3a8f96]"
          style={{ left: playheadLeft }}
        />
        <div
          className="pointer-events-none absolute top-0 z-20 h-2.5 w-2.5 -translate-x-1/2 rotate-45 border border-[#3a8f96] bg-white"
          style={{ left: playheadLeft }}
        />
      </div>
    </div>
  );
}
