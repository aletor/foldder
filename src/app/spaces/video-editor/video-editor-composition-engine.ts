import { v4 as uuidv4 } from "uuid";
import type { FreehandObject } from "../FreehandStudio";
import {
  createDefaultComposition,
  type CompositionTransform,
  type VideoEditorComposition,
  type VideoEditorOverlayClip,
} from "./video-editor-composition-types";
import { normalizeComposition, resolveCompositionTransform, upsertCompositionKeyframe } from "./video-editor-composition-math";
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
  const overlay: VideoEditorOverlayClip = {
    id: uuidv4(),
    startTime: Math.max(0, startTime),
    durationSeconds: Math.max(0.1, durationSeconds),
    title: object.name || "Capa",
    object,
    composition: createDefaultComposition(),
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
  patch: Partial<Pick<VideoEditorOverlayClip, "title" | "startTime" | "durationSeconds" | "object" | "composition">>,
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
): VideoEditorNodeData {
  if (target.kind === "clip") {
    const clip = Object.values(data.tracks).flat().find((c) => c.id === target.clipId);
    if (!clip) return data;
    const localTime = Math.max(0, playheadTime - clip.startTime);
    const comp = upsertCompositionKeyframe(ensureClipComposition(clip), localTime, transform);
    return patchClipComposition(data, clip.id, comp);
  }
  const overlay = (data.overlayClips ?? []).find((o) => o.id === target.overlayId);
  if (!overlay) return data;
  const localTime = Math.max(0, playheadTime - overlay.startTime);
  const comp = upsertCompositionKeyframe(normalizeComposition(overlay.composition), localTime, transform);
  return patchVideoEditorOverlay(data, overlay.id, { composition: comp });
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
