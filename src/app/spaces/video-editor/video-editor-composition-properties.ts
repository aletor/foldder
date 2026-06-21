import {
  cloneCompositionTransform,
  DEFAULT_COMPOSITION_TRANSFORM,
  ensureCompositionTransformFields,
  type CompositionEasing,
  type CompositionKeyframe,
  type CompositionTransform,
  type VideoEditorComposition,
} from "./video-editor-composition-types";

/** Propiedades escalares animables (estilo Resolve Inspector). */
export type CompositionScalarProperty =
  | "x"
  | "y"
  | "width"
  | "height"
  | "opacity"
  | "rotation"
  | "anchorX"
  | "anchorY"
  | "flipX"
  | "flipY"
  | "crop.x"
  | "crop.y"
  | "crop.width"
  | "crop.height";

export type CompositionPropertyKeyframe = {
  id: string;
  time: number;
  value: number;
  easing: CompositionEasing;
};

export type CompositionPropertyTrack = {
  property: CompositionScalarProperty;
  keyframes: CompositionPropertyKeyframe[];
};

export const COMPOSITION_TRANSFORM_PROPERTIES: CompositionScalarProperty[] = [
  "x",
  "y",
  "width",
  "height",
  "opacity",
  "rotation",
  "anchorX",
  "anchorY",
  "flipX",
  "flipY",
];

export const COMPOSITION_CROP_PROPERTIES: CompositionScalarProperty[] = [
  "crop.x",
  "crop.y",
  "crop.width",
  "crop.height",
];

export const ALL_COMPOSITION_PROPERTIES: CompositionScalarProperty[] = [
  ...COMPOSITION_TRANSFORM_PROPERTIES,
  ...COMPOSITION_CROP_PROPERTIES,
];

export const COMPOSITION_PROPERTY_LABELS: Record<CompositionScalarProperty, string> = {
  x: "Posición X",
  y: "Posición Y",
  width: "Zoom X",
  height: "Zoom Y",
  opacity: "Opacidad",
  rotation: "Rotación",
  anchorX: "Ancla X",
  anchorY: "Ancla Y",
  flipX: "Voltear H",
  flipY: "Voltear V",
  "crop.x": "Recorte X",
  "crop.y": "Recorte Y",
  "crop.width": "Recorte Ancho",
  "crop.height": "Recorte Alto",
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function easeProgress(t: number, easing: CompositionEasing): number {
  const x = clamp01(t);
  switch (easing) {
    case "easeIn":
      return x * x;
    case "easeOut":
      return 1 - (1 - x) * (1 - x);
    case "easeInOut":
      return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    case "linear":
    default:
      return x;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + 180) % 360) - 180;
  if (diff < -180) diff += 360;
  return a + diff * t;
}

export function getTransformPropertyValue(transform: CompositionTransform, property: CompositionScalarProperty): number {
  switch (property) {
    case "x": return transform.x;
    case "y": return transform.y;
    case "width": return transform.width;
    case "height": return transform.height;
    case "opacity": return transform.opacity;
    case "rotation": return transform.rotation;
    case "anchorX": return transform.anchorX;
    case "anchorY": return transform.anchorY;
    case "flipX": return transform.flipX ? 1 : 0;
    case "flipY": return transform.flipY ? 1 : 0;
    case "crop.x": return transform.crop.x;
    case "crop.y": return transform.crop.y;
    case "crop.width": return transform.crop.width;
    case "crop.height": return transform.crop.height;
    default: return 0;
  }
}

export function setTransformPropertyValue(
  transform: CompositionTransform,
  property: CompositionScalarProperty,
  value: number,
): CompositionTransform {
  const next = cloneCompositionTransform(transform);
  switch (property) {
    case "x": next.x = value; break;
    case "y": next.y = value; break;
    case "width": next.width = value; break;
    case "height": next.height = value; break;
    case "opacity": next.opacity = value; break;
    case "rotation": next.rotation = value; break;
    case "anchorX": next.anchorX = value; break;
    case "anchorY": next.anchorY = value; break;
    case "flipX": next.flipX = value >= 0.5; break;
    case "flipY": next.flipY = value >= 0.5; break;
    case "crop.x": next.crop.x = value; break;
    case "crop.y": next.crop.y = value; break;
    case "crop.width": next.crop.width = value; break;
    case "crop.height": next.crop.height = value; break;
    default: break;
  }
  return next;
}

function interpolatePropertyValue(
  property: CompositionScalarProperty,
  a: number,
  b: number,
  t: number,
): number {
  if (property === "rotation") return lerpAngle(a, b, t);
  if (property === "flipX" || property === "flipY") return t < 0.5 ? a : b;
  return lerp(a, b, t);
}

function sortTrackKeyframes(track: CompositionPropertyTrack): CompositionPropertyTrack {
  return {
    ...track,
    keyframes: [...track.keyframes].sort((a, b) => a.time - b.time),
  };
}

function resolveScalarAtTime(
  track: CompositionPropertyTrack,
  baseValue: number,
  localTime: number,
): number {
  const keyframes = sortTrackKeyframes(track).keyframes;
  const t = Math.max(0, localTime);
  if (!keyframes.length) return baseValue;
  if (t <= keyframes[0]!.time) return keyframes[0]!.value;
  const last = keyframes[keyframes.length - 1]!;
  if (t >= last.time) return last.value;
  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i]!;
    const b = keyframes[i + 1]!;
    if (t < a.time || t > b.time) continue;
    const span = b.time - a.time;
    const raw = span <= 1e-9 ? 1 : (t - a.time) / span;
    const eased = easeProgress(raw, a.easing);
    return interpolatePropertyValue(track.property, a.value, b.value, eased);
  }
  return last.value;
}

export function migrateLegacyKeyframes(keyframes: CompositionKeyframe[]): VideoEditorComposition {
  const base = ensureCompositionTransformFields(keyframes[0]?.transform);
  const trackMap = new Map<CompositionScalarProperty, CompositionPropertyKeyframe[]>();
  for (const kf of keyframes) {
    const transform = ensureCompositionTransformFields(kf.transform);
    for (const property of ALL_COMPOSITION_PROPERTIES) {
      const value = getTransformPropertyValue(transform, property);
      const list = trackMap.get(property) ?? [];
      const existing = list.find((item) => Math.abs(item.time - kf.time) < 0.001);
      if (existing) {
        existing.value = value;
        existing.easing = kf.easing;
      } else {
        list.push({
          id: `pkf-${property}-${kf.id}`,
          time: kf.time,
          value,
          easing: kf.easing,
        });
      }
      trackMap.set(property, list);
    }
  }
  return {
    base,
    tracks: [...trackMap.entries()].map(([property, kfs]) => ({
      property,
      keyframes: kfs.sort((a, b) => a.time - b.time),
    })),
  };
}

export function normalizeCompositionData(composition?: VideoEditorComposition | null): VideoEditorComposition {
  if (composition?.base && composition.tracks) {
    return {
      base: ensureCompositionTransformFields(composition.base),
      tracks: composition.tracks.map((track) => sortTrackKeyframes(track)),
    };
  }
  if (composition?.keyframes?.length) {
    return migrateLegacyKeyframes(composition.keyframes);
  }
  return {
    base: cloneCompositionTransform(DEFAULT_COMPOSITION_TRANSFORM),
    tracks: [],
  };
}

export function resolveCompositionTransformFromTracks(
  composition: VideoEditorComposition | null | undefined,
  localTimeSeconds: number,
): CompositionTransform {
  const comp = normalizeCompositionData(composition);
  let transform = cloneCompositionTransform(comp.base);
  for (const track of comp.tracks) {
    const baseValue = getTransformPropertyValue(transform, track.property);
    const value = resolveScalarAtTime(track, baseValue, localTimeSeconds);
    transform = setTransformPropertyValue(transform, track.property, value);
  }
  return transform;
}

export function compositionHasAnimation(composition?: VideoEditorComposition | null): boolean {
  const comp = normalizeCompositionData(composition);
  return comp.tracks.some((track) => track.keyframes.length > 0);
}

export function getAllCompositionKeyframeTimes(composition?: VideoEditorComposition | null): number[] {
  const comp = normalizeCompositionData(composition);
  const times = new Set<number>();
  for (const track of comp.tracks) {
    for (const kf of track.keyframes) times.add(kf.time);
  }
  return [...times].sort((a, b) => a - b);
}

export function upsertCompositionPropertiesAtTime(
  composition: VideoEditorComposition,
  time: number,
  transform: CompositionTransform,
  properties: Iterable<CompositionScalarProperty>,
  easing: CompositionEasing = "easeInOut",
): VideoEditorComposition {
  const comp = normalizeCompositionData(composition);
  const rounded = Math.max(0, Math.round(time * 1000) / 1000);
  const propertyList = [...properties];
  const nextTracks = [...comp.tracks];

  for (const property of propertyList) {
    const value = getTransformPropertyValue(transform, property);
    const trackIndex = nextTracks.findIndex((track) => track.property === property);
    const track = trackIndex >= 0 ? nextTracks[trackIndex]! : { property, keyframes: [] };
    const keyframes = [...track.keyframes];
    const existingIdx = keyframes.findIndex((kf) => Math.abs(kf.time - rounded) < 0.001);
    if (existingIdx >= 0) {
      keyframes[existingIdx] = { ...keyframes[existingIdx]!, value, easing: keyframes[existingIdx]!.easing ?? easing };
    } else {
      keyframes.push({
        id: `pkf-${Date.now()}-${property}-${Math.random().toString(36).slice(2, 6)}`,
        time: rounded,
        value,
        easing,
      });
    }
    const nextTrack = { property, keyframes: keyframes.sort((a, b) => a.time - b.time) };
    if (trackIndex >= 0) nextTracks[trackIndex] = nextTrack;
    else nextTracks.push(nextTrack);
  }

  const nextBase = rounded <= 0.001 && propertyList.length === ALL_COMPOSITION_PROPERTIES.length
    ? cloneCompositionTransform(transform)
    : comp.base;

  return { base: nextBase, tracks: nextTracks };
}

export function upsertAllCompositionPropertiesAtTime(
  composition: VideoEditorComposition,
  time: number,
  transform: CompositionTransform,
  easing: CompositionEasing = "easeInOut",
): VideoEditorComposition {
  return upsertCompositionPropertiesAtTime(composition, time, transform, ALL_COMPOSITION_PROPERTIES, easing);
}

export function patchCompositionPropertyEasing(
  composition: VideoEditorComposition,
  property: CompositionScalarProperty,
  keyframeId: string,
  easing: CompositionEasing,
): VideoEditorComposition {
  const comp = normalizeCompositionData(composition);
  return {
    ...comp,
    tracks: comp.tracks.map((track) => track.property !== property ? track : {
      ...track,
      keyframes: track.keyframes.map((kf) => kf.id === keyframeId ? { ...kf, easing } : kf),
    }),
  };
}

export function removeCompositionPropertyKeyframe(
  composition: VideoEditorComposition,
  property: CompositionScalarProperty,
  keyframeId: string,
): VideoEditorComposition {
  const comp = normalizeCompositionData(composition);
  return {
    ...comp,
    tracks: comp.tracks
      .map((track) => track.property !== property ? track : {
        ...track,
        keyframes: track.keyframes.filter((kf) => kf.id !== keyframeId),
      })
      .filter((track) => track.keyframes.length > 0),
  };
}

export function removeCompositionKeyframesAtTime(
  composition: VideoEditorComposition,
  time: number,
  tolerance = 0.001,
): VideoEditorComposition {
  const comp = normalizeCompositionData(composition);
  return {
    ...comp,
    tracks: comp.tracks
      .map((track) => ({
        ...track,
        keyframes: track.keyframes.filter((kf) => Math.abs(kf.time - time) >= tolerance),
      }))
      .filter((track) => track.keyframes.length > 0),
  };
}

export function hasPropertyKeyframeNearTime(
  composition: VideoEditorComposition,
  property: CompositionScalarProperty,
  time: number,
  tolerance = 0.05,
): boolean {
  const comp = normalizeCompositionData(composition);
  const track = comp.tracks.find((item) => item.property === property);
  if (!track) return false;
  return track.keyframes.some((kf) => Math.abs(kf.time - time) < tolerance);
}

export function getPropertyKeyframeNavigation(
  composition: VideoEditorComposition,
  property: CompositionScalarProperty,
  localTime: number,
): { prev?: number; next?: number; current?: number } {
  const comp = normalizeCompositionData(composition);
  const track = comp.tracks.find((item) => item.property === property);
  if (!track) return {};
  const times = [...new Set(track.keyframes.map((kf) => kf.time))].sort((a, b) => a - b);
  const current = times.find((time) => Math.abs(time - localTime) < 0.05);
  const prev = [...times].reverse().find((time) => time < localTime - 0.001);
  const next = times.find((time) => time > localTime + 0.001);
  return { prev, next, current };
}

export function getAggregatedKeyframeTimes(composition: VideoEditorComposition): Array<{ time: number; properties: CompositionScalarProperty[] }> {
  const comp = normalizeCompositionData(composition);
  const map = new Map<number, CompositionScalarProperty[]>();
  for (const track of comp.tracks) {
    for (const kf of track.keyframes) {
      const rounded = Math.round(kf.time * 1000) / 1000;
      const list = map.get(rounded) ?? [];
      if (!list.includes(track.property)) list.push(track.property);
      map.set(rounded, list);
    }
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([time, properties]) => ({ time, properties }));
}
