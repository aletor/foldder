"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import type { DesignerPageState } from "../designer/DesignerNode";
import {
  clampProTrack,
  formatProClock,
  listProTimelineRows,
  MIN_PRO_LAYER_MS,
  MIN_PRO_SLIDE_MS,
  resolveProTrack,
  type PresenterProLayerTrack,
} from "./presenter-pro-timing";
import { PresenterScrubNumberInput } from "./PresenterScrubNumberInput";

const LABEL_W = 132;
const RULER_H = 22;
const ROW_H = 28;

type DragMode = "move" | "trim-start" | "trim-end" | "playhead";

type Props = {
  page: DesignerPageState;
  slideDurationMs: number;
  onSlideDurationChange: (ms: number) => void;
  tracks: Record<string, PresenterProLayerTrack>;
  onPatchTrack: (key: string, track: PresenterProLayerTrack) => void;
  selectedKeys: string[];
  onSelectKey: (key: string) => void;
  playheadMs: number;
  onPlayheadChange: (ms: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
};

function msToX(ms: number, slideDurationMs: number, trackWidth: number): number {
  const dur = Math.max(MIN_PRO_SLIDE_MS, slideDurationMs);
  return (ms / dur) * trackWidth;
}

function xToMs(x: number, slideDurationMs: number, trackWidth: number): number {
  const dur = Math.max(MIN_PRO_SLIDE_MS, slideDurationMs);
  const ratio = Math.max(0, Math.min(1, x / Math.max(1, trackWidth)));
  return ratio * dur;
}

export function PresenterProTimeline({
  page,
  slideDurationMs,
  onSlideDurationChange,
  tracks,
  onPatchTrack,
  selectedKeys,
  onSelectKey,
  playheadMs,
  onPlayheadChange,
  isPlaying,
  onTogglePlay,
}: Props) {
  const rows = useMemo(() => listProTimelineRows(page.objects ?? []), [page.objects]);
  const trackAreaRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    mode: DragMode;
    key?: string;
    startClientX: number;
    originTrack?: PresenterProLayerTrack;
    originPlayheadMs?: number;
  } | null>(null);

  const [trackWidth, setTrackWidth] = useState(640);

  const measureTrackWidth = useCallback(() => {
    const el = trackAreaRef.current;
    if (!el) return;
    setTrackWidth(Math.max(120, el.clientWidth));
  }, []);

  React.useLayoutEffect(() => {
    measureTrackWidth();
    const el = trackAreaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measureTrackWidth());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureTrackWidth]);

  const pxPerMs = trackWidth / Math.max(MIN_PRO_SLIDE_MS, slideDurationMs);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startClientX;
      const dMs = dx / Math.max(0.001, pxPerMs);

      if (d.mode === "playhead") {
        const next = Math.max(0, Math.min(slideDurationMs, (d.originPlayheadMs ?? 0) + dMs));
        onPlayheadChange(next);
        return;
      }

      if (!d.key || !d.originTrack) return;
      const origin = d.originTrack;

      if (d.mode === "move") {
        const len = origin.endMs - origin.startMs;
        let startMs = origin.startMs + dMs;
        startMs = Math.max(0, Math.min(startMs, slideDurationMs - len));
        onPatchTrack(d.key, clampProTrack({ startMs, endMs: startMs + len }, slideDurationMs));
        return;
      }

      if (d.mode === "trim-start") {
        let startMs = origin.startMs + dMs;
        startMs = Math.max(0, Math.min(startMs, origin.endMs - MIN_PRO_LAYER_MS));
        onPatchTrack(d.key, clampProTrack({ startMs, endMs: origin.endMs }, slideDurationMs));
        return;
      }

      if (d.mode === "trim-end") {
        let endMs = origin.endMs + dMs;
        endMs = Math.max(origin.startMs + MIN_PRO_LAYER_MS, Math.min(endMs, slideDurationMs));
        onPatchTrack(d.key, clampProTrack({ startMs: origin.startMs, endMs }, slideDurationMs));
      }
    },
    [onPatchTrack, onPlayheadChange, pxPerMs, slideDurationMs],
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);
  }, [onPointerMove]);

  const startDrag = useCallback(
    (e: React.PointerEvent, mode: DragMode, key?: string, originTrack?: PresenterProLayerTrack) => {
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      dragRef.current = {
        mode,
        key,
        startClientX: e.clientX,
        originTrack,
        originPlayheadMs: playheadMs,
      };
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", endDrag);
      window.addEventListener("pointercancel", endDrag);
    },
    [endDrag, onPointerMove, playheadMs],
  );

  const onRulerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      onPlayheadChange(xToMs(x, slideDurationMs, trackWidth));
      startDrag(e, "playhead");
    },
    [onPlayheadChange, slideDurationMs, startDrag, trackWidth],
  );

  const tickCount = Math.min(12, Math.max(4, Math.ceil(slideDurationMs / 1000)));

  return (
    <div className="flex shrink-0 flex-col border-t border-white/[0.08] bg-[#0a0c0f]">
      <div className="flex shrink-0 items-center gap-3 border-b border-white/[0.08] px-3 py-2">
        <button
          type="button"
          onClick={onTogglePlay}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/12 bg-[#12151a] text-zinc-200 transition-colors hover:bg-white/[0.06]"
          title={isPlaying ? "Pausar (Espacio)" : "Reproducir slide (Espacio)"}
          aria-label={isPlaying ? "Pausar" : "Reproducir slide"}
        >
          {isPlaying ? (
            <Pause className="h-3.5 w-3.5" fill="currentColor" strokeWidth={0} aria-hidden />
          ) : (
            <Play className="h-3.5 w-3.5 fill-current" strokeWidth={0} aria-hidden />
          )}
        </button>

        <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-300">
          {formatProClock(playheadMs)} / {formatProClock(slideDurationMs)}
        </span>

        <label className="ml-auto flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Duración slide
          </span>
          <PresenterScrubNumberInput
            className="w-[5.5rem]"
            value={Math.round(slideDurationMs)}
            min={MIN_PRO_SLIDE_MS}
            max={120_000}
            step={100}
            onKeyboardCommit={onSlideDurationChange}
            onScrubLive={onSlideDurationChange}
            onScrubEnd={() => {}}
          />
        </label>
      </div>

      <div className="flex min-h-0 max-h-[220px] overflow-auto">
        <div
          className="sticky left-0 z-10 shrink-0 border-r border-white/[0.06] bg-[#0a0c0f]"
          style={{ width: LABEL_W }}
        >
          <div style={{ height: RULER_H }} className="border-b border-white/[0.06]" />
          {rows.map((row) => {
            const selected = selectedKeys.includes(row.key);
            return (
              <button
                key={row.key}
                type="button"
                onClick={() => onSelectKey(row.key)}
                className={`flex w-full items-center border-b border-white/[0.04] px-2 text-left text-[10px] transition-colors ${
                  selected ? "bg-[#f5b91b]/12 text-[#f5b91b]" : "text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200"
                }`}
                style={{ height: ROW_H }}
                title={row.label}
              >
                <span className="truncate">{row.label}</span>
              </button>
            );
          })}
          {rows.length === 0 ? (
            <p className="px-2 py-3 text-[10px] leading-snug text-zinc-600">Sin capas animables en este slide.</p>
          ) : null}
        </div>

        <div ref={trackAreaRef} className="relative min-w-0 flex-1 overflow-x-auto">
          <div style={{ minWidth: trackWidth }}>
            <div
              role="slider"
              aria-label="Playhead"
              aria-valuemin={0}
              aria-valuemax={slideDurationMs}
              aria-valuenow={playheadMs}
              className="relative cursor-crosshair border-b border-white/[0.06] bg-[#0e1014]"
              style={{ height: RULER_H }}
              onPointerDown={onRulerDown}
            >
              {Array.from({ length: tickCount + 1 }, (_, i) => {
                const ms = (i / tickCount) * slideDurationMs;
                const x = msToX(ms, slideDurationMs, trackWidth);
                return (
                  <div
                    key={i}
                    className="pointer-events-none absolute top-0 bottom-0 border-l border-white/[0.08]"
                    style={{ left: x }}
                  >
                    <span className="absolute top-0.5 left-1 text-[8px] tabular-nums text-zinc-600">
                      {formatProClock(ms)}
                    </span>
                  </div>
                );
              })}
              <div
                className="pointer-events-none absolute top-0 bottom-0 z-20 w-px bg-[#f5b91b]"
                style={{ left: msToX(playheadMs, slideDurationMs, trackWidth) }}
              />
            </div>

            {rows.map((row) => {
              const track = resolveProTrack(row.key, tracks, slideDurationMs);
              const left = msToX(track.startMs, slideDurationMs, trackWidth);
              const width = Math.max(6, msToX(track.endMs, slideDurationMs, trackWidth) - left);
              const selected = selectedKeys.includes(row.key);
              return (
                <div
                  key={row.key}
                  className="relative border-b border-white/[0.04] bg-[#0b0d10]"
                  style={{ height: ROW_H }}
                >
                  <div
                    className={`absolute top-1 bottom-1 rounded-[3px] border ${
                      selected
                        ? "border-[#f5b91b]/70 bg-[#f5b91b]/35"
                        : "border-sky-500/40 bg-sky-500/25"
                    }`}
                    style={{ left, width }}
                    onPointerDown={(e) => {
                      onSelectKey(row.key);
                      startDrag(e, "move", row.key, track);
                    }}
                  >
                    <div
                      className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l-[3px] bg-white/10"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        onSelectKey(row.key);
                        startDrag(e, "trim-start", row.key, track);
                      }}
                    />
                    <div
                      className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r-[3px] bg-white/10"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        onSelectKey(row.key);
                        startDrag(e, "trim-end", row.key, track);
                      }}
                    />
                  </div>
                </div>
              );
            })}

            <div
              className="pointer-events-none absolute top-0 bottom-0 z-30 w-px bg-[#f5b91b] shadow-[0_0_6px_rgba(245,185,27,0.55)]"
              style={{ left: msToX(playheadMs, slideDurationMs, trackWidth) }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
