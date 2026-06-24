import React from "react";
import type { FreehandObject } from "../FreehandStudio";
import {
  adjustmentLayerFilterId,
  isAdjustmentLayerSettingsNeutral,
  isAdjustmentLayerObject,
  type AdjustmentLayerLike,
} from "./adjustment-layer-types";
import {
  buildSaturationColorMatrixValues,
  buildToneLutTableValues,
} from "./photo-image-adjustments";

export type LayerStackSegment =
  | { kind: "plain"; children: FreehandObject[] }
  | { kind: "filtered"; layer: AdjustmentLayerLike; children: FreehandObject[] };

/** Capas del stack principal (excluye miembros de clip en el listado raíz). */
export function filterRootStackObjects(objects: FreehandObject[]): FreehandObject[] {
  return objects.filter((o) => !o.isClipMask && !o.clipMaskId);
}

/**
 * Segmenta el stack inferior→superior: cada capa de ajuste envuelve el contenido acumulado
 * debajo con un filtro SVG (como Photoshop: no afecta capas superiores).
 */
export function buildLayerStackRenderSegments(objects: FreehandObject[]): LayerStackSegment[] {
  const stack = filterRootStackObjects(objects);
  const segments: LayerStackSegment[] = [];
  let buffer: FreehandObject[] = [];

  for (const obj of stack) {
    if (isAdjustmentLayerObject(obj)) {
      if (obj.visible && !isAdjustmentLayerSettingsNeutral(obj.adjustment)) {
        if (buffer.length > 0) {
          segments.push({ kind: "filtered", layer: obj, children: [...buffer] });
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
