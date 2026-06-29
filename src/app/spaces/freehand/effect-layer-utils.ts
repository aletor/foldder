/**
 * Utilidades compartidas para capas de efecto (tono + look + overlays).
 */

import type { Rect } from "./freehand-export";
import { artboardToRect, pickPrimaryArtboard, type Artboard } from "./artboard";
import {
  type AdjustmentLayerLike,
  type EffectLayerScope,
} from "./adjustment-layer-types";

export type { EffectLayerScope };

export function insertIndexForEffectLayer(
  objectCount: number,
  scope: EffectLayerScope,
  selectedIndex: number,
): number {
  if (scope === "wholeStack") return objectCount;
  if (selectedIndex < 0) return objectCount;
  return selectedIndex + 1;
}

export function isFolderScopedEffectLayer(layer: {
  effectScope?: EffectLayerScope;
  effectTargetFolderId?: string;
}): boolean {
  return layer.effectScope === "selectedFolder" && !!layer.effectTargetFolderId;
}

export function isLayerScopedEffectLayer(layer: {
  effectScope?: EffectLayerScope;
  effectTargetLayerId?: string;
}): boolean {
  return layer.effectScope === "selectedLayer" && !!layer.effectTargetLayerId;
}

export function selectedIndexInRootStack(
  objects: { id: string }[],
  selectedId: string | null,
): number {
  if (!selectedId) return -1;
  return objects.findIndex((o) => o.id === selectedId);
}

/**
 * Bounds de render para fx en capa de efecto global.
 * wholeStack: siempre el artboard actual (aunque la capa guarde tamaño antiguo tras redimensionar el lienzo).
 * belowSelection / selectedFolder / selectedLayer: bounds del contenido afectado.
 */
export function resolveEffectLayerFxBounds(
  layer: AdjustmentLayerLike & { x: number; y: number; width: number; height: number },
  contentBounds: Rect,
  artboards: Artboard[] | null | undefined,
): Rect {
  const useArtboard =
    layer.effectScope === "wholeStack" || layer.effectScope === undefined;
  if (useArtboard) {
    const ab = pickPrimaryArtboard(artboards ?? [], null);
    if (ab) return artboardToRect(ab);
  }
  return contentBounds;
}
