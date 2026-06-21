import {
  cloneCompositionTransform,
  createDefaultComposition,
  ensureCompositionTransformFields,
  type CompositionEasing,
  type CompositionTransform,
  type VideoEditorComposition,
  type VideoEditorOverlayClip,
} from "./video-editor-composition-types";
import {
  getAllCompositionKeyframeTimes,
  normalizeCompositionData,
  removeCompositionPropertyKeyframe,
  resolveCompositionTransformFromTracks,
  upsertAllCompositionPropertiesAtTime,
  upsertCompositionPropertiesAtTime,
  type CompositionScalarProperty,
} from "./video-editor-composition-properties";

export type {
  CompositionPropertyKeyframe,
  CompositionPropertyTrack,
  CompositionScalarProperty,
} from "./video-editor-composition-properties";

export {
  ALL_COMPOSITION_PROPERTIES,
  COMPOSITION_CROP_PROPERTIES,
  COMPOSITION_PROPERTY_LABELS,
  COMPOSITION_TRANSFORM_PROPERTIES,
  compositionHasAnimation,
  getAggregatedKeyframeTimes,
  getAllCompositionKeyframeTimes,
  getPropertyKeyframeNavigation,
  getTransformPropertyValue,
  hasPropertyKeyframeNearTime,
  patchCompositionPropertyEasing,
  removeCompositionKeyframesAtTime,
  setTransformPropertyValue,
} from "./video-editor-composition-properties";

export function normalizeComposition(composition?: VideoEditorComposition | null): VideoEditorComposition {
  return normalizeCompositionData(composition);
}

/** Transform en un instante relativo al inicio del clip (segundos). */
export function resolveCompositionTransform(
  composition: VideoEditorComposition | null | undefined,
  localTimeSeconds: number,
): CompositionTransform {
  return resolveCompositionTransformFromTracks(composition, localTimeSeconds);
}

export function upsertCompositionKeyframe(
  composition: VideoEditorComposition,
  time: number,
  transform: CompositionTransform,
): VideoEditorComposition {
  return upsertAllCompositionPropertiesAtTime(composition, time, transform);
}

export function upsertCompositionPropertiesAtPlayhead(
  composition: VideoEditorComposition,
  time: number,
  transform: CompositionTransform,
  properties: Iterable<CompositionScalarProperty>,
): VideoEditorComposition {
  return upsertCompositionPropertiesAtTime(composition, time, transform, properties);
}

export function patchCompositionKeyframeEasing(
  composition: VideoEditorComposition,
  keyframeId: string,
  easing: CompositionEasing,
): VideoEditorComposition {
  const comp = normalizeCompositionData(composition);
  return {
    ...comp,
    tracks: comp.tracks.map((track) => ({
      ...track,
      keyframes: track.keyframes.map((kf) => kf.id === keyframeId ? { ...kf, easing } : kf),
    })),
  };
}

export function removeCompositionKeyframe(
  composition: VideoEditorComposition,
  keyframeId: string,
): VideoEditorComposition {
  const comp = normalizeCompositionData(composition);
  return {
    ...comp,
    tracks: comp.tracks
      .map((track) => ({
        ...track,
        keyframes: track.keyframes.filter((kf) => kf.id !== keyframeId),
      }))
      .filter((track) => track.keyframes.length > 0),
  };
}

export function updateCompositionBase(
  composition: VideoEditorComposition,
  transform: CompositionTransform,
): VideoEditorComposition {
  const comp = normalizeCompositionData(composition);
  return { ...comp, base: cloneCompositionTransform(transform) };
}

export function activeOverlayClipsAtTime(
  overlays: VideoEditorOverlayClip[],
  time: number,
): VideoEditorOverlayClip[] {
  return overlays.filter((o) => time >= o.startTime && time < o.startTime + o.durationSeconds);
}

/** Compat: keyframes agregados para UI legacy. */
export function getLegacyCompositionKeyframes(composition: VideoEditorComposition) {
  return getAllCompositionKeyframeTimes(composition).map((time) => ({
    id: `agg-${time}`,
    time,
    easing: "easeInOut" as CompositionEasing,
  }));
}

export { ensureCompositionTransformFields };
