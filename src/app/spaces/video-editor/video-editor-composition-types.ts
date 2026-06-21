import type { FreehandObject } from "../FreehandStudio";

/** Easing hacia el siguiente keyframe. */
export type CompositionEasing = "linear" | "easeIn" | "easeOut" | "easeInOut";

/** Transform normalizada respecto al frame de composición (0–1). */
export type CompositionTransform = {
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  /** Recorte del media fuente (0–1 dentro del asset). */
  crop: { x: number; y: number; width: number; height: number };
};

export type CompositionKeyframe = {
  id: string;
  /** Segundos relativos al inicio del clip (visual u overlay). */
  time: number;
  transform: CompositionTransform;
  /** Interpolación hacia el keyframe siguiente. */
  easing: CompositionEasing;
};

export type VideoEditorComposition = {
  keyframes: CompositionKeyframe[];
};

export type VideoEditorOverlayClip = {
  id: string;
  startTime: number;
  durationSeconds: number;
  title: string;
  object: FreehandObject;
  composition: VideoEditorComposition;
};

export const DEFAULT_COMPOSITION_TRANSFORM: CompositionTransform = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  opacity: 1,
  crop: { x: 0, y: 0, width: 1, height: 1 },
};

export function cloneCompositionTransform(t: CompositionTransform): CompositionTransform {
  return {
    ...t,
    crop: { ...t.crop },
  };
}

export function createDefaultComposition(): VideoEditorComposition {
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

export const COMPOSITION_EASING_OPTIONS: { id: CompositionEasing; label: string }[] = [
  { id: "linear", label: "Lineal" },
  { id: "easeIn", label: "Entrada" },
  { id: "easeOut", label: "Salida" },
  { id: "easeInOut", label: "Suave" },
];
