/**
 * Instancias vivas de MultiCard sobre displayPage.
 * Card 1 = capas reales del molde. Cards 2…N = clones efímeros.
 * No toca Designer ni el snapshot.
 */
import type { FreehandObject, PathObject } from "../FreehandStudio";
import type { DesignerPageState } from "../designer/DesignerNode";
import type { Dataset } from "../dataset/dataset-types";
import { collectSemanticCoverageLayerIds } from "./site-blueprint-ownership";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { unionPageRects, type PageRect } from "./site-creator-coordinate-space";
import {
  isWorldSpaceLayerId,
  sourceWorldBoundsOfIds,
  worldSpaceAncestorId,
} from "./site-creator-layer-world-bounds";
import { scalePathObjectUniform } from "./site-creator-responsive-matrix";
import { analyzeSectionVisualPresentation } from "./site-creator-responsive-visual";
import { resolveContainerTune } from "./site-creator-responsive-tunes";
import { scaleOriginalPxToBand } from "./site-creator-section-height";
import type { SiteCreatorSelectionIndex } from "./site-creator-selection-types";
import type { ResponsiveBandLike } from "./site-creator-responsive-overrides";
import {
  isResponsiveEditableBand,
  isSiteMultiCardNode,
  isSiteSectionNode,
  type SiteBlueprintMultiCardNode,
  type SiteBlueprintV1,
  type SiteMultiCardLayoutMode,
  type SiteMultiCardNavV1,
  type SiteMultiCardSlotOverrideV1,
} from "./site-creator-types";
import {
  encodeMultiCardInstanceId,
  parseMultiCardInstanceId,
  type MultiCardInstanceRef,
} from "./site-creator-multicard-ids";
import { mergedOverridesForCard } from "./site-creator-multicard-dataset";

/** Power2 ease-in-out (GSAP Quad.inOut) para el carrusel MultiCard. */
export const MULTICARD_SCROLL_DURATION_MS = 520;
export const MULTICARD_SCROLL_EASE_CSS = "cubic-bezier(0.455, 0.03, 0.515, 0.955)";

export function easePower2InOut(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

export function multiCardVisibleCount(args: {
  viewportSize: number;
  cardSize: number;
  gap: number;
  count: number;
}): number {
  const n = Math.max(1, args.count);
  const card = Math.max(1, args.cardSize);
  const gap = Math.max(0, args.gap);
  const stride = card + gap;
  const raw = Math.floor((Math.max(1, args.viewportSize) + gap) / stride);
  return Math.max(1, Math.min(n, raw));
}

export function multiCardMaxScrollIndex(count: number, visibleCount = 1): number {
  const n = Math.max(0, count);
  const visible = Math.max(1, Math.min(Math.max(1, n), Math.round(visibleCount)));
  return Math.max(0, n - visible);
}

export function clampMultiCardScrollIndex(
  count: number,
  index: number,
  visibleCount = 1,
): number {
  const max = multiCardMaxScrollIndex(count, visibleCount);
  if (!Number.isFinite(index)) return 0;
  return Math.min(max, Math.max(0, index));
}

export function multiCardScrollDelta(
  axis: "h" | "v" | null,
  step: number,
  scrollIndex: number,
): { dx: number; dy: number } {
  if (!axis || step <= 0 || Math.abs(scrollIndex) < 1e-9) return { dx: 0, dy: 0 };
  const delta = -scrollIndex * step;
  return axis === "h" ? { dx: delta, dy: 0 } : { dx: 0, dy: delta };
}

export function multiCardNavIsVisible(args: {
  overflow: boolean;
  visibility: SiteMultiCardNavV1["visibility"];
}): boolean {
  if (!args.overflow) return false;
  return args.visibility !== "hidden";
}

/** La card visible ocupa este ratio del viewport de scroll; el resto es peek. */
export const MULTICARD_PEEK_RATIO = 0.85;

export type MultiCardBandPresentation = {
  layoutMode: SiteMultiCardLayoutMode;
  gap: number;
  visibleHeight?: number;
  nav: SiteMultiCardNavV1;
  /** True si el modo scrollH de móvil es el automático (grid en Original). */
  mobileAutoScrollH: boolean;
};

export type MultiCardContainerLayout = {
  nodeId: string;
  layoutMode: SiteMultiCardLayoutMode;
  layoutRect: PageRect;
  clipRect: PageRect;
  cardRects: PageRect[];
  gap: number;
  scale: number;
  count: number;
  nav: SiteMultiCardNavV1;
  /** null = rejilla (sin desplazamiento). */
  axis: "h" | "v" | null;
  step: number;
  overflow: boolean;
  scrollIndex: number;
  /** Cards que caben a la vez en el viewport (scroll). Grid = count. */
  visibleCount: number;
};

export type ApplyMultiCardLayoutResult = {
  page: DesignerPageState;
  layoutHeight: number;
  instances: Record<string, MultiCardInstanceRef>;
  objectClipById: Record<string, PageRect>;
  containers: MultiCardContainerLayout[];
  regions: Array<{
    sectionId: string;
    layoutRect: PageRect;
    clipRect: PageRect;
    backgroundLayerIds: string[];
  }>;
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

function ancestorSectionId(blueprint: SiteBlueprintV1, nodeId: string): string | null {
  let walk: string | null = blueprint.nodes[nodeId]?.parentId ?? null;
  while (walk) {
    const node = blueprint.nodes[walk];
    if (!node) return null;
    if (isSiteSectionNode(node)) return node.id;
    walk = node.parentId;
  }
  return null;
}

function listMultiCards(blueprint: SiteBlueprintV1): SiteBlueprintMultiCardNode[] {
  return Object.values(blueprint.nodes).filter(isSiteMultiCardNode);
}

export function resolveMultiCardBandPresentation(
  blueprint: SiteBlueprintV1,
  node: SiteBlueprintMultiCardNode,
  band: ResponsiveBandLike,
  layoutWidth: number,
  sourceWidth: number,
): MultiCardBandPresentation {
  const editable = isResponsiveEditableBand(band) ? band : null;
  const tune = editable
    ? resolveContainerTune(blueprint, { kind: "blueprintNode", nodeId: node.id }, editable)
    : null;
  const mobileAutoScrollH =
    band === "mobile" && node.layoutMode === "grid" && tune?.repeatMode == null;
  const layoutMode: SiteMultiCardLayoutMode = tune?.repeatMode
    ? tune.repeatMode
    : mobileAutoScrollH
      ? "scrollH"
      : node.layoutMode;
  const sourceGap =
    typeof tune?.cardGap === "number" && Number.isFinite(tune.cardGap) ? tune.cardGap : node.gap;
  const gap = scaleOriginalPxToBand(sourceGap, layoutWidth, sourceWidth);
  const sourceVisible =
    typeof tune?.visibleHeight === "number" && Number.isFinite(tune.visibleHeight)
      ? tune.visibleHeight
      : node.visibleHeight;
  const visibleHeight =
    typeof sourceVisible === "number" && sourceVisible > 0
      ? scaleOriginalPxToBand(sourceVisible, layoutWidth, sourceWidth)
      : undefined;
  const nav: SiteMultiCardNavV1 = {
    visibility: tune?.navVisibility ?? node.nav?.visibility ?? "auto",
    style: tune?.navStyle ?? node.nav?.style ?? "arrows",
  };
  return { layoutMode, gap, visibleHeight, nav, mobileAutoScrollH };
}

function parentRectForNode(args: {
  blueprint: SiteBlueprintV1;
  nodeId: string;
  layoutWidth: number;
  pageHeight: number;
  regions: Array<{ sectionId: string; layoutRect: PageRect }>;
}): PageRect {
  const sectionId = ancestorSectionId(args.blueprint, args.nodeId);
  if (sectionId) {
    const region = args.regions.find((r) => r.sectionId === sectionId);
    if (region) return { ...region.layoutRect };
    const section = args.blueprint.nodes[sectionId];
    if (section && isSiteSectionNode(section)) {
      return {
        x: 0,
        y: section.sourceRange.top,
        width: args.layoutWidth,
        height: Math.max(1, section.sourceRange.bottom - section.sourceRange.top),
      };
    }
  }
  return { x: 0, y: 0, width: args.layoutWidth, height: args.pageHeight };
}

function resolveContainerBox(mold: PageRect, parent: PageRect): PageRect {
  const relX = mold.x - parent.x;
  let width = parent.width - 2 * relX;
  if (width + 0.5 < mold.width) {
    width = parent.x + parent.width - mold.x;
  }
  return {
    x: mold.x,
    y: mold.y,
    width: Math.max(mold.width, width),
    height: mold.height,
  };
}

export function planMultiCardGrid(args: {
  mold: PageRect;
  count: number;
  gap: number;
  containerWidth: number;
  layoutMode: SiteMultiCardLayoutMode;
  visibleHeight?: number;
}): { cols: number; rows: number; container: PageRect; cardRects: PageRect[]; scale: number } {
  const n = Math.max(1, args.count);
  const gap = Math.max(0, args.gap);
  let cardW = Math.max(1, args.mold.width);
  let cardH = Math.max(1, args.mold.height);
  let scale = 1;

  if (args.layoutMode === "scrollH") {
    if (cardW > args.containerWidth + 0.5) {
      scale = args.containerWidth / cardW;
      cardW *= scale;
      cardH *= scale;
    }
    const viewportW = Math.max(1, args.containerWidth);
    const container: PageRect = {
      x: args.mold.x,
      y: args.mold.y,
      width: viewportW,
      height: cardH,
    };
    const cardRects: PageRect[] = [];
    for (let i = 0; i < n; i += 1) {
      cardRects.push({
        x: container.x + i * (cardW + gap),
        y: container.y,
        width: cardW,
        height: cardH,
      });
    }
    return { cols: n, rows: 1, container, cardRects, scale };
  }

  if (args.layoutMode === "scrollV") {
    const axis = args.visibleHeight ?? 2 * cardH + gap + 0.2 * cardH;
    const maxH = Math.max(1, axis * MULTICARD_PEEK_RATIO);
    if (cardH > maxH + 0.5) {
      scale = maxH / cardH;
      cardW *= scale;
      cardH *= scale;
    }
    const minVisible = 1.2 * cardH;
    const contentH = n * cardH + (n - 1) * gap;
    const visibleH = Math.min(contentH, Math.max(minVisible, args.visibleHeight ?? axis));
    const container: PageRect = {
      x: args.mold.x,
      y: args.mold.y,
      width: Math.max(cardW, args.containerWidth),
      height: visibleH,
    };
    const cardRects: PageRect[] = [];
    for (let i = 0; i < n; i += 1) {
      cardRects.push({
        x: container.x,
        y: container.y + i * (cardH + gap),
        width: cardW,
        height: cardH,
      });
    }
    return { cols: 1, rows: n, container, cardRects, scale };
  }

  const cols = Math.min(n, Math.max(1, Math.floor((args.containerWidth + gap) / (cardW + gap))));
  const rows = Math.ceil(n / cols);
  const container: PageRect = {
    x: args.mold.x,
    y: args.mold.y,
    width: args.containerWidth,
    height: rows * cardH + (rows - 1) * gap,
  };
  const cardRects: PageRect[] = [];
  for (let i = 0; i < n; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    cardRects.push({
      x: container.x + col * (cardW + gap),
      y: container.y + row * (cardH + gap),
      width: cardW,
      height: cardH,
    });
  }
  return { cols, rows, container, cardRects, scale };
}

/**
 * Si todos los hijos de una carpeta Designer están en el molde, clonar la carpeta
 * entera. Extraer los hijos a la raíz rompe z-order, clips y el paint del grupo.
 */
function liftFullyCoveredGroupContainers(
  candidates: Set<string>,
  index: SiteCreatorSelectionIndex,
): Set<string> {
  const ids = new Set(candidates);
  let changed = true;
  while (changed) {
    changed = false;
    const parentIds = new Set<string>();
    for (const id of ids) {
      const parentId = index.byId[id]?.parentLayerId;
      if (!parentId || ids.has(parentId)) continue;
      if (index.byId[parentId]?.type !== "groupContainer") continue;
      parentIds.add(parentId);
    }
    for (const parentId of parentIds) {
      const kids = index.entries.filter((entry) => entry.parentLayerId === parentId);
      if (kids.length === 0) continue;
      if (!kids.every((kid) => ids.has(kid.layerId))) continue;
      for (const kid of kids) ids.delete(kid.layerId);
      ids.add(parentId);
      changed = true;
    }
  }
  return ids;
}

const MOLD_WRAP_PREFIX = "__scmcwrap_";

export function multiCardMoldWrapLayerId(nodeId: string): string {
  return `${MOLD_WRAP_PREFIX}${nodeId}`;
}

export function isMultiCardMoldWrapId(layerId: string): boolean {
  if (layerId.startsWith(MOLD_WRAP_PREFIX)) return true;
  const mold = parseMultiCardInstanceId(layerId)?.moldLayerId;
  return Boolean(mold?.startsWith(MOLD_WRAP_PREFIX));
}

function compareZOrderPath(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    if (a[i] !== b[i]) return a[i]! - b[i]!;
  }
  return a.length - b.length;
}

function sortWorldRootsByPaintOrder(ids: string[], index: SiteCreatorSelectionIndex): string[] {
  return [...ids].sort((a, b) =>
    compareZOrderPath(index.byId[a]?.zOrderPath ?? [], index.byId[b]?.zOrderPath ?? []),
  );
}

function isDesignerCompositionRoot(obj: FreehandObject): boolean {
  return obj.type === "groupContainer" || obj.type === "clippingContainer" || obj.type === "booleanGroup";
}

function wrapMoldRootsAsGroup(args: {
  children: FreehandObject[];
  mold: PageRect;
  nodeId: string;
}): FreehandObject {
  return {
    id: multiCardMoldWrapLayerId(args.nodeId),
    type: "groupContainer",
    name: "MultiCard",
    x: args.mold.x,
    y: args.mold.y,
    width: args.mold.width,
    height: args.mold.height,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    fill: { type: "solid", color: "none" },
    stroke: "none",
    strokeWidth: 0,
    strokeLinecap: "butt",
    strokeLinejoin: "miter",
    strokeDasharray: "0",
    children: args.children,
  } as FreehandObject;
}

/**
 * Cards 2…N clonan el molde como una sola carpeta. Si Designer ya tiene
 * group/clip/boolean, esa es la unidad. Si el Grupo de Site Creator son
 * capas sueltas, se envuelven para no extraer fotos ni máscaras.
 */
function moldCloneTemplates(
  worldRoots: string[],
  byId: Map<string, FreehandObject>,
  index: SiteCreatorSelectionIndex,
  mold: PageRect,
  nodeId: string,
): FreehandObject[] {
  const sources = sortWorldRootsByPaintOrder(worldRoots, index)
    .map((id) => byId.get(id))
    .filter((obj): obj is FreehandObject => Boolean(obj))
    .map((obj) => structuredClone(obj));
  if (sources.length === 0) return [];
  if (sources.length === 1 && isDesignerCompositionRoot(sources[0]!)) {
    return sources;
  }
  if (sources.length === 1) return sources;
  return [wrapMoldRootsAsGroup({ children: sources, mold, nodeId })];
}

function moldWorldRootIds(
  coverage: string[],
  index: SiteCreatorSelectionIndex,
): string[] {
  const covered = new Set(coverage);
  const candidates = new Set<string>();
  for (const id of coverage) {
    const world = worldSpaceAncestorId(id, index);
    const root = covered.has(world) ? world : isWorldSpaceLayerId(id, index) ? id : world;
    if (root) candidates.add(root);
  }
  const lifted = liftFullyCoveredGroupContainers(candidates, index);
  const roots: string[] = [];
  for (const id of lifted) {
    const nested = index.byId[id]?.ancestorIds.some((ancestorId) => lifted.has(ancestorId));
    if (nested) continue;
    roots.push(id);
  }
  return roots;
}

function remapSubtreeIds(
  obj: FreehandObject,
  nodeId: string,
  cardId: string,
  idMap: Map<string, string>,
): void {
  const nextId = encodeMultiCardInstanceId({ nodeId, cardId, moldLayerId: obj.id });
  idMap.set(obj.id, nextId);
  obj.id = nextId;
  if ("groupId" in obj) {
    delete (obj as { groupId?: string }).groupId;
  }
  if (obj.type === "groupContainer" || obj.type === "booleanGroup") {
    for (const child of (obj as { children?: FreehandObject[] }).children ?? []) {
      remapSubtreeIds(child, nodeId, cardId, idMap);
    }
    return;
  }
  if (obj.type === "clippingContainer") {
    const clip = obj as { mask?: FreehandObject; content?: FreehandObject[] };
    if (clip.mask) remapSubtreeIds(clip.mask, nodeId, cardId, idMap);
    for (const child of clip.content ?? []) {
      remapSubtreeIds(child, nodeId, cardId, idMap);
    }
  }
}

function walkCloneTree(obj: FreehandObject, visit: (node: FreehandObject) => void): void {
  visit(obj);
  if (obj.type === "groupContainer" || obj.type === "booleanGroup") {
    for (const child of (obj as { children?: FreehandObject[] }).children ?? []) {
      walkCloneTree(child, visit);
    }
    return;
  }
  if (obj.type === "clippingContainer") {
    const clip = obj as { mask?: FreehandObject; content?: FreehandObject[] };
    if (clip.mask) walkCloneTree(clip.mask, visit);
    for (const child of clip.content ?? []) walkCloneTree(child, visit);
    return;
  }
  if (obj.type === "textOnPath") {
    const guide = (obj as { guidePath?: FreehandObject }).guidePath;
    if (guide) walkCloneTree(guide, visit);
  }
}

/** clipMaskId / guía de texto apuntan al id nuevo de la misma card, no al molde. */
function remapObjectRefs(obj: FreehandObject, idMap: Map<string, string>): void {
  walkCloneTree(obj, (node) => {
    const clipId = (node as { clipMaskId?: string }).clipMaskId;
    if (clipId && idMap.has(clipId)) {
      (node as { clipMaskId?: string }).clipMaskId = idMap.get(clipId);
    }
    const guideId = (node as { guidePathId?: string }).guidePathId;
    if (guideId && idMap.has(guideId)) {
      (node as { guidePathId?: string }).guidePathId = idMap.get(guideId);
    }
  });
}

function applySlotOverride(obj: FreehandObject, slot: SiteMultiCardSlotOverrideV1 | undefined): void {
  if (!slot) return;
  if (typeof slot.text === "string" && (obj.type === "text" || obj.type === "textOnPath")) {
    (obj as { text: string }).text = slot.text;
  }
  if (slot.mediaRef) {
    if (obj.type === "image") {
      if (typeof slot.mediaRef.src === "string") (obj as { src: string }).src = slot.mediaRef.src;
      if (typeof slot.mediaRef.s3Key === "string") {
        (obj as { s3Key?: string }).s3Key = slot.mediaRef.s3Key;
      }
    }
    const frame = (obj as { imageFrameContent?: { src?: string; s3Key?: string } | null }).imageFrameContent;
    if (frame) {
      if (typeof slot.mediaRef.src === "string") frame.src = slot.mediaRef.src;
      if (typeof slot.mediaRef.s3Key === "string") frame.s3Key = slot.mediaRef.s3Key;
    }
  }
}

function applyOverridesToTree(
  obj: FreehandObject,
  overrides: Record<string, SiteMultiCardSlotOverrideV1>,
  moldIdOf: (id: string) => string,
): void {
  applySlotOverride(obj, overrides[moldIdOf(obj.id)]);
  if (obj.type === "groupContainer" || obj.type === "booleanGroup") {
    for (const child of (obj as { children?: FreehandObject[] }).children ?? []) {
      applyOverridesToTree(child, overrides, moldIdOf);
    }
    return;
  }
  if (obj.type === "clippingContainer") {
    const clip = obj as { mask?: FreehandObject; content?: FreehandObject[] };
    if (clip.mask) applyOverridesToTree(clip.mask, overrides, moldIdOf);
    for (const child of clip.content ?? []) {
      applyOverridesToTree(child, overrides, moldIdOf);
    }
  }
}

function scalePathAround(node: PathObject, scale: number, originX: number, originY: number): void {
  scalePathObjectUniform(node, scale, originX * (1 - scale), originY * (1 - scale));
}

function scaleWorldRoot(obj: FreehandObject, scale: number, originX = obj.x, originY = obj.y): void {
  if (scale === 1) return;
  if (obj.type === "path") {
    scalePathAround(obj as PathObject, scale, originX, originY);
    return;
  }
  obj.x = originX + (obj.x - originX) * scale;
  obj.y = originY + (obj.y - originY) * scale;
  obj.width = Math.max(1, obj.width * scale);
  obj.height = Math.max(1, obj.height * scale);
  const walk = (node: FreehandObject, scaleLocal: boolean) => {
    if (node.type === "text" || node.type === "textOnPath") {
      const font = (node as { fontSize?: number }).fontSize;
      if (typeof font === "number") (node as { fontSize: number }).fontSize = Math.max(8, font * scale);
    }
    if (node.type === "path") {
      if (scaleLocal) {
        scalePathObjectUniform(node as PathObject, scale, 0, 0);
      } else {
        scalePathAround(node as PathObject, scale, originX, originY);
      }
      return;
    }
    if (node.type === "groupContainer") {
      for (const child of (node as { children?: FreehandObject[] }).children ?? []) {
        if (!scaleLocal) {
          if (child.type === "path") {
            scalePathAround(child as PathObject, scale, originX, originY);
            continue;
          }
          child.x = originX + (child.x - originX) * scale;
          child.y = originY + (child.y - originY) * scale;
          child.width = Math.max(1, child.width * scale);
          child.height = Math.max(1, child.height * scale);
        } else {
          child.x *= scale;
          child.y *= scale;
          child.width = Math.max(1, child.width * scale);
          child.height = Math.max(1, child.height * scale);
        }
        walk(child, true);
      }
      return;
    }
    if (node.type === "booleanGroup") {
      for (const child of (node as { children?: FreehandObject[] }).children ?? []) {
        if (scaleLocal) {
          child.x *= scale;
          child.y *= scale;
          child.width = Math.max(1, child.width * scale);
          child.height = Math.max(1, child.height * scale);
        }
        walk(child, true);
      }
      return;
    }
    if (node.type === "clippingContainer") {
      const clip = node as { mask?: FreehandObject; content?: FreehandObject[] };
      for (const child of [clip.mask, ...(clip.content ?? [])].filter(Boolean) as FreehandObject[]) {
        if (scaleLocal) {
          child.x *= scale;
          child.y *= scale;
          child.width = Math.max(1, child.width * scale);
          child.height = Math.max(1, child.height * scale);
        }
        walk(child, true);
      }
    }
  };
  walk(obj, false);
}

function shiftWorldObject(obj: FreehandObject, dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return;
  if (obj.type === "path") {
    const path = obj as PathObject;
    if (path.svgPathD && (!path.points || path.points.length < 2)) {
      if (path.svgPathIntrinsicW != null && path.svgPathIntrinsicH != null) {
        path.x += dx;
        path.y += dy;
        return;
      }
      const m = path.svgPathMatrix ?? { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
      path.x += dx;
      path.y += dy;
      path.svgPathMatrix = { ...m, e: m.e + dx, f: m.f + dy };
      return;
    }
    scalePathObjectUniform(path, 1, dx, dy);
    return;
  }
  if (obj.type === "clippingContainer" || obj.type === "booleanGroup") {
    obj.x += dx;
    obj.y += dy;
    return;
  }
  if (obj.type === "textOnPath") {
    obj.x += dx;
    obj.y += dy;
    const guide = (obj as { guidePath?: FreehandObject }).guidePath;
    if (guide) shiftWorldObject(guide, dx, dy);
    return;
  }
  obj.x += dx;
  obj.y += dy;
  if (obj.type === "groupContainer") {
    for (const child of (obj as { children?: FreehandObject[] }).children ?? []) {
      shiftWorldObject(child, dx, dy);
    }
  }
}

function pageContentBottom(page: DesignerPageState): number {
  let max = 0;
  const visit = (objs: FreehandObject[] | undefined) => {
    for (const obj of objs ?? []) {
      max = Math.max(max, (obj.y ?? 0) + (obj.height ?? 0));
      if (obj.type === "groupContainer" || obj.type === "booleanGroup") {
        visit((obj as { children?: FreehandObject[] }).children);
      }
    }
  };
  visit(page.objects);
  return max;
}

function sectionBackgroundIds(args: {
  blueprint: SiteBlueprintV1;
  sectionId: string | null;
  index: SiteCreatorSelectionIndex;
  regionBackgroundIds: string[];
}): Set<string> {
  const ids = new Set<string>();
  for (const id of args.regionBackgroundIds) ids.add(id);
  if (!args.sectionId) return ids;
  const analysis = analyzeSectionVisualPresentation({
    blueprint: args.blueprint,
    sectionId: args.sectionId,
    index: args.index,
  });
  for (const id of analysis?.background.backgroundLayerIds ?? []) ids.add(id);
  return ids;
}

export function applyMultiCardLayout(args: {
  page: DesignerPageState;
  blueprint: SiteBlueprintV1;
  band: ResponsiveBandLike;
  layoutWidth: number;
  sourceWidth: number;
  layoutHeight: number;
  regions?: Array<{
    sectionId: string;
    layoutRect: PageRect;
    clipRect: PageRect;
    backgroundLayerIds: string[];
  }>;
  objectClipById?: Record<string, PageRect>;
  scrollIndexByNodeId?: Record<string, number>;
  dataset?: Dataset | null;
}): ApplyMultiCardLayoutResult {
  const nodes = listMultiCards(args.blueprint);
  const empty: ApplyMultiCardLayoutResult = {
    page: args.page,
    layoutHeight: args.layoutHeight,
    instances: {},
    objectClipById: { ...(args.objectClipById ?? {}) },
    containers: [],
    regions: (args.regions ?? []).map((r) => ({
      ...r,
      layoutRect: { ...r.layoutRect },
      clipRect: { ...r.clipRect },
      backgroundLayerIds: [...r.backgroundLayerIds],
    })),
  };
  if (nodes.length === 0) return empty;

  const page = args.page;
  const regions = (args.regions ?? []).map((r) => ({
    ...r,
    layoutRect: { ...r.layoutRect },
    clipRect: { ...r.clipRect },
    backgroundLayerIds: [...r.backgroundLayerIds],
  }));
  const objectClipById: Record<string, PageRect> = { ...(args.objectClipById ?? {}) };
  const instances: Record<string, MultiCardInstanceRef> = {};
  const containers: MultiCardContainerLayout[] = [];

  const ordered = [...nodes].sort((a, b) => {
    const index = buildSiteSelectionIndex(page);
    const aIds = collectSemanticCoverageLayerIds(args.blueprint, a.id);
    const bIds = collectSemanticCoverageLayerIds(args.blueprint, b.id);
    const aRect = sourceWorldBoundsOfIds(aIds, index);
    const bRect = sourceWorldBoundsOfIds(bIds, index);
    return (aRect?.y ?? 0) - (bRect?.y ?? 0);
  });

  for (const node of ordered) {
    const index = buildSiteSelectionIndex(page);
    const byId = new Map<string, FreehandObject>();
    walkObjects(page.objects, byId);
    const coverage = collectSemanticCoverageLayerIds(args.blueprint, node.id);
    if (coverage.length === 0) continue;
    const mold = sourceWorldBoundsOfIds(coverage, index);
    if (!mold || mold.width < 1 || mold.height < 1) continue;

    const presentation = resolveMultiCardBandPresentation(
      args.blueprint,
      node,
      args.band,
      args.layoutWidth,
      args.sourceWidth,
    );
    const parent = parentRectForNode({
      blueprint: args.blueprint,
      nodeId: node.id,
      layoutWidth: args.layoutWidth,
      pageHeight: args.layoutHeight,
      regions,
    });
    const box = resolveContainerBox(mold, parent);
    const planned = planMultiCardGrid({
      mold,
      count: node.cards.length,
      gap: presentation.gap,
      containerWidth: box.width,
      layoutMode: presentation.layoutMode,
      visibleHeight: presentation.visibleHeight,
    });

    const worldRoots = moldWorldRootIds(coverage, index);
    const templates = moldCloneTemplates(worldRoots, byId, index, mold, node.id);
    const card1 = node.cards[0];
    if (card1) {
      const merged = mergedOverridesForCard({
        dataset: args.dataset,
        node,
        card: card1,
        cardIndex: 0,
      });
      for (const rootId of worldRoots) {
        const obj = byId.get(rootId);
        if (!obj) continue;
        applyOverridesToTree(obj, merged, (id) => id);
        if (planned.scale !== 1) scaleWorldRoot(obj, planned.scale, mold.x, mold.y);
      }
    }

    const extraH = planned.container.height - mold.height;
    const sectionId = ancestorSectionId(args.blueprint, node.id);
    const region = sectionId ? regions.find((r) => r.sectionId === sectionId) : undefined;
    const backgrounds = sectionBackgroundIds({
      blueprint: args.blueprint,
      sectionId,
      index,
      regionBackgroundIds: region?.backgroundLayerIds ?? [],
    });
    const moldRootSet = new Set(worldRoots);

    if (extraH > 0.5) {
      const moldBottom = mold.y + mold.height;
      const shifted = new Set<string>();
      for (const entry of index.entries) {
        if (!isWorldSpaceLayerId(entry.layerId, index)) continue;
        if (moldRootSet.has(entry.layerId)) continue;
        if (parseMultiCardInstanceId(entry.layerId)) continue;
        if (backgrounds.has(entry.layerId)) continue;
        const obj = byId.get(entry.layerId);
        if (!obj) continue;
        if (obj.y + 0.5 < moldBottom) continue;
        if (shifted.has(entry.layerId)) continue;
        shiftWorldObject(obj, 0, extraH);
        shifted.add(entry.layerId);
      }
      for (const bgId of backgrounds) {
        const world = worldSpaceAncestorId(bgId, index);
        const obj = byId.get(world);
        if (!obj) continue;
        obj.height = Math.max(obj.height, obj.height + extraH);
      }
      if (region) {
        region.layoutRect = {
          ...region.layoutRect,
          height: region.layoutRect.height + extraH,
        };
        region.clipRect = {
          ...region.clipRect,
          height: region.clipRect.height + extraH,
        };
        for (const later of regions) {
          if (later.sectionId === region.sectionId) continue;
          if (later.layoutRect.y + 0.5 < region.layoutRect.y + region.layoutRect.height - extraH) continue;
          later.layoutRect = { ...later.layoutRect, y: later.layoutRect.y + extraH };
          later.clipRect = { ...later.clipRect, y: later.clipRect.y + extraH };
        }
      }
    }

    const clones: FreehandObject[] = [];
    for (let i = 1; i < node.cards.length; i += 1) {
      const card = node.cards[i]!;
      const dest = planned.cardRects[i]!;
      const dx = dest.x - mold.x;
      const dy = dest.y - mold.y;
      const idMap = new Map<string, string>();
      const cardClones: FreehandObject[] = [];
      for (const template of templates) {
        const clone = structuredClone(template);
        remapSubtreeIds(clone, node.id, card.id, idMap);
        if (planned.scale !== 1) scaleWorldRoot(clone, planned.scale);
        shiftWorldObject(clone, dx, dy);
        applyOverridesToTree(
          clone,
          mergedOverridesForCard({
            dataset: args.dataset,
            node,
            card,
            cardIndex: i,
          }),
          (id) => parseMultiCardInstanceId(id)?.moldLayerId ?? id,
        );
        cardClones.push(clone);
        for (const [moldId, instanceId] of idMap) {
          if (instances[instanceId]) continue;
          instances[instanceId] = {
            nodeId: node.id,
            cardId: card.id,
            moldLayerId: moldId,
            cardIndex: i,
          };
        }
      }
      for (const clone of cardClones) remapObjectRefs(clone, idMap);
      clones.push(...cardClones);
    }

    if (clones.length > 0) {
      const objects = page.objects ?? [];
      let insertAt = objects.length;
      for (let i = objects.length - 1; i >= 0; i -= 1) {
        if (moldRootSet.has(objects[i]!.id)) {
          insertAt = i + 1;
          break;
        }
      }
      objects.splice(insertAt, 0, ...clones);
      page.objects = objects;
    }

    const clip =
      presentation.layoutMode === "grid"
        ? null
        : planned.container;
    const axis: "h" | "v" | null =
      presentation.layoutMode === "scrollH" ? "h" : presentation.layoutMode === "scrollV" ? "v" : null;
    const step =
      axis === "h"
        ? (planned.cardRects[0]?.width ?? 0) + presentation.gap
        : axis === "v"
          ? (planned.cardRects[0]?.height ?? 0) + presentation.gap
          : 0;
    const contentSpan =
      axis === "h"
        ? node.cards.length * (planned.cardRects[0]?.width ?? 0) + (node.cards.length - 1) * presentation.gap
        : axis === "v"
          ? node.cards.length * (planned.cardRects[0]?.height ?? 0) + (node.cards.length - 1) * presentation.gap
          : 0;
    const overflow =
      axis === "h"
        ? contentSpan > planned.container.width + 0.5
        : axis === "v"
          ? contentSpan > planned.container.height + 0.5
          : false;
    const visibleCount = axis
      ? multiCardVisibleCount({
          viewportSize: axis === "h" ? planned.container.width : planned.container.height,
          cardSize:
            axis === "h"
              ? (planned.cardRects[0]?.width ?? 0)
              : (planned.cardRects[0]?.height ?? 0),
          gap: presentation.gap,
          count: node.cards.length,
        })
      : node.cards.length;
    const scrollIndex = overflow
      ? clampMultiCardScrollIndex(
          node.cards.length,
          args.scrollIndexByNodeId?.[node.id] ?? 0,
          visibleCount,
        )
      : 0;
    const { dx, dy } = multiCardScrollDelta(axis, step, scrollIndex);
    if (dx !== 0 || dy !== 0) {
      for (const rootId of worldRoots) {
        const obj = byId.get(rootId);
        if (obj) shiftWorldObject(obj, dx, dy);
      }
      for (const clone of clones) {
        shiftWorldObject(clone, dx, dy);
      }
    }

    if (clip) {
      for (const layerId of coverage) objectClipById[layerId] = { ...clip };
      for (const rootId of worldRoots) objectClipById[rootId] = { ...clip };
      for (const instanceId of Object.keys(instances)) {
        if (instances[instanceId]?.nodeId === node.id) {
          objectClipById[instanceId] = { ...clip };
        }
      }
    } else if (region) {
      for (const instanceId of Object.keys(instances)) {
        if (instances[instanceId]?.nodeId === node.id) {
          objectClipById[instanceId] = { ...region.clipRect };
        }
      }
    }

    containers.push({
      nodeId: node.id,
      layoutMode: presentation.layoutMode,
      layoutRect: planned.container,
      clipRect: clip ?? planned.container,
      cardRects: planned.cardRects,
      gap: presentation.gap,
      scale: planned.scale,
      count: node.cards.length,
      nav: presentation.nav,
      axis,
      step,
      overflow,
      scrollIndex,
      visibleCount,
    });
  }

  const contentBottom = pageContentBottom(page);
  const layoutHeight = Math.max(args.layoutHeight, contentBottom, 1);
  page.customWidth = args.layoutWidth;
  page.customHeight = layoutHeight;

  return { page, layoutHeight, instances, objectClipById, containers, regions };
}

export function collectMultiCardInstanceLayerIds(
  index: SiteCreatorSelectionIndex,
  nodeId: string,
): string[] {
  const ids: string[] = [];
  for (const entry of index.entries) {
    const parsed = parseMultiCardInstanceId(entry.layerId);
    if (parsed?.nodeId === nodeId) ids.push(entry.layerId);
  }
  return ids;
}
