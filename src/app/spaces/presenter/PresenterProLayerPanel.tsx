"use client";

import React, { useMemo } from "react";
import { Clock, X } from "lucide-react";
import type { DesignerPageState } from "../designer/DesignerNode";
import {
  clampProTrack,
  formatProMs,
  listProTimelineRows,
  MIN_PRO_LAYER_MS,
  resolveProTrack,
  type PresenterProLayerTrack,
} from "./presenter-pro-timing";
import { PresenterScrubNumberInput } from "./PresenterScrubNumberInput";

type Props = {
  page: DesignerPageState;
  selectedStepKeys: string[];
  slideDurationMs: number;
  tracks: Record<string, PresenterProLayerTrack>;
  onPatchTrack: (key: string, track: PresenterProLayerTrack) => void;
  onClose: () => void;
};

export function PresenterProLayerPanel({
  page,
  selectedStepKeys,
  slideDurationMs,
  tracks,
  onPatchTrack,
  onClose,
}: Props) {
  const rows = useMemo(() => listProTimelineRows(page.objects ?? []), [page.objects]);
  const rowByKey = useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows]);

  const focusKey = selectedStepKeys.length === 1 ? selectedStepKeys[0]! : null;
  const focusRow = focusKey ? rowByKey.get(focusKey) : null;
  const track = focusKey ? resolveProTrack(focusKey, tracks, slideDurationMs) : null;
  const durationMs = track ? track.endMs - track.startMs : 0;

  const patch = (next: Partial<PresenterProLayerTrack>) => {
    if (!focusKey || !track) return;
    onPatchTrack(focusKey, clampProTrack({ ...track, ...next }, slideDurationMs));
  };

  return (
    <aside className="flex w-[15.5rem] shrink-0 flex-col border-l border-white/[0.08] bg-[#0a0c0f]">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.08] px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Clock className="h-3.5 w-3.5 shrink-0 text-[#f5b91b]" strokeWidth={2} aria-hidden />
          <p className="truncate text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-200">Timing</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
          aria-label="Cerrar panel"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {!focusKey || !focusRow || !track ? (
          <p className="text-[11px] leading-relaxed text-zinc-500">
            {selectedStepKeys.length > 1
              ? "Selecciona un solo elemento en el lienzo para editar inicio, fin y duración."
              : "Haz clic en un elemento del slide para ajustar cuándo aparece y desaparece."}
          </p>
        ) : (
          <div className="space-y-3">
            <p className="truncate text-[12px] font-medium text-zinc-200" title={focusRow.label}>
              {focusRow.label}
            </p>

            <label className="block space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Inicio</span>
              <PresenterScrubNumberInput
                value={Math.round(track.startMs)}
                min={0}
                max={Math.max(0, slideDurationMs - MIN_PRO_LAYER_MS)}
                step={50}
                onKeyboardCommit={(v) => {
                  const startMs = Math.min(v, track.endMs - MIN_PRO_LAYER_MS);
                  patch({ startMs });
                }}
                onScrubLive={(v) => {
                  const startMs = Math.min(v, track.endMs - MIN_PRO_LAYER_MS);
                  patch({ startMs });
                }}
                onScrubEnd={() => {}}
              />
              <span className="text-[10px] tabular-nums text-zinc-600">{formatProMs(track.startMs)}</span>
            </label>

            <label className="block space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Fin</span>
              <PresenterScrubNumberInput
                value={Math.round(track.endMs)}
                min={track.startMs + MIN_PRO_LAYER_MS}
                max={slideDurationMs}
                step={50}
                onKeyboardCommit={(v) => {
                  const endMs = Math.max(v, track.startMs + MIN_PRO_LAYER_MS);
                  patch({ endMs });
                }}
                onScrubLive={(v) => {
                  const endMs = Math.max(v, track.startMs + MIN_PRO_LAYER_MS);
                  patch({ endMs });
                }}
                onScrubEnd={() => {}}
              />
              <span className="text-[10px] tabular-nums text-zinc-600">{formatProMs(track.endMs)}</span>
            </label>

            <label className="block space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Duración</span>
              <PresenterScrubNumberInput
                value={Math.round(durationMs)}
                min={MIN_PRO_LAYER_MS}
                max={slideDurationMs}
                step={50}
                onKeyboardCommit={(v) => {
                  const dur = Math.max(MIN_PRO_LAYER_MS, v);
                  let endMs = track.startMs + dur;
                  if (endMs > slideDurationMs) endMs = slideDurationMs;
                  patch({ endMs });
                }}
                onScrubLive={(v) => {
                  const dur = Math.max(MIN_PRO_LAYER_MS, v);
                  let endMs = track.startMs + dur;
                  if (endMs > slideDurationMs) endMs = slideDurationMs;
                  patch({ endMs });
                }}
                onScrubEnd={() => {}}
              />
              <span className="text-[10px] tabular-nums text-zinc-600">{formatProMs(durationMs)}</span>
            </label>
          </div>
        )}
      </div>
    </aside>
  );
}
