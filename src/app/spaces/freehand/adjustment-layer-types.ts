/**
 * Capas de ajuste no destructivas (estilo Photoshop): afectan el composite de las capas inferiores.
 */

import {
  NEUTRAL_LEVELS,
  isPhotoImageAdjustmentsNeutral,
  type PhotoLevels,
} from "./photo-image-adjustments";

export type AdjustmentLayerKind = "levels";

/** Parámetros re-editables (sin instantánea base; no destructivo). */
export type AdjustmentLayerSettings = {
  brightness: number;
  contrast: number;
  saturation: number;
  levels: PhotoLevels;
};

export type AdjustmentLayerFields = {
  type: "adjustmentLayer";
  adjustmentKind: AdjustmentLayerKind;
  adjustment: AdjustmentLayerSettings;
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

export function adjustmentLayerDisplayName(kind: AdjustmentLayerKind): string {
  switch (kind) {
    case "levels":
      return "Brillo/Contraste";
    default:
      return "Ajuste";
  }
}

export function adjustmentLayerFilterId(objectId: string): string {
  return `fh-adj-${objectId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

export function isAdjustmentLayerObject(o: { type: string }): o is AdjustmentLayerFields {
  return o.type === "adjustmentLayer";
}
