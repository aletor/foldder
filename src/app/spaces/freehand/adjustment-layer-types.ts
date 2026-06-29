/**
 * Capas de efecto no destructivas (tono + look): afectan el composite de las capas inferiores.
 */

import {
  NEUTRAL_LEVELS,
  isPhotoImageAdjustmentsNeutral,
  type PhotoLevels,
} from "./photo-image-adjustments";
import { hasActiveLayerEffects, type LayerEffects } from "./layer-effects-types";

/** @deprecated Preferir effectScope; se mantiene para documentos guardados. */
export type AdjustmentLayerKind = "levels" | "layerStyles";

/** Dónde se inserta / qué afecta la capa de efecto. */
export type EffectLayerScope = "wholeStack" | "belowSelection";

/** Parámetros de tono (brillo/contraste/niveles). */
export type AdjustmentLayerSettings = {
  brightness: number;
  contrast: number;
  saturation: number;
  levels: PhotoLevels;
};

export type AdjustmentLayerFields = {
  type: "adjustmentLayer";
  /** @deprecated Migrado a tone+effects unificados; inferido al cargar si falta. */
  adjustmentKind?: AdjustmentLayerKind;
  /** Tono (ex adjustment). */
  adjustment: AdjustmentLayerSettings;
  /** Look + overlays (color, degradado, glow, filtro de foto). */
  layerEffects?: LayerEffects;
  /** wholeStack = tope del stack + bounds artboard; belowSelection = encima de la selección. */
  effectScope?: EffectLayerScope;
};

/** Referencia mínima para filtros SVG (sin importar FreehandStudio). */
export type AdjustmentLayerLike = AdjustmentLayerFields & {
  id: string;
  visible: boolean;
};

export function defaultAdjustmentLayerSettings(): AdjustmentLayerSettings {
  return {
    brightness: 0,
    contrast: 0,
    saturation: 0,
    levels: { ...NEUTRAL_LEVELS },
  };
}

export function isAdjustmentLayerSettingsNeutral(s: AdjustmentLayerSettings): boolean {
  return isPhotoImageAdjustmentsNeutral(s);
}

export function isAdjustmentLayerStylesNeutral(layerEffects: LayerEffects | undefined | null): boolean {
  return !hasActiveLayerEffects(layerEffects ?? undefined);
}

export function adjustmentLayerDisplayName(layer: {
  adjustmentKind?: AdjustmentLayerKind;
  adjustment?: AdjustmentLayerSettings;
  layerEffects?: LayerEffects;
}): string {
  const toneOn = layer.adjustment && !isAdjustmentLayerSettingsNeutral(layer.adjustment);
  const fxOn = !isAdjustmentLayerStylesNeutral(layer.layerEffects);
  if (toneOn && fxOn) return "Capa de efecto";
  if (fxOn) return "Look / fx";
  if (toneOn) return "Tono";
  if (layer.adjustmentKind === "layerStyles") return "Look / fx";
  return "Capa de efecto";
}

export function isEffectLayerActive(layer: AdjustmentLayerLike): boolean {
  return (
    !isAdjustmentLayerSettingsNeutral(layer.adjustment) ||
    !isAdjustmentLayerStylesNeutral(layer.layerEffects)
  );
}

export function adjustmentLayerFilterId(objectId: string): string {
  return `fh-adj-${objectId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

export function isAdjustmentLayerObject(o: { type: string }): o is AdjustmentLayerFields {
  return o.type === "adjustmentLayer";
}

/** Inferir kind legacy para documentos guardados antes de la unificación. */
export function legacyAdjustmentLayerKind(layer: AdjustmentLayerFields): AdjustmentLayerKind {
  if (layer.adjustmentKind) return layer.adjustmentKind;
  const toneOn = !isAdjustmentLayerSettingsNeutral(layer.adjustment);
  const fxOn = !isAdjustmentLayerStylesNeutral(layer.layerEffects);
  if (fxOn && !toneOn) return "layerStyles";
  return "levels";
}

/** Normaliza capas de efecto al cargar (scope, tono/fx unificados). */
export function normalizeEffectLayerObject(
  layer: AdjustmentLayerFields & Record<string, unknown>,
): AdjustmentLayerFields {
  const { adjustmentKind: _drop, ...rest } = layer;
  return {
    ...rest,
    type: "adjustmentLayer",
    adjustment: layer.adjustment ?? defaultAdjustmentLayerSettings(),
    ...(layer.layerEffects ? { layerEffects: layer.layerEffects } : {}),
    effectScope: layer.effectScope ?? "wholeStack",
  };
}
