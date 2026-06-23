import type { FreehandObject } from "../FreehandStudio";
import {
  collectCanonicalSteps,
  presenterStepKey,
  revealTargetKey,
  type PresenterRevealStep,
} from "./presenter-group-animations";
import { countObjectsInGroup } from "./presenter-group-bounds";

export type PresenterEditorMode = "simple" | "pro";

export type PresenterProLayerTrack = {
  startMs: number;
  endMs: number;
};

export const DEFAULT_PRO_SLIDE_DURATION_MS = 8000;
export const MIN_PRO_LAYER_MS = 50;
export const MIN_PRO_SLIDE_MS = 500;
export const PRO_TIMELINE_PX_PER_SEC = 72;

export type PlayProTimingState = {
  playheadMs: number;
  slideDurationMs: number;
  tracksByKey: Record<string, PresenterProLayerTrack>;
};

export type ProTimelineRow = {
  key: string;
  label: string;
};

function truncateLabel(value: string, max = 28): string {
  const t = value.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function objectDisplayName(o: FreehandObject | undefined): string {
  if (!o) return "Elemento";
  if (o.type === "text") {
    const text = typeof (o as { text?: unknown }).text === "string" ? (o as { text: string }).text : "";
    return text.trim() ? truncateLabel(text) : "Texto";
  }
  if (o.type === "image") return "Imagen";
  if (o.type === "path") return "Trazo";
  if (o.type === "rect") return "Rectángulo";
  if (o.type === "ellipse") return "Elipse";
  if (o.type === "booleanGroup") return "Compuesto";
  if (o.type === "clippingContainer") return "Recorte";
  return "Elemento";
}

function rowLabel(s: PresenterRevealStep, objects: FreehandObject[]): string {
  if (s.kind === "group") {
    const n = countObjectsInGroup(objects, s.groupId);
    return `Grupo · ${n} elementos`;
  }
  return objectDisplayName(objects.find((x) => x.id === s.objectId));
}

export function listProTimelineRows(objects: FreehandObject[]): ProTimelineRow[] {
  return collectCanonicalSteps(objects).map((s) => ({
    key: presenterStepKey(s),
    label: rowLabel(s, objects),
  }));
}

export function clampProTrack(
  track: PresenterProLayerTrack,
  slideDurationMs: number,
): PresenterProLayerTrack {
  const dur = Math.max(MIN_PRO_SLIDE_MS, slideDurationMs);
  let startMs = Math.max(0, Math.min(track.startMs, dur - MIN_PRO_LAYER_MS));
  let endMs = Math.max(startMs + MIN_PRO_LAYER_MS, Math.min(track.endMs, dur));
  if (endMs > dur) {
    endMs = dur;
    startMs = Math.max(0, endMs - MIN_PRO_LAYER_MS);
  }
  return { startMs, endMs };
}

export function resolveProTrack(
  trackKey: string,
  tracks: Record<string, PresenterProLayerTrack>,
  slideDurationMs: number,
): PresenterProLayerTrack {
  const dur = Math.max(MIN_PRO_SLIDE_MS, slideDurationMs);
  const t = tracks[trackKey];
  if (t) return clampProTrack(t, dur);
  return { startMs: 0, endMs: dur };
}

export function isObjectVisibleAtProTime(
  o: FreehandObject,
  playheadMs: number,
  tracks: Record<string, PresenterProLayerTrack>,
  slideDurationMs: number,
): boolean {
  const k = revealTargetKey(o);
  const track = resolveProTrack(k, tracks, slideDurationMs);
  return playheadMs >= track.startMs && playheadMs < track.endMs;
}

export function formatProMs(ms: number): string {
  const clamped = Math.max(0, ms);
  if (clamped >= 1000) {
    const s = clamped / 1000;
    return s >= 10 ? `${s.toFixed(1)} s` : `${s.toFixed(2)} s`;
  }
  return `${Math.round(clamped)} ms`;
}

export function formatProClock(ms: number): string {
  const totalSec = Math.max(0, ms) / 1000;
  const m = Math.floor(totalSec / 60);
  const s = totalSec - m * 60;
  if (m > 0) return `${m}:${s.toFixed(1).padStart(4, "0")}`;
  return `0:${s.toFixed(1).padStart(4, "0")}`;
}
