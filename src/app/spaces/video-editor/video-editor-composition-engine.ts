import { v4 as uuidv4 } from "uuid";
import type { FreehandObject } from "../FreehandStudio";
import {
  cloneCompositionTransform,
  createDefaultComposition,
  DEFAULT_COMPOSITION_TRANSFORM,
  type CompositionTransform,
  type VideoEditorComposition,
  type VideoEditorOverlayClip,
} from "./video-editor-composition-types";
import { normalizeComposition, resolveCompositionTransform, upsertCompositionKeyframe, upsertCompositionPropertiesAtPlayhead } from "./video-editor-composition-math";
import type { CompositionScalarProperty } from "./video-editor-composition-properties";
import { clampTransform } from "./video-editor-composition-units";
import type { VideoEditorClip, VideoEditorNodeData } from "./video-editor-types";

export function createTextOverlayObject(compWidth: number, compHeight: number): FreehandObject {
  const w = Math.min(640, compWidth * 0.5);
  const h = 96;
  return {
    id: uuidv4(),
    type: "text",
    name: "Texto",
    x: (compWidth - w) / 2,
    y: compHeight * 0.12,
    width: w,
    height: h,
    text: "Texto",
    textMode: "area",
    fontFamily: "Inter, system-ui, sans-serif",
    fontSize: 48,
    fontWeight: 700,
    lineHeight: 1.1,
    letterSpacing: 0,
    textAlign: "center",
    fill: { type: "solid", color: "#ffffff" },
    stroke: "none",
    strokeWidth: 0,
    opacity: 1,
    visible: true,
    rotation: 0,
  } as FreehandObject;
}

export function createShapeOverlayObject(
  compWidth: number,
  compHeight: number,
  kind: "rect" | "color",
): FreehandObject {
  const w = compWidth * 0.4;
  const h = kind === "color" ? 72 : 120;
  return {
    id: uuidv4(),
    type: "rect",
    name: kind === "color" ? "Color" : "Forma",
    x: (compWidth - w) / 2,
    y: compHeight - h - compHeight * 0.08,
    width: w,
    height: h,
    fill: { type: "solid", color: kind === "color" ? "#3a8f96" : "transparent" },
    stroke: kind === "color" ? "none" : "#ffffff",
    strokeWidth: kind === "color" ? 0 : 3,
    opacity: kind === "color" ? 0.85 : 1,
    visible: true,
    rotation: 0,
  } as FreehandObject;
}

export function addVideoEditorOverlay(
  data: VideoEditorNodeData,
  object: FreehandObject,
  startTime: number,
  durationSeconds: number,
): VideoEditorNodeData {
  const nextOrder = Math.max(-1, ...(data.overlayClips ?? []).map((o) => o.layerOrder ?? 0)) + 1;
  const overlay: VideoEditorOverlayClip = {
    id: uuidv4(),
    startTime: Math.max(0, startTime),
    durationSeconds: Math.max(0.1, durationSeconds),
    title: object.name || "Capa",
    object,
    composition: createDefaultComposition(),
    layerOrder: nextOrder,
  };
  return {
    ...data,
    overlayClips: [...(data.overlayClips ?? []), overlay],
    selectedOverlayId: overlay.id,
    selectedClipId: undefined,
  };
}

export function patchVideoEditorOverlay(
  data: VideoEditorNodeData,
  overlayId: string,
  patch: Partial<Pick<VideoEditorOverlayClip, "title" | "startTime" | "durationSeconds" | "object" | "composition" | "layerOrder">>,
): VideoEditorNodeData {
  return {
    ...data,
    overlayClips: (data.overlayClips ?? []).map((o) => (o.id === overlayId ? { ...o, ...patch } : o)),
  };
}

export function removeVideoEditorOverlay(data: VideoEditorNodeData, overlayId: string): VideoEditorNodeData {
  return {
    ...data,
    overlayClips: (data.overlayClips ?? []).filter((o) => o.id !== overlayId),
    selectedOverlayId: data.selectedOverlayId === overlayId ? undefined : data.selectedOverlayId,
  };
}

export function moveVideoEditorOverlay(
  data: VideoEditorNodeData,
  overlayId: string,
  startTime: number,
): VideoEditorNodeData {
  return patchVideoEditorOverlay(data, overlayId, { startTime: Math.max(0, startTime) });
}

export function resizeVideoEditorOverlay(
  data: VideoEditorNodeData,
  overlayId: string,
  patch: { startTime?: number; durationSeconds: number },
): VideoEditorNodeData {
  const overlay = (data.overlayClips ?? []).find((o) => o.id === overlayId);
  if (!overlay) return data;
  const startTime = patch.startTime ?? overlay.startTime;
  return patchVideoEditorOverlay(data, overlayId, {
    startTime: Math.max(0, startTime),
    durationSeconds: Math.max(0.1, patch.durationSeconds),
  });
}

export function reorderVideoEditorOverlay(
  data: VideoEditorNodeData,
  overlayId: string,
  direction: "up" | "down",
): VideoEditorNodeData {
  const sorted = [...(data.overlayClips ?? [])].sort((a, b) => (a.layerOrder ?? 0) - (b.layerOrder ?? 0));
  const index = sorted.findIndex((o) => o.id === overlayId);
  if (index < 0) return data;
  const swapIndex = direction === "up" ? index + 1 : index - 1;
  if (swapIndex < 0 || swapIndex >= sorted.length) return data;
  const current = sorted[index]!;
  const target = sorted[swapIndex]!;
  const currentOrder = current.layerOrder ?? index;
  const targetOrder = target.layerOrder ?? swapIndex;
  return {
    ...data,
    overlayClips: (data.overlayClips ?? []).map((overlay) => {
      if (overlay.id === current.id) return { ...overlay, layerOrder: targetOrder };
      if (overlay.id === target.id) return { ...overlay, layerOrder: currentOrder };
      return overlay;
    }),
  };
}

export function patchClipCompositionCropPreset(
  data: VideoEditorNodeData,
  clipId: string,
  preset: CompositionCropPreset,
): VideoEditorNodeData {
  return {
    ...data,
    tracks: Object.fromEntries(
      Object.entries(data.tracks).map(([trackId, clips]) => [
        trackId,
        clips.map((clip) => (clip.id === clipId ? { ...clip, compositionCropPreset: preset } : clip)),
      ]),
    ) as VideoEditorNodeData["tracks"],
  };
}

export type CompositionCropPreset = "fit" | "fill" | "custom";

export function applyCompositionCropPreset(
  transform: CompositionTransform,
  preset: CompositionCropPreset,
): CompositionTransform {
  const base = cloneCompositionTransform(transform);
  if (preset === "fit") {
    return clampTransform({
      ...base,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      crop: { x: 0, y: 0, width: 1, height: 1 },
    });
  }
  if (preset === "fill") {
    return clampTransform({
      ...base,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      crop: { x: 0.05, y: 0.05, width: 0.9, height: 0.9 },
    });
  }
  return base;
}

export type CompositionMotionPreset = "zoom_in" | "zoom_out" | "pan_left" | "pan_right";

function buildMotionKeyframePair(
  durationSeconds: number,
  preset: CompositionMotionPreset,
): VideoEditorComposition {
  const start = clampTransform(cloneCompositionTransform(DEFAULT_COMPOSITION_TRANSFORM));
  const end = clampTransform(cloneCompositionTransform(DEFAULT_COMPOSITION_TRANSFORM));
  const span = Math.max(0.5, durationSeconds);
  switch (preset) {
    case "zoom_in":
      end.width = 1.15;
      end.height = 1.15;
      end.x = -0.075;
      end.y = -0.075;
      break;
    case "zoom_out":
      start.width = 1.15;
      start.height = 1.15;
      start.x = -0.075;
      start.y = -0.075;
      break;
    case "pan_left":
      end.x = -0.12;
      break;
    case "pan_right":
      end.x = 0.12;
      break;
  }
  let comp = createDefaultComposition();
  comp = upsertCompositionKeyframe(comp, 0, start);
  comp = upsertCompositionKeyframe(comp, span, end);
  return comp;
}

export function applyCompositionMotionPreset(
  data: VideoEditorNodeData,
  target: { kind: "clip"; clipId: string } | { kind: "overlay"; overlayId: string },
  preset: CompositionMotionPreset,
): VideoEditorNodeData {
  if (target.kind === "clip") {
    const clip = Object.values(data.tracks).flat().find((c) => c.id === target.clipId);
    if (!clip) return data;
    const comp = buildMotionKeyframePair(clip.durationSeconds, preset);
    return patchClipComposition(data, clip.id, comp);
  }
  const overlay = (data.overlayClips ?? []).find((o) => o.id === target.overlayId);
  if (!overlay) return data;
  const comp = buildMotionKeyframePair(overlay.durationSeconds, preset);
  return patchVideoEditorOverlay(data, overlay.id, { composition: comp });
}

export function patchClipComposition(
  data: VideoEditorNodeData,
  clipId: string,
  composition: VideoEditorComposition,
): VideoEditorNodeData {
  const tracks = { ...data.tracks };
  for (const trackId of Object.keys(tracks)) {
    tracks[trackId] = (tracks[trackId] ?? []).map((c) =>
      c.id === clipId ? { ...c, composition: normalizeComposition(composition) } : c,
    );
  }
  return { ...data, tracks };
}

export function ensureClipComposition(clip: VideoEditorClip): VideoEditorComposition {
  return normalizeComposition(clip.composition);
}

export function setCompositionKeyframeAtPlayhead(
  data: VideoEditorNodeData,
  target: { kind: "clip"; clipId: string } | { kind: "overlay"; overlayId: string },
  playheadTime: number,
  transform: CompositionTransform,
  properties?: Iterable<CompositionScalarProperty>,
): VideoEditorNodeData {
  const write = (composition: VideoEditorComposition, localTime: number) => (
    properties
      ? upsertCompositionPropertiesAtPlayhead(composition, localTime, transform, properties)
      : upsertCompositionKeyframe(composition, localTime, transform)
  );
  if (target.kind === "clip") {
    const clip = Object.values(data.tracks).flat().find((c) => c.id === target.clipId);
    if (!clip) return data;
    const localTime = Math.max(0, playheadTime - clip.startTime);
    const comp = write(ensureClipComposition(clip), localTime);
    return patchClipComposition(data, clip.id, comp);
  }
  const overlay = (data.overlayClips ?? []).find((o) => o.id === target.overlayId);
  if (!overlay) return data;
  const localTime = Math.max(0, playheadTime - overlay.startTime);
  const comp = write(normalizeComposition(overlay.composition), localTime);
  return patchVideoEditorOverlay(data, overlay.id, { composition: comp });
}

export function setCompositionBaseTransform(
  data: VideoEditorNodeData,
  target: { kind: "clip"; clipId: string } | { kind: "overlay"; overlayId: string },
  transform: CompositionTransform,
): VideoEditorNodeData {
  if (target.kind === "clip") {
    const clip = Object.values(data.tracks).flat().find((c) => c.id === target.clipId);
    if (!clip) return data;
    const comp = normalizeComposition(ensureClipComposition(clip));
    return patchClipComposition(data, clip.id, { ...comp, base: clampTransform(transform) });
  }
  const overlay = (data.overlayClips ?? []).find((o) => o.id === target.overlayId);
  if (!overlay) return data;
  const comp = normalizeComposition(overlay.composition);
  return patchVideoEditorOverlay(data, overlay.id, { composition: { ...comp, base: clampTransform(transform) } });
}

export function getCompositionTargetTransform(
  data: VideoEditorNodeData,
  target: { kind: "clip"; clipId: string } | { kind: "overlay"; overlayId: string },
  playheadTime: number,
): CompositionTransform | null {
  if (target.kind === "clip") {
    const clip = Object.values(data.tracks).flat().find((c) => c.id === target.clipId);
    if (!clip) return null;
    const localTime = Math.max(0, playheadTime - clip.startTime);
    return resolveCompositionTransform(ensureClipComposition(clip), localTime);
  }
  const overlay = (data.overlayClips ?? []).find((o) => o.id === target.overlayId);
  if (!overlay) return null;
  const localTime = Math.max(0, playheadTime - overlay.startTime);
  return resolveCompositionTransform(overlay.composition, localTime);
}
