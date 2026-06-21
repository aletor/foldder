import {
  cloneCompositionTransform,
  DEFAULT_COMPOSITION_TRANSFORM,
  type CompositionEasing,
  type CompositionTransform,
  type VideoEditorComposition,
  type VideoEditorOverlayClip,
} from "./video-editor-composition-types";

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

function lerpTransform(a: CompositionTransform, b: CompositionTransform, t: number): CompositionTransform {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    width: lerp(a.width, b.width, t),
    height: lerp(a.height, b.height, t),
    opacity: lerp(a.opacity, b.opacity, t),
    crop: {
      x: lerp(a.crop.x, b.crop.x, t),
      y: lerp(a.crop.y, b.crop.y, t),
      width: lerp(a.crop.width, b.crop.width, t),
      height: lerp(a.crop.height, b.crop.height, t),
    },
  };
}

export function normalizeComposition(composition?: VideoEditorComposition | null): VideoEditorComposition {
  if (!composition?.keyframes?.length) {
    return {
      keyframes: [
        {
          id: "kf-0",
          time: 0,
          transform: cloneCompositionTransform(DEFAULT_COMPOSITION_TRANSFORM),
          easing: "easeInOut",
        },
      ],
    };
  }
  const keyframes = [...composition.keyframes]
    .filter((k) => k && Number.isFinite(k.time))
    .sort((a, b) => a.time - b.time);
  if (!keyframes.length) {
    return normalizeComposition(null);
  }
  return { keyframes };
}

/** Transform en un instante relativo al inicio del clip (segundos). */
export function resolveCompositionTransform(
  composition: VideoEditorComposition | null | undefined,
  localTimeSeconds: number,
): CompositionTransform {
  const comp = normalizeComposition(composition);
  const keyframes = comp.keyframes;
  const t = Math.max(0, localTimeSeconds);
  if (t <= keyframes[0]!.time) return cloneCompositionTransform(keyframes[0]!.transform);
  const last = keyframes[keyframes.length - 1]!;
  if (t >= last.time) return cloneCompositionTransform(last.transform);
  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i]!;
    const b = keyframes[i + 1]!;
    if (t < a.time || t > b.time) continue;
    const span = b.time - a.time;
    const raw = span <= 1e-9 ? 1 : (t - a.time) / span;
    const eased = easeProgress(raw, a.easing);
    return lerpTransform(a.transform, b.transform, eased);
  }
  return cloneCompositionTransform(last.transform);
}

export function upsertCompositionKeyframe(
  composition: VideoEditorComposition,
  time: number,
  transform: CompositionTransform,
): VideoEditorComposition {
  const comp = normalizeComposition(composition);
  const rounded = Math.max(0, Math.round(time * 1000) / 1000);
  const existingIdx = comp.keyframes.findIndex((k) => Math.abs(k.time - rounded) < 0.001);
  const next = [...comp.keyframes];
  if (existingIdx >= 0) {
    next[existingIdx] = {
      ...next[existingIdx]!,
      transform: cloneCompositionTransform(transform),
    };
  } else {
    next.push({
      id: `kf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      time: rounded,
      transform: cloneCompositionTransform(transform),
      easing: "easeInOut",
    });
    next.sort((a, b) => a.time - b.time);
  }
  return { keyframes: next };
}

export function patchCompositionKeyframeEasing(
  composition: VideoEditorComposition,
  keyframeId: string,
  easing: CompositionEasing,
): VideoEditorComposition {
  return {
    keyframes: normalizeComposition(composition).keyframes.map((k) =>
      k.id === keyframeId ? { ...k, easing } : k,
    ),
  };
}

export function removeCompositionKeyframe(
  composition: VideoEditorComposition,
  keyframeId: string,
): VideoEditorComposition {
  const next = normalizeComposition(composition).keyframes.filter((k) => k.id !== keyframeId);
  if (next.length === 0) return normalizeComposition(null);
  return { keyframes: next };
}

export function activeOverlayClipsAtTime(
  overlays: VideoEditorOverlayClip[],
  time: number,
): VideoEditorOverlayClip[] {
  return overlays.filter((o) => time >= o.startTime && time < o.startTime + o.durationSeconds);
}
