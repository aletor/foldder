/**
 * Aplica widthMode de layoutGroup sobre una página clonada (preview canvas).
 * `full` estira el fondo al ancho del contenedor y conserva el padding interno.
 * Varios grupos a sangre de la misma fila se apilan en el orden del diseño
 * original (izquierda → arriba).
 */
import type { FreehandObject, PathObject } from "../FreehandStudio";
import type { DesignerPageState } from "../designer/DesignerNode";
import { deepCloneDesignerPageState } from "./designer-source-snapshot";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { collectSemanticCoverageLayerIds, findLayerSemanticOwner } from "./site-blueprint-ownership";
import {
  designerGroupMirrorNodeId,
  isDesignerGroupMirrorNode,
  mirrorContainerLayerIdFromNode,
} from "./site-creator-designer-group-bootstrap";
import { unionPageRects, type PageRect } from "./site-creator-coordinate-space";
import {
  isWorldSpaceLayerId,
  worldSpaceAncestorId,
} from "./site-creator-layer-world-bounds";
import { transformPathObjectRelative } from "./site-creator-responsive-matrix";
import type { ResponsiveBandLike } from "./site-creator-responsive-overrides";
import { resolveContainerTune } from "./site-creator-responsive-tunes";
import { getObjectFontSize } from "./site-creator-responsive-visual";
import type { SiteCreatorSelectionIndex } from "./site-creator-selection-types";
import { isResponsiveEditableBand } from "./site-creator-types";
import type { SiteBlueprintLayoutGroupNode, SiteBlueprintV1 } from "./site-creator-types";

const ROW_GAP = 16;
const ROW_GAP_TOLERANCE = 16;
const THIN_RULE_MAX_H = 12;

export type GroupWidthLayoutResult = {
  page: DesignerPageState;
  layoutHeight: number;
};

export type VisualRowMate = {
  ids: string[];
  bounds: PageRect;
};

function walkObjects(objs: FreehandObject[] | undefined, byId: Map<string, FreehandObject>): void {
  for (const obj of objs ?? []) {
    byId.set(obj.id, obj);
    if (obj.type === "groupContainer" || obj.type === "booleanGroup") {
      walkObjects((obj as { children?: FreehandObject[] }).children, byId);
    } else if (obj.type === "clippingContainer") {
      const clip = obj as { mask?: FreehandObject; content?: FreehandObject[] };
      if (clip.mask) walkObjects([clip.mask], byId);
      walkObjects(clip.content, byId);
    }
  }
}

export function coverageLayerIds(
  blueprint: SiteBlueprintV1,
  nodeId: string,
  index: SiteCreatorSelectionIndex,
): string[] {
  const ids = new Set(collectSemanticCoverageLayerIds(blueprint, nodeId));
  const node = blueprint.nodes[nodeId];
  if (node?.kind === "layoutGroup") {
    const containerId = isDesignerGroupMirrorNode(node, index)
      ? mirrorContainerLayerIdFromNode(node as SiteBlueprintLayoutGroupNode)
      : null;
    const roots = containerId ? [containerId, ...ids] : [...ids];
    for (const root of roots) {
      ids.add(root);
      for (const entry of index.entries) {
        if (entry.ancestorIds.includes(root)) ids.add(entry.layerId);
      }
    }
  }
  addClipBooleanAncestors(ids, index);
  return [...ids];
}

function addClipBooleanAncestors(ids: Set<string>, index: SiteCreatorSelectionIndex): void {
  for (const id of [...ids]) {
    let walk = index.byId[id]?.parentLayerId ?? null;
    while (walk) {
      const parent = index.byId[walk];
      if (!parent) break;
      if (parent.type === "clippingContainer" || parent.type === "booleanGroup") {
        ids.add(walk);
        walk = parent.parentLayerId;
        continue;
      }
      break;
    }
  }
}

function expandDescendants(layerIds: string[], index: SiteCreatorSelectionIndex): string[] {
  const set = new Set(layerIds);
  for (const entry of index.entries) {
    if (entry.ancestorIds.some((id) => set.has(id))) set.add(entry.layerId);
  }
  return [...set];
}

function displayRoots(layerIds: string[], index: SiteCreatorSelectionIndex): string[] {
  const set = new Set(layerIds);
  const seen = new Set<string>();
  const lifted: string[] = [];
  for (const id of layerIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const parent = index.byId[id]?.parentLayerId;
    if (parent && set.has(parent)) continue;
    const worldId = worldSpaceAncestorId(id, index);
    if (seen.has(`world:${worldId}`)) continue;
    seen.add(`world:${worldId}`);
    lifted.push(worldId);
  }
  return lifted;
}

/** Caja pintada en página. Un clip a tamaño de lienzo usa la máscara, no 1920×1080. */
function paintedBox(obj: FreehandObject, index: SiteCreatorSelectionIndex): PageRect {
  if (obj.type === "clippingContainer") {
    const mask = (obj as { mask?: FreehandObject }).mask;
    if (mask && mask.width > 1 && mask.height > 1) {
      return {
        x: obj.x + mask.x,
        y: obj.y + mask.y,
        width: Math.max(0, mask.width),
        height: Math.max(0, mask.height),
      };
    }
  }
  if (obj.type === "clippingContainer" || obj.type === "booleanGroup") {
    const vis = index.byId[obj.id]?.visualBounds;
    if (vis && vis.width > 1 && vis.height > 1) {
      return { x: vis.x, y: vis.y, width: vis.width, height: vis.height };
    }
  }
  return {
    x: obj.x,
    y: obj.y,
    width: Math.max(0, obj.width),
    height: Math.max(0, obj.height),
  };
}

function currentUnion(
  byId: Map<string, FreehandObject>,
  layerIds: string[],
  index: SiteCreatorSelectionIndex,
): PageRect | null {
  const rects: PageRect[] = [];
  for (const id of displayRoots(layerIds, index)) {
    const obj = byId.get(id);
    if (!obj) continue;
    rects.push(paintedBox(obj, index));
  }
  return unionPageRects(rects);
}

function sourceUnion(index: SiteCreatorSelectionIndex, layerIds: string[]): PageRect | null {
  const rects: PageRect[] = [];
  for (const id of displayRoots(layerIds, index)) {
    const b = index.byId[id]?.visualBounds;
    if (!b) continue;
    rects.push({ x: b.x, y: b.y, width: Math.max(0, b.width), height: Math.max(0, b.height) });
  }
  return unionPageRects(rects);
}

function isSourceFrameLayer(src: PageRect, source: PageRect): boolean {
  if (!(source.width > 0 && source.height > 0)) return false;
  const nearLeft = src.x <= source.x + source.width * 0.08;
  const nearTop = src.y <= source.y + source.height * 0.08;
  return nearLeft && nearTop && src.width >= source.width * 0.7 && src.height >= source.height * 0.7;
}

function isVisualFrameLayer(
  obj: FreehandObject,
  src: PageRect,
  source: PageRect,
): boolean {
  if (obj.type === "booleanGroup" || obj.type === "clippingContainer") return false;
  return isSourceFrameLayer(src, source);
}

function scaleSubtreeLocal(obj: FreehandObject, scaleX: number, scaleY: number): void {
  const apply = (ch: FreehandObject) => {
    ch.x *= scaleX;
    ch.y *= scaleY;
    ch.width = Math.max(1, ch.width * scaleX);
    ch.height = Math.max(1, ch.height * scaleY);
    const font = getObjectFontSize(ch);
    if (font > 0 && (ch.type === "text" || ch.type === "textOnPath")) {
      (ch as { fontSize?: number }).fontSize = Math.max(8, font * Math.min(scaleX, scaleY));
    }
    scaleSubtreeLocal(ch, scaleX, scaleY);
  };
  if (obj.type === "groupContainer" || obj.type === "booleanGroup") {
    for (const ch of (obj as { children?: FreehandObject[] }).children ?? []) apply(ch);
    return;
  }
  if (obj.type === "clippingContainer") {
    const c = obj as { mask?: FreehandObject; content?: FreehandObject[] };
    for (const ch of [c.mask, ...(c.content ?? [])].filter(Boolean) as FreehandObject[]) apply(ch);
  }
}

function writeWorldRect(
  byId: Map<string, FreehandObject>,
  index: SiteCreatorSelectionIndex,
  id: string,
  world: PageRect,
  transformSet: Set<string>,
): void {
  const obj = byId.get(id);
  const entry = index.byId[id];
  if (!obj) return;
  const parentId = entry?.parentLayerId;
  if (parentId && !transformSet.has(parentId) && !isWorldSpaceLayerId(id, index)) {
    const parent = byId.get(parentId);
    if (parent) {
      obj.x = world.x - parent.x;
      obj.y = world.y - parent.y;
      obj.width = Math.max(1, world.width);
      obj.height = Math.max(1, world.height);
      return;
    }
  }
  obj.x = world.x;
  obj.y = world.y;
  obj.width = Math.max(1, world.width);
  obj.height = Math.max(1, world.height);
}

type PlaceTreeTarget = {
  origin: PageRect;
  parentX: number;
  parentWidth: number;
  cursor: number;
  scaleX: number;
  scaleY: number;
  stretchFrame: boolean;
  fitFromEnd: boolean;
  scaleFonts: boolean;
};

function mapSourceToWorld(src: PageRect, t: PlaceTreeTarget, frame: boolean): PageRect {
  const nextH = Math.max(1, src.height * t.scaleY);
  if (t.fitFromEnd) {
    const originRight = t.origin.x + t.origin.width;
    const parentRight = t.parentX + t.parentWidth;
    return {
      x: parentRight - (originRight - src.x) * t.scaleX,
      y: t.cursor + (src.y - t.origin.y) * t.scaleY,
      width: Math.max(1, src.width * t.scaleX),
      height: nextH,
    };
  }
  const localX = (src.x - t.origin.x) * t.scaleX;
  const localY = (src.y - t.origin.y) * t.scaleY;
  return {
    x: frame && t.stretchFrame ? t.parentX : t.parentX + localX,
    y: t.cursor + localY,
    width: frame && t.stretchFrame ? t.parentWidth : Math.max(1, src.width * t.scaleX),
    height: nextH,
  };
}

function placeWorldObject(
  obj: FreehandObject,
  src: PageRect,
  t: PlaceTreeTarget,
  byId: Map<string, FreehandObject>,
  index: SiteCreatorSelectionIndex,
  transformSet: Set<string>,
): void {
  if (obj.type === "booleanGroup" || obj.type === "clippingContainer") {
    const painted = paintedBox(obj, index);
    const next = mapSourceToWorld(painted, t, false);
    obj.x += next.x - painted.x;
    obj.y += next.y - painted.y;
    const sx = next.width / Math.max(1, painted.width);
    const sy = next.height / Math.max(1, painted.height);
    if (Math.abs(sx - 1) > 0.001 || Math.abs(sy - 1) > 0.001) {
      obj.width = Math.max(1, obj.width * sx);
      obj.height = Math.max(1, obj.height * sy);
      scaleSubtreeLocal(obj, sx, sy);
    }
    return;
  }
  const frame = t.stretchFrame && isVisualFrameLayer(obj, src, t.origin);
  const world = mapSourceToWorld(src, t, frame);
  if (obj.type === "path") {
    const mappedOriginX = t.fitFromEnd
      ? t.parentX + t.parentWidth - t.origin.width * t.scaleX
      : t.parentX;
    transformPathObjectRelative(obj as PathObject, t.origin, {
      x: mappedOriginX,
      y: t.cursor,
      scaleX: t.scaleX,
      scaleY: t.scaleY,
    });
  }
  writeWorldRect(byId, index, obj.id, world, transformSet);
  if (obj.type === "groupContainer") {
    for (const ch of (obj as { children?: FreehandObject[] }).children ?? []) {
      const cb = index.byId[ch.id]?.visualBounds;
      if (cb) placeWorldObject(ch, cb, t, byId, index, transformSet);
    }
    return;
  }
  if (!t.scaleFonts) return;
  const font = getObjectFontSize(obj);
  if (font > 0 && (obj.type === "text" || obj.type === "textOnPath")) {
    (obj as { fontSize?: number }).fontSize = Math.max(8, font * Math.min(t.scaleX, t.scaleY));
  }
}

function placeLayerTree(args: {
  byId: Map<string, FreehandObject>;
  index: SiteCreatorSelectionIndex;
  layerIds: string[];
  target: PlaceTreeTarget;
}): void {
  const roots = displayRoots(args.layerIds, args.index);
  const transformSet = new Set(args.layerIds);
  for (const id of roots) transformSet.add(id);
  for (const id of roots) {
    const obj = args.byId.get(id);
    if (!obj) continue;
    const src = args.index.byId[id]?.visualBounds ?? {
      x: obj.x,
      y: obj.y,
      width: obj.width,
      height: obj.height,
    };
    placeWorldObject(obj, src, args.target, args.byId, args.index, transformSet);
  }
}

/**
 * Estira solo el fondo/contenedor al ancho del padre. El contenido conserva
 * el padding y el tamaño del diseño original (a la escala actual).
 */
function placeFullWidthGroup(args: {
  byId: Map<string, FreehandObject>;
  index: SiteCreatorSelectionIndex;
  layerIds: string[];
  origin: PageRect;
  parent: PageRect;
  cursor: number;
}): void {
  const source = sourceUnion(args.index, args.layerIds) ?? args.origin;
  const hasVisualFrame = args.layerIds.some((id) => {
    if (!isWorldSpaceLayerId(id, args.index)) return false;
    const obj = args.byId.get(id);
    const src = args.index.byId[id]?.visualBounds;
    return Boolean(obj && src && isVisualFrameLayer(obj, src, source));
  });
  const uniform = args.origin.height / Math.max(1, source.height);
  placeLayerTree({
    byId: args.byId,
    index: args.index,
    layerIds: args.layerIds,
    target: {
      origin: source,
      parentX: args.parent.x,
      parentWidth: args.parent.width,
      cursor: args.cursor,
      scaleX: hasVisualFrame ? uniform : args.parent.width / Math.max(1, args.origin.width),
      scaleY: hasVisualFrame ? uniform : 1,
      stretchFrame: hasVisualFrame,
      fitFromEnd: false,
      scaleFonts: false,
    },
  });
}

function placeScaleGroup(args: {
  byId: Map<string, FreehandObject>;
  index: SiteCreatorSelectionIndex;
  layerIds: string[];
  origin: PageRect;
  parent: PageRect;
  cursor: number;
  fitOrigin: "start" | "end";
}): void {
  const scale = args.parent.width / Math.max(1, args.origin.width);
  placeLayerTree({
    byId: args.byId,
    index: args.index,
    layerIds: args.layerIds,
    target: {
      origin: args.origin,
      parentX: args.parent.x,
      parentWidth: args.parent.width,
      cursor: args.cursor,
      scaleX: scale,
      scaleY: scale,
      stretchFrame: false,
      fitFromEnd: args.fitOrigin === "end",
      scaleFonts: true,
    },
  });
}

function snapContainersToDescendants(
  byId: Map<string, FreehandObject>,
  layerIds: string[],
  index: SiteCreatorSelectionIndex,
): void {
  const set = new Set(layerIds);
  for (const id of layerIds) {
    const obj = byId.get(id);
    if (!obj || obj.type !== "groupContainer") continue;
    const descendants = index.entries
      .filter((entry) => entry.ancestorIds.includes(id) && set.has(entry.layerId))
      .map((entry) => entry.layerId);
    if (descendants.length === 0) continue;
    const union = currentUnion(byId, descendants, index);
    if (!union) continue;
    const left = Math.min(obj.x, union.x);
    const top = Math.min(obj.y, union.y);
    const right = Math.max(obj.x + obj.width, union.x + union.width);
    const bottom = Math.max(obj.y + obj.height, union.y + union.height);
    obj.x = left;
    obj.y = top;
    obj.width = Math.max(1, right - left);
    obj.height = Math.max(1, bottom - top);
  }
}

function layoutGroupDepth(blueprint: SiteBlueprintV1, nodeId: string): number {
  let depth = 0;
  let walk: string | null = blueprint.nodes[nodeId]?.parentId ?? null;
  while (walk) {
    depth += 1;
    walk = blueprint.nodes[walk]?.parentId ?? null;
  }
  return depth;
}

function parentContentRect(args: {
  blueprint: SiteBlueprintV1;
  nodeId: string;
  byId: Map<string, FreehandObject>;
  index: SiteCreatorSelectionIndex;
  viewportWidth: number;
  viewportHeight: number;
}): PageRect {
  const node = args.blueprint.nodes[args.nodeId];
  const parentId = node?.parentId ?? null;
  if (parentId) {
    const parent = args.blueprint.nodes[parentId];
    if (parent?.kind === "layoutGroup") {
      const bounds = currentUnion(
        args.byId,
        coverageLayerIds(args.blueprint, parentId, args.index),
        args.index,
      );
      if (bounds) return bounds;
    }
    if (parent?.kind === "section") {
      return {
        x: 0,
        y: parent.sourceRange.top,
        width: args.viewportWidth,
        height: Math.max(1, parent.sourceRange.bottom - parent.sourceRange.top),
      };
    }
  }
  return { x: 0, y: 0, width: args.viewportWidth, height: args.viewportHeight };
}

function shiftLayers(
  byId: Map<string, FreehandObject>,
  layerIds: Iterable<string>,
  index: SiteCreatorSelectionIndex,
  dy: number,
): void {
  if (Math.abs(dy) < 0.5) return;
  const shifted = new Set<string>();
  for (const id of layerIds) {
    const worldId = worldSpaceAncestorId(id, index);
    if (shifted.has(worldId) || !isWorldSpaceLayerId(worldId, index)) continue;
    const obj = byId.get(worldId);
    if (!obj) continue;
    obj.y += dy;
    shifted.add(worldId);
  }
  for (const id of [...shifted]) {
    const obj = byId.get(id);
    if (obj?.type !== "groupContainer") continue;
    shiftWorldChildren(obj, dy, shifted);
  }
}

function shiftWorldChildren(obj: FreehandObject, dy: number, shifted: Set<string>): void {
  for (const ch of (obj as { children?: FreehandObject[] }).children ?? []) {
    if (shifted.has(ch.id)) continue;
    ch.y += dy;
    shifted.add(ch.id);
    if (ch.type === "groupContainer") shiftWorldChildren(ch, dy, shifted);
  }
}

export function yOverlap(a: PageRect, b: PageRect): boolean {
  return a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Línea / filete horizontal: no es un fondo de fila. */
export function isThinRule(box: PageRect): boolean {
  return box.height > 0 && box.height <= THIN_RULE_MAX_H && box.width >= box.height * 8;
}

function yOverlapAmount(a: PageRect, b: PageRect): number {
  return Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
}

/** Misma línea visual: centros en banda, solape útil o filete que cruza la fila. */
export function sameVisualRow(a: PageRect, b: PageRect): boolean {
  if (a.width < 1 || a.height < 1 || b.width < 1 || b.height < 1) return false;
  const thinA = isThinRule(a);
  const thinB = isThinRule(b);
  if (thinA || thinB) {
    const thin = thinA ? a : b;
    const other = thinA ? b : a;
    const cy = thin.y + thin.height / 2;
    return cy >= other.y - ROW_GAP_TOLERANCE && cy <= other.y + other.height + ROW_GAP_TOLERANCE;
  }
  const overlap = yOverlapAmount(a, b);
  const shorter = Math.min(a.height, b.height);
  if (overlap >= Math.max(1, shorter * 0.2)) return true;
  const cyA = a.y + a.height / 2;
  const cyB = b.y + b.height / 2;
  const band = Math.max(a.height, b.height) * 0.35;
  if (Math.abs(cyA - cyB) <= band) return true;
  const gap = Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height));
  return gap > 0 && gap <= ROW_GAP_TOLERANCE && Math.abs(cyA - cyB) <= Math.max(a.height, b.height) * 0.45;
}

function boxesOverlap(a: PageRect, b: PageRect): boolean {
  return yOverlap(a, b) && a.x < b.x + b.width && b.x < a.x + a.width;
}

function overlapArea(a: PageRect, b: PageRect): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  return Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
}

function isPageBackground(box: PageRect, parent: PageRect): boolean {
  if (!(parent.width > 0 && parent.height > 0)) return false;
  const nearLeft = box.x <= parent.x + parent.width * 0.08;
  const nearTop = box.y <= parent.y + parent.height * 0.08;
  return nearLeft && nearTop && box.width >= parent.width * 0.7 && box.height >= parent.height * 0.7;
}

/** Franja a sangre (fondo de fila/sección). Un filete fino no cuenta. */
function isFullBleedBand(box: PageRect, parent: PageRect): boolean {
  if (!(parent.width > 0)) return false;
  if (isThinRule(box)) return false;
  const nearLeft = box.x <= parent.x + parent.width * 0.08;
  const tallEnough = box.height >= Math.max(64, parent.height * 0.12);
  return nearLeft && box.width >= parent.width * 0.7 && tallEnough;
}

function unitHasFillFrame(
  ids: string[],
  bounds: PageRect,
  byId: Map<string, FreehandObject>,
  index: SiteCreatorSelectionIndex,
): boolean {
  return ids.some((id) => {
    const type = index.byId[id]?.type ?? byId.get(id)?.type;
    if (type === "groupContainer") return true;
    if (type === "text" || type === "textOnPath") return false;
    const obj = byId.get(id);
    const src = index.byId[id]?.visualBounds;
    return Boolean(obj && src && isVisualFrameLayer(obj, src, bounds));
  });
}

function boxMostlyInside(box: PageRect, parent: PageRect): boolean {
  const x0 = Math.max(box.x, parent.x);
  const y0 = Math.max(box.y, parent.y);
  const x1 = Math.min(box.x + box.width, parent.x + parent.width);
  const y1 = Math.min(box.y + box.height, parent.y + parent.height);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const area = Math.max(1, box.width * box.height);
  return inter / area >= 0.5;
}

function overlapIsUseful(box: PageRect, area: number): boolean {
  return area >= 64 || area >= box.width * box.height * 0.12;
}

function centerInside(box: PageRect, origin: PageRect): boolean {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return (
    cx >= origin.x &&
    cx <= origin.x + origin.width &&
    cy >= origin.y &&
    cy <= origin.y + origin.height
  );
}

type LayoutGroupSource = { nodeId: string; source: PageRect };

function layoutGroupSources(
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
  byId: Map<string, FreehandObject>,
): LayoutGroupSource[] {
  const out: LayoutGroupSource[] = [];
  for (const node of Object.values(blueprint.nodes)) {
    if (node.kind !== "layoutGroup" && node.kind !== "component") continue;
    const ids = coverageLayerIds(blueprint, node.id, index);
    const source = sourceUnion(index, ids) ?? currentUnion(byId, ids, index);
    if (source && source.width > 1 && source.height > 1) out.push({ nodeId: node.id, source });
  }
  return out;
}

function bestGroupSource(box: PageRect, groups: LayoutGroupSource[]): LayoutGroupSource | null {
  let best: LayoutGroupSource | null = null;
  let bestArea = 0;
  for (const group of groups) {
    const area = overlapArea(group.source, box);
    if (area > bestArea) {
      bestArea = area;
      best = group;
    }
  }
  return bestArea > 0 ? best : null;
}

/** Fotos/recortes pintados sobre una card, aunque no estén en su carpeta Designer. */
function absorbPaintedOverlaps(args: {
  prepared: Array<{ group: { id: string }; ids: string[]; source: PageRect }>;
  blueprint: SiteBlueprintV1;
  index: SiteCreatorSelectionIndex;
  byId: Map<string, FreehandObject>;
  parentRect: PageRect;
}): void {
  if (args.prepared.length === 0) return;
  const competitors = layoutGroupSources(args.blueprint, args.index, args.byId);
  const claimed = new Set(args.prepared.flatMap((item) => item.ids));
  for (const entry of args.index.entries) {
    if (!entry.visible) continue;
    if (claimed.has(entry.layerId)) continue;
    if (entry.ancestorIds.some((id) => claimed.has(id))) continue;
    const worldId = worldSpaceAncestorId(entry.layerId, args.index);
    if (claimed.has(worldId) || !isWorldSpaceLayerId(worldId, args.index)) continue;
    const obj = args.byId.get(worldId);
    if (!obj) continue;
    const box = paintedBox(obj, args.index);
    if (isPageBackground(box, args.parentRect) || isFullBleedBand(box, args.parentRect)) continue;
    const owner = bestGroupSource(box, competitors);
    if (!owner) continue;
    const area = overlapArea(owner.source, box);
    if (!overlapIsUseful(box, area)) continue;
    // Pintado encima de la card, no un vecino de la misma fila que apenas se toca.
    if (!centerInside(box, owner.source) && area < box.width * box.height * 0.45) continue;
    const target = args.prepared.find((item) => item.group.id === owner.nodeId);
    if (!target) continue;
    const extra = expandDescendants([worldId], args.index);
    extra.forEach((id) => claimed.add(id));
    for (const id of extra) {
      if (!target.ids.includes(id)) target.ids.push(id);
    }
  }
  for (const item of args.prepared) {
    const source = sourceUnion(args.index, item.ids) ?? currentUnion(args.byId, item.ids, args.index);
    if (source) item.source = source;
  }
}

function placeLeftoverMates(args: {
  byId: Map<string, FreehandObject>;
  index: SiteCreatorSelectionIndex;
  mates: Array<{ ids: string[]; origin: PageRect }>;
  parent: PageRect;
  cursor: number;
}): number {
  if (args.mates.length === 0) return args.cursor - ROW_GAP;
  const live = [...args.mates]
    .filter((item) => item.origin.width > 0 && item.origin.height > 0)
    .sort((a, b) => a.origin.x - b.origin.x || a.origin.y - b.origin.y);
  if (live.length === 0) return args.cursor - ROW_GAP;
  const shouldFill = live.some((item) =>
    unitHasFillFrame(item.ids, item.origin, args.byId, args.index),
  );
  if (!shouldFill) {
    for (const item of live) {
      const dy = args.cursor - item.origin.y;
      shiftLayers(args.byId, item.ids, args.index, dy);
    }
    return Math.max(
      ...live.map((item) => {
        const after = currentUnion(args.byId, item.ids, args.index);
        return after ? after.y + after.height : args.cursor + item.origin.height;
      }),
    );
  }
  if (live.length === 1) {
    const only = live[0]!;
    placeFullWidthGroup({
      byId: args.byId,
      index: args.index,
      layerIds: only.ids,
      origin: only.origin,
      parent: args.parent,
      cursor: args.cursor,
    });
    const next = currentUnion(args.byId, only.ids, args.index);
    return next ? next.y + next.height : args.cursor + only.origin.height;
  }
  const union = unionPageRects(live.map((item) => item.origin));
  if (!union) return args.cursor - ROW_GAP;
  const scaleX = args.parent.width / Math.max(1, union.width);
  let bottom = args.cursor;
  for (const item of live) {
    const slot: PageRect = {
      x: args.parent.x + (item.origin.x - union.x) * scaleX,
      y: args.parent.y,
      width: Math.max(1, item.origin.width * scaleX),
      height: args.parent.height,
    };
    placeFullWidthGroup({
      byId: args.byId,
      index: args.index,
      layerIds: item.ids,
      origin: item.origin,
      parent: slot,
      cursor: args.cursor,
    });
    const next = currentUnion(args.byId, item.ids, args.index);
    if (next) bottom = Math.max(bottom, next.y + next.height);
  }
  return bottom;
}

/**
 * Compañeros de la misma fila visual: grupos, botones y capas sueltas
 * que ocupan la misma banda Y dentro del contenedor (no la carpeta Designer).
 * Un bloque no agrupado (fondo + texto + filetes) viaja entero.
 */
export function collectVisualRowMates(args: {
  blueprint: SiteBlueprintV1;
  group: SiteBlueprintLayoutGroupNode;
  byId: Map<string, FreehandObject>;
  index: SiteCreatorSelectionIndex;
  origin: PageRect;
  parentRect: PageRect;
  groupLayerIds: Set<string>;
}): VisualRowMate[] {
  const claimed = new Set(args.groupLayerIds);
  const mates: VisualRowMate[] = [];

  const displayBox = (id: string): PageRect | null => {
    const obj = args.byId.get(id);
    if (!obj) return null;
    return paintedBox(obj, args.index);
  };

  const unionBoxes = (ids: string[]): PageRect | null => {
    const rects: PageRect[] = [];
    for (const id of displayRoots(ids, args.index)) {
      const box = displayBox(id);
      if (box) rects.push(box);
    }
    return unionPageRects(rects);
  };

  const inParent = (box: PageRect): boolean =>
    boxMostlyInside(box, args.parentRect) || centerInside(box, args.parentRect);

  const growVisualUnit = (seedIds: string[]): string[] => {
    const ids = new Set(expandDescendants(seedIds, args.index));
    let grew = true;
    while (grew) {
      grew = false;
      const coreIds = [...ids].filter((id) => {
        const box = displayBox(id);
        return Boolean(box && !isThinRule(box));
      });
      const union = unionBoxes(coreIds.length ? coreIds : [...ids]);
      if (!union) break;
      for (const entry of args.index.entries) {
        if (!entry.visible) continue;
        if (claimed.has(entry.layerId) || ids.has(entry.layerId)) continue;
        if (entry.ancestorIds.some((id) => claimed.has(id) || ids.has(id))) continue;
        const worldId = worldSpaceAncestorId(entry.layerId, args.index);
        if (claimed.has(worldId) || ids.has(worldId)) continue;
        if (!isWorldSpaceLayerId(worldId, args.index)) continue;
        const box = displayBox(worldId);
        if (!box || !inParent(box)) continue;
        if (isPageBackground(box, args.parentRect) || isFullBleedBand(box, args.parentRect)) continue;
        const attach = isThinRule(box) ? sameVisualRow(union, box) : boxesOverlap(union, box);
        if (!attach) continue;
        for (const id of expandDescendants([worldId], args.index)) {
          if (!ids.has(id)) {
            ids.add(id);
            grew = true;
          }
        }
      }
    }
    return [...ids];
  };

  const consider = (ids: string[]) => {
    if (ids.length === 0 || ids.every((id) => claimed.has(id))) return;
    let unitIds = growVisualUnit(ids);
    let bounds = unionBoxes(unitIds);
    if (!bounds) return;
    const paintedOn =
      centerInside(bounds, args.origin) &&
      overlapArea(args.origin, bounds) >= bounds.width * bounds.height * 0.55;
    if (paintedOn) return;
    if (isPageBackground(bounds, args.parentRect) || isFullBleedBand(bounds, args.parentRect)) {
      const seed = ids.filter((id) => {
        if (claimed.has(id)) return false;
        const box = displayBox(id);
        return Boolean(
          box && !isPageBackground(box, args.parentRect) && !isFullBleedBand(box, args.parentRect),
        );
      });
      unitIds = expandDescendants(seed, args.index);
      bounds = unionBoxes(unitIds);
      if (!bounds || isPageBackground(bounds, args.parentRect)) return;
    }
    if (!inParent(bounds)) return;
    if (!sameVisualRow(args.origin, bounds)) return;
    unitIds.forEach((id) => claimed.add(id));
    mates.push({ ids: unitIds, bounds });
  };

  for (const node of Object.values(args.blueprint.nodes)) {
    if (node.id === args.group.id) continue;
    if (node.parentId !== args.group.parentId) continue;
    if (node.kind !== "layoutGroup" && node.kind !== "component") continue;
    consider(coverageLayerIds(args.blueprint, node.id, args.index));
  }

  for (const entry of args.index.entries) {
    if (!entry.visible) continue;
    if (claimed.has(entry.layerId)) continue;
    if (entry.ancestorIds.some((id) => claimed.has(id))) continue;
    const worldId = worldSpaceAncestorId(entry.layerId, args.index);
    if (claimed.has(worldId)) continue;
    const box = displayBox(worldId);
    if (!box || !inParent(box)) continue;
    if (isPageBackground(box, args.parentRect) || isFullBleedBand(box, args.parentRect)) continue;

    const owner = findLayerSemanticOwner(args.blueprint, entry.layerId, args.index);
    if (owner && owner.id === args.group.parentId) {
      consider([worldId]);
      continue;
    }
    if (owner && owner.id !== args.group.id && owner.parentId === args.group.parentId) {
      consider(coverageLayerIds(args.blueprint, owner.id, args.index));
      continue;
    }
    if (entry.type === "groupContainer" || entry.type === "clippingContainer" || entry.type === "booleanGroup") {
      consider([worldId]);
      continue;
    }
    if (entry.containerKind) continue;
    consider([worldId]);
  }

  // Recortes/fotos fuera de la carpeta de la card (página o carpeta a sangre):
  // si no viajan con el cromo, el pantalón se queda en la fila original.
  for (const entry of args.index.entries) {
    if (!entry.visible) continue;
    if (claimed.has(entry.layerId)) continue;
    if (entry.ancestorIds.some((id) => claimed.has(id))) continue;
    const worldId = worldSpaceAncestorId(entry.layerId, args.index);
    if (claimed.has(worldId) || !isWorldSpaceLayerId(worldId, args.index)) continue;
    const box = displayBox(worldId);
    if (!box || isPageBackground(box, args.parentRect) || isFullBleedBand(box, args.parentRect)) {
      continue;
    }
    if (!inParent(box) && !isThinRule(box)) continue;
    let best: VisualRowMate | null = null;
    let bestArea = 0;
    for (const mate of mates) {
      const area =
        isThinRule(box) && sameVisualRow(mate.bounds, box)
          ? mate.bounds.width
          : overlapArea(mate.bounds, box);
      if (area > bestArea) {
        bestArea = area;
        best = mate;
      }
    }
    const originOverlap = overlapArea(args.origin, box);
    if (!best || bestArea < 1) continue;
    if (originOverlap > bestArea && !isThinRule(box)) continue;
    if (!isThinRule(box) && bestArea < box.width * box.height * 0.12 && bestArea < 64) continue;
    const extra = expandDescendants([worldId], args.index);
    extra.forEach((id) => claimed.add(id));
    for (const id of extra) {
      if (!best.ids.includes(id)) best.ids.push(id);
    }
  }

  return mates
    .filter((mate) => boxMostlyInside(mate.bounds, args.parentRect) || isThinRule(mate.bounds))
    .sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);
}

export type ResolvedGroupFit = {
  mode: "full" | "scale";
  origin: "start" | "end";
};

function tuneToFit(
  tune: ReturnType<typeof resolveContainerTune> | null | undefined,
): ResolvedGroupFit | null {
  if (!tune) return null;
  if (tune.contentWidthMode === "scale") {
    return { mode: "scale", origin: tune.fitOrigin === "end" ? "end" : "start" };
  }
  if (tune.contentWidthMode === "full") {
    return { mode: "full", origin: tune.fitOrigin === "end" ? "end" : "start" };
  }
  return null;
}

export function resolveLayoutGroupFitForBand(
  blueprint: SiteBlueprintV1,
  group: SiteBlueprintLayoutGroupNode,
  band: ResponsiveBandLike = "wide",
): ResolvedGroupFit | null {
  if (band === "wide") {
    if (group.widthMode === "full" || group.widthMode === "scale") {
      return { mode: group.widthMode, origin: group.fitOrigin === "end" ? "end" : "start" };
    }
    return null;
  }
  if (!isResponsiveEditableBand(band)) return null;
  const nodeTune = resolveContainerTune(blueprint, { kind: "blueprintNode", nodeId: group.id }, band);
  const fromNode = tuneToFit(nodeTune);
  if (fromNode) return fromNode;
  const containerId = mirrorContainerLayerIdFromNode(group);
  if (containerId) {
    return tuneToFit(resolveContainerTune(blueprint, { kind: "designerGroup", layerId: containerId }, band));
  }
  return null;
}

export function layoutGroupIsFullWidthForBand(
  blueprint: SiteBlueprintV1,
  group: SiteBlueprintLayoutGroupNode,
  band: ResponsiveBandLike = "wide",
): boolean {
  return resolveLayoutGroupFitForBand(blueprint, group, band) != null;
}

export function containerIsFullWidthForBand(
  blueprint: SiteBlueprintV1,
  containerId: string,
  band: ResponsiveBandLike = "wide",
): boolean {
  const direct = blueprint.nodes[containerId];
  if (direct?.kind === "layoutGroup") return layoutGroupIsFullWidthForBand(blueprint, direct, band);
  const stable = blueprint.nodes[designerGroupMirrorNodeId(containerId)];
  if (stable?.kind === "layoutGroup") return layoutGroupIsFullWidthForBand(blueprint, stable, band);
  for (const node of Object.values(blueprint.nodes)) {
    if (node.kind !== "layoutGroup") continue;
    if (mirrorContainerLayerIdFromNode(node) === containerId) {
      return layoutGroupIsFullWidthForBand(blueprint, node, band);
    }
  }
  if (isResponsiveEditableBand(band)) {
    const dgTune = resolveContainerTune(blueprint, { kind: "designerGroup", layerId: containerId }, band);
    if (dgTune?.contentWidthMode === "full" || dgTune?.contentWidthMode === "scale") return true;
  }
  return false;
}

export function hasFullWidthLayoutGroup(
  blueprint: SiteBlueprintV1,
  band: ResponsiveBandLike = "wide",
): boolean {
  return Object.values(blueprint.nodes).some(
    (node) => node.kind === "layoutGroup" && layoutGroupIsFullWidthForBand(blueprint, node, band),
  );
}

/**
 * Clona la página y aplica grupos a sangre. Si no hay ninguno, devuelve la misma referencia.
 */
export function applyLayoutGroupWidthModes(args: {
  page: DesignerPageState;
  blueprint: SiteBlueprintV1;
  index: SiteCreatorSelectionIndex;
  viewportWidth: number;
  viewportHeight: number;
  band?: ResponsiveBandLike;
}): GroupWidthLayoutResult {
  const band = args.band ?? "wide";
  if (!hasFullWidthLayoutGroup(args.blueprint, band)) {
    return { page: args.page, layoutHeight: args.viewportHeight };
  }

  const page = deepCloneDesignerPageState(args.page);
  const byId = new Map<string, FreehandObject>();
  walkObjects(page.objects, byId);
  // Geometría actual (Original o ya escalada a tablet/móvil). No usar el índice
  // del lienzo 1920: en Compacta despega recortes y fotos del resto del grupo.
  const index = buildSiteSelectionIndex(page);

  const fullGroups = Object.values(args.blueprint.nodes).filter(
    (node): node is SiteBlueprintLayoutGroupNode =>
      node.kind === "layoutGroup" && layoutGroupIsFullWidthForBand(args.blueprint, node, band),
  );

  type Prepared = {
    group: SiteBlueprintLayoutGroupNode;
    ids: string[];
    source: PageRect;
    depth: number;
  };
  const prepared: Prepared[] = [];
  for (const group of fullGroups) {
    const ids = coverageLayerIds(args.blueprint, group.id, index);
    snapContainersToDescendants(byId, ids, index);
    const source = sourceUnion(index, ids) ?? currentUnion(byId, ids, index);
    if (!source || source.width < 1) continue;
    prepared.push({ group, ids, source, depth: layoutGroupDepth(args.blueprint, group.id) });
  }

  absorbPaintedOverlaps({
    prepared,
    blueprint: args.blueprint,
    index,
    byId,
    parentRect: { x: 0, y: 0, width: args.viewportWidth, height: args.viewportHeight },
  });

  prepared.sort((a, b) => {
    if (a.depth !== b.depth) return b.depth - a.depth;
    const parentCmp = (a.group.parentId ?? "").localeCompare(b.group.parentId ?? "");
    if (parentCmp !== 0) return parentCmp;
    if (Math.abs(a.source.y - b.source.y) > 8) return a.source.y - b.source.y;
    return a.source.x - b.source.x;
  });

  const placed = new Set<string>();
  for (const item of prepared) {
    if (placed.has(item.group.id)) continue;
    const row = prepared.filter((other) => {
      if (placed.has(other.group.id)) return false;
      if (other.depth !== item.depth) return false;
      if ((other.group.parentId ?? null) !== (item.group.parentId ?? null)) return false;
      return yOverlap(item.source, other.source);
    });
    row.sort((a, b) => a.source.x - b.source.x || a.source.y - b.source.y);

    const displayUnions = row
      .map((entry) => currentUnion(byId, entry.ids, index))
      .filter((rect): rect is PageRect => Boolean(rect));
    if (displayUnions.length === 0) continue;
    const rowOrigin = unionPageRects(displayUnions);
    if (!rowOrigin) continue;
    const parent = parentContentRect({
      blueprint: args.blueprint,
      nodeId: item.group.id,
      byId,
      index,
      viewportWidth: args.viewportWidth,
      viewportHeight: args.viewportHeight,
    });
    const rowClaimed = new Set(row.flatMap((entry) => entry.ids));
    const mates = collectVisualRowMates({
      blueprint: args.blueprint,
      group: item.group,
      byId,
      index,
      origin: rowOrigin,
      parentRect: parent,
      groupLayerIds: rowClaimed,
    }).filter((mate) => boxMostlyInside(mate.bounds, parent) || isThinRule(mate.bounds));
    const leftover = mates.map((mate) => ({
      ids: mate.ids,
      origin: currentUnion(byId, mate.ids, index) ?? mate.bounds,
    }));
    const origBottom = Math.max(
      rowOrigin.y + rowOrigin.height,
      ...leftover.map((m) => m.origin.y + m.origin.height),
    );

    let cursor = rowOrigin.y;
    const moved = new Set(rowClaimed);
    for (const entry of row) placed.add(entry.group.id);
    for (const entry of row) {
      const origin = currentUnion(byId, entry.ids, index);
      if (!origin || origin.width < 1) continue;
      const fit = resolveLayoutGroupFitForBand(args.blueprint, entry.group, band);
      if (fit?.mode === "scale") {
        placeScaleGroup({
          byId,
          index,
          layerIds: entry.ids,
          origin,
          parent,
          cursor,
          fitOrigin: fit.origin,
        });
      } else {
        placeFullWidthGroup({
          byId,
          index,
          layerIds: entry.ids,
          origin,
          parent,
          cursor,
        });
      }
      const next = currentUnion(byId, entry.ids, index);
      if (!next) continue;
      cursor = next.y + next.height + ROW_GAP;
      placed.add(entry.group.id);
    }

    for (const item of leftover) item.ids.forEach((id) => moved.add(id));
    const matesBottom = leftover.length
      ? placeLeftoverMates({
          byId,
          index,
          mates: leftover,
          parent,
          cursor,
        })
      : cursor - ROW_GAP;
    const newRowBottom = Math.max(cursor - ROW_GAP, matesBottom);
    const extra = newRowBottom - origBottom;
    const occupied: PageRect = {
      x: parent.x,
      y: rowOrigin.y,
      width: parent.width,
      height: Math.max(1, newRowBottom - rowOrigin.y),
    };
    if (extra > 0.5) {
      const parentNode = item.group.parentId ? args.blueprint.nodes[item.group.parentId] : null;
      const nestedParentId = parentNode?.kind === "layoutGroup" ? parentNode.id : null;
      const parentCoverage = nestedParentId
        ? new Set(coverageLayerIds(args.blueprint, nestedParentId, index))
        : null;
      const parentBottom = parent.y + parent.height;
      for (const [id, obj] of byId) {
        if (moved.has(id)) continue;
        if (!isWorldSpaceLayerId(id, index)) continue;
        const box = paintedBox(obj, index);
        if (isPageBackground(box, parent)) continue;
        const inScope = parentCoverage
          ? parentCoverage.has(id) || obj.y + 0.5 >= parentBottom
          : true;
        if (!inScope) continue;
        if (obj.y + 0.5 >= origBottom) {
          obj.y += extra;
          continue;
        }
        if (boxesOverlap(box, occupied) && !isFullBleedBand(box, parent)) {
          const dy = newRowBottom + ROW_GAP - box.y;
          if (dy > 0.5) shiftLayers(byId, [id], index, dy);
        }
      }
    }
  }

  let layoutHeight = args.viewportHeight;
  for (const [id, obj] of byId) {
    if (!isWorldSpaceLayerId(id, index)) continue;
    layoutHeight = Math.max(layoutHeight, obj.y + obj.height);
  }
  page.customWidth = args.viewportWidth;
  page.customHeight = layoutHeight;
  return { page, layoutHeight };
}
