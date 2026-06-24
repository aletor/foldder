/**
 * Layerizer → Designer: convierte LayerizerOutput en capas Freehand apiladas.
 *
 * Orden de apilamiento (abajo → arriba):
 * 1. Original (master)
 * 2. Fondo limpio generativo
 * 3+. Objetos extraídos por zHint
 */

import { solidFill } from "../freehand/fill";
import { DEFAULT_DESIGNER_PAGE_FORMAT } from "../indesign/page-formats";
import type { FreehandObject } from "../FreehandStudio";
import type { DesignerPageState } from "../designer/DesignerNode";
import type { LayerizerOutput } from "./layerizer-types";

function imageObject(args: {
  id: string;
  name: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  intrinsicRatio: number;
}): FreehandObject {
  return {
    id: args.id,
    type: "image",
    x: args.x,
    y: args.y,
    width: args.width,
    height: args.height,
    fill: solidFill("none"),
    stroke: "none",
    strokeWidth: 0,
    opacity: 1,
    blendMode: "normal",
    rotation: 0,
    visible: true,
    locked: false,
    name: args.name,
    src: args.src,
    intrinsicRatio: args.intrinsicRatio,
  } as unknown as FreehandObject;
}

function resolveOriginal(output: LayerizerOutput): { url: string; w: number; h: number } {
  if (output.original?.url) {
    return { url: output.original.url, w: output.original.w, h: output.original.h };
  }
  return {
    url: output.masterUrl,
    w: output.background.w,
    h: output.background.h,
  };
}

/** Capas apiladas (tamaño lienzo = fondo limpio). */
export function buildLayerizerStackObjects(output: LayerizerOutput, idPrefix: string): FreehandObject[] {
  const W = Math.max(1, Math.round(output.background.w));
  const H = Math.max(1, Math.round(output.background.h));
  const original = resolveOriginal(output);

  const objects: FreehandObject[] = [];

  objects.push(
    imageObject({
      id: `${idPrefix}__original`,
      name: "Capa 1 — Original",
      src: original.url,
      x: 0,
      y: 0,
      width: W,
      height: H,
      intrinsicRatio: W / H,
    }),
  );

  objects.push(
    imageObject({
      id: `${idPrefix}__bg`,
      name: "Capa 2 — Fondo limpio",
      src: output.background.url,
      x: 0,
      y: 0,
      width: W,
      height: H,
      intrinsicRatio: W / H,
    }),
  );

  const layers = [...output.layers].sort((a, b) => a.zHint - b.zHint);
  for (const layer of layers) {
    const w = Math.max(1, Math.round(layer.w));
    const h = Math.max(1, Math.round(layer.h));
    objects.push(
      imageObject({
        id: `${idPrefix}__layer_${layer.id}`,
        name: layer.label || "Capa",
        src: layer.url,
        x: Math.round(layer.x),
        y: Math.round(layer.y),
        width: w,
        height: h,
        intrinsicRatio: w / h,
      }),
    );
  }

  return objects;
}

/** Construye la página Designer (tamaño = fondo; original + fondo + capas por zHint). */
export function buildDesignerPageFromLayerizerOutput(
  output: LayerizerOutput,
  pageId: string,
): DesignerPageState {
  const W = Math.max(1, Math.round(output.background.w));
  const H = Math.max(1, Math.round(output.background.h));

  return {
    id: pageId,
    format: DEFAULT_DESIGNER_PAGE_FORMAT,
    customWidth: W,
    customHeight: H,
    objects: buildLayerizerStackObjects(output, pageId),
    layoutGuides: [],
    stories: [],
    textFrames: [],
    imageFrames: [],
  };
}
