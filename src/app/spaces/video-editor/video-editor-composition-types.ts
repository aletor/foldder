import type { FreehandObject } from "../FreehandStudio";
import type { CompositionPropertyTrack } from "./video-editor-composition-properties";

/** Easing hacia el siguiente keyframe. */
export type CompositionEasing = "linear" | "easeIn" | "easeOut" | "easeInOut";

/** Transform normalizada respecto al frame de composición (0–1). */
export type CompositionTransform = {
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  /** Grados, sentido horario. */
  rotation: number;
  /** Punto de ancla normalizado dentro del cuadro (0–1). */
  anchorX: number;
  anchorY: number;
  flipX: boolean;
  flipY: boolean;
  /** Recorte del media fuente (0–1 dentro del asset). */
  crop: { x: number; y: number; width: number; height: number };
};

/** @deprecated Formato legacy — se migra a base + tracks al leer. */
export type CompositionKeyframe = {
  id: string;
  time: number;
  transform: CompositionTransform;
  easing: CompositionEasing;
};

export type VideoEditorComposition = {
  /** Valores por defecto cuando una propiedad no tiene pista animada. */
  base: CompositionTransform;
  /** Pistas de keyframes por propiedad (estilo Resolve). */
  tracks: CompositionPropertyTrack[];
  /** @deprecated Solo lectura/migración desde proyectos antiguos. */
  keyframes?: CompositionKeyframe[];
};

export type VideoEditorOverlayClip = {
  id: string;
  startTime: number;
  durationSeconds: number;
  title: string;
  object: FreehandObject;
  composition: VideoEditorComposition;
  layerOrder?: number;
};

export const DEFAULT_COMPOSITION_TRANSFORM: CompositionTransform = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  opacity: 1,
  rotation: 0,
  anchorX: 0.5,
  anchorY: 0.5,
  flipX: false,
  flipY: false,
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
    base: cloneCompositionTransform(DEFAULT_COMPOSITION_TRANSFORM),
    tracks: [],
  };
}

export const COMPOSITION_EASING_OPTIONS: { id: CompositionEasing; label: string }[] = [
  { id: "linear", label: "Lineal" },
  { id: "easeIn", label: "Entrada" },
  { id: "easeOut", label: "Salida" },
  { id: "easeInOut", label: "Suave" },
];

/** Rellena campos nuevos en transforms guardados antes de rotación/ancla. */
export function ensureCompositionTransformFields(t: Partial<CompositionTransform> | undefined): CompositionTransform {
  const base = cloneCompositionTransform(DEFAULT_COMPOSITION_TRANSFORM);
  if (!t) return base;
  return cloneCompositionTransform({
    ...base,
    ...t,
    crop: { ...base.crop, ...(t.crop ?? {}) },
    rotation: t.rotation ?? base.rotation,
    anchorX: t.anchorX ?? base.anchorX,
    anchorY: t.anchorY ?? base.anchorY,
    flipX: t.flipX ?? base.flipX,
    flipY: t.flipY ?? base.flipY,
  });
}
