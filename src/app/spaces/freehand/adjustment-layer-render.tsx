import React from "react";
import type { FreehandObject } from "../FreehandStudio";
import {
  buildSaturationColorMatrixValues,
  buildToneLutTableValues,
} from "./photo-image-adjustments";
import {
  adjustmentLayerFilterId,
  isAdjustmentLayerSettingsNeutral,
  isAdjustmentLayerStylesNeutral,
  isAdjustmentLayerObject,
  isEffectLayerActive,
  type AdjustmentLayerLike,
} from "./adjustment-layer-types";

export type LayerStackSegment =
  | { kind: "plain"; children: FreehandObject[] }
  | {
      kind: "filtered";
      layer: AdjustmentLayerLike;
      children: FreehandObject[];
      toneActive: boolean;
      effectsActive: boolean;
    };

/** Capas del stack principal: excluye solo máscaras clip (no los miembros recortados). */
export function filterRootStackObjects(objects: FreehandObject[]): FreehandObject[] {
  return objects.filter((o) => !o.isClipMask);
}

/**
 * Segmenta el stack inferior→superior: cada capa de efecto envuelve el contenido acumulado
 * debajo (incluye miembros con clipMaskId). Estilo Photoshop: no afecta capas superiores.
 */
export function buildLayerStackRenderSegments(objects: FreehandObject[]): LayerStackSegment[] {
  const stack = filterRootStackObjects(objects);
  const segments: LayerStackSegment[] = [];
  let buffer: FreehandObject[] = [];

  for (const obj of stack) {
    if (isAdjustmentLayerObject(obj)) {
      const layer = obj as AdjustmentLayerLike;
      const toneActive = !isAdjustmentLayerSettingsNeutral(layer.adjustment);
      const effectsActive = !isAdjustmentLayerStylesNeutral(layer.layerEffects);
      if (layer.visible && isEffectLayerActive(layer)) {
        if (buffer.length > 0) {
          segments.push({
            kind: "filtered",
            layer,
            children: [...buffer],
            toneActive,
            effectsActive,
          });
        }
      } else if (buffer.length > 0) {
        segments.push({ kind: "plain", children: [...buffer] });
      }
      buffer = [];
      continue;
    }
    buffer.push(obj);
  }

  if (buffer.length > 0) {
    segments.push({ kind: "plain", children: buffer });
  }

  return segments;
}

/** Renderiza hijos de un segmento respetando orden z e incluyendo grupos clip dentro del filtro. */
export function renderSegmentStackChildren(
  children: FreehandObject[],
  renderPlain: (obj: FreehandObject) => React.ReactNode,
  clipRendered: Set<string>,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  for (const obj of children) {
    const clipId = obj.clipMaskId;
    if (clipId) {
      if (clipRendered.has(clipId)) continue;
      clipRendered.add(clipId);
      const members = children.filter((c) => c.clipMaskId === clipId);
      nodes.push(
        <g key={`clip-${clipId}`} data-fh-clip-root={clipId} clipPath={`url(#clip-${clipId})`}>
          {members.map((m) => renderPlain(m))}
        </g>,
      );
      continue;
    }
    const node = renderPlain(obj);
    if (node) nodes.push(node);
  }
  return nodes;
}

export function AdjustmentLayerFilterDef({ layer }: { layer: AdjustmentLayerLike }) {
  if (!layer.visible || isAdjustmentLayerSettingsNeutral(layer.adjustment)) return null;
  const table = buildToneLutTableValues(layer.adjustment);
  const fid = adjustmentLayerFilterId(layer.id);
  const sat = layer.adjustment.saturation;
  return (
    <filter
      id={fid}
      colorInterpolationFilters="sRGB"
      x="-20%"
      y="-20%"
      width="140%"
      height="140%"
    >
      <feComponentTransfer>
        <feFuncR type="table" tableValues={table} />
        <feFuncG type="table" tableValues={table} />
        <feFuncB type="table" tableValues={table} />
      </feComponentTransfer>
      {sat !== 0 ? (
        <feColorMatrix type="matrix" values={buildSaturationColorMatrixValues(sat)} />
      ) : null}
    </filter>
  );
}

export function collectAdjustmentLayers(objects: FreehandObject[]): AdjustmentLayerLike[] {
  return objects.filter((o): o is FreehandObject & AdjustmentLayerLike => isAdjustmentLayerObject(o));
}
