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

/** Tipo que ve el modal de fx: el campo de imagen no es un rectángulo vacío. */
export function effectLayerModalTargetType(node: {
  type: string;
  isImageFrame?: boolean;
} | null | undefined): string | undefined {
  if (!node) return undefined;
  if (node.type === "rect" && node.isImageFrame) return "imageFrame";
  return node.type;
}

export function isEffectLayerScopedTarget(args: {
  targetType?: string;
  targetInsideFolder?: boolean;
}): boolean {
  return (
    !!args.targetInsideFolder ||
    args.targetType === "clippingContainer" ||
    args.targetType === "imageFrame"
  );
}

/** Qué opciones de «Aplicar» tiene sentido mostrar para el objetivo actual. */
export function effectLayerApplyModeVisible(
  mode: "embedded" | "wholeStack" | "belowSelection" | "selectedFolder" | "selectedLayer",
  args: { targetType?: string; targetInsideFolder?: boolean },
): boolean {
  if (mode === "selectedFolder") return args.targetType === "groupContainer";
  const scoped = isEffectLayerScopedTarget(args);
  if (mode === "selectedLayer") return scoped;
  if (scoped && (mode === "wholeStack" || mode === "belowSelection")) return false;
  return true;
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
