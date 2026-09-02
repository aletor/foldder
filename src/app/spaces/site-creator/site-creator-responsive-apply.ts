/**
 * Fase 6C — aplica ajustes de elemento sobre el resultado automático (display).
 * No toca Designer ni la vista Original.
 */
import type { FreehandObject, PathObject } from "../FreehandStudio";
import type { PageRect } from "./site-creator-coordinate-space";
import { unionPageRects } from "./site-creator-coordinate-space";
import type { SiteCreatorSelectionIndex } from "./site-creator-selection-types";
import type { SiteBlueprintV1 } from "./site-creator-types";
import type { ResponsiveEditableBand, ResponsiveItemRef } from "./site-creator-types";
import { isSiteButtonNode, isSiteSectionNode } from "./site-creator-types";
import { collectSemanticCoverageLayerIds } from "./site-blueprint-ownership";
import { classifyContainerBackground } from "./site-creator-responsive-visual";
import { resolveEffectiveResponsiveMode } from "./site-creator-responsive-overrides";
import {
  preservedStackGaps,
  stackColumnX,
  stackLayoutScale,
} from "./site-creator-stack-layout";
import { scaleStyleFields, transformPathObjectRelative } from "./site-creator-responsive-matrix";
import {
  resolveBackgroundContainTransform,
  resolveBackgroundCoverTransform,
  resolveBackgroundPreserveTransform,
} from "./site-creator-background-cover";
import { isLayerExplicitBackground } from "./site-creator-background-assignment";
import {
  reflowAreaTextHeightsInTree,
  scaleTextTypographyFields,
} from "./site-creator-responsive-typography";
import {
  hugAreaTextHeight,
  isAreaTextObject,
  isTextObject,
  layerOwnedByButton,
} from "./site-creator-text-frame";
import {
  applyHiddenObjectAppearance,
  contentBoxX,
  contentBoxY,
  coverageLayerIdsForItem,
  isLayerHiddenInBand,
  normalizeItemBoxFactor,
  normalizeItemFontScale,
  resolveContainerTune,
  resolveItemTune,
  resolveMediaTune,
  sameItemRef,
  type HiddenItemsRenderMode,
} from "./site-creator-responsive-tunes";

function isLayerExcludedFromFlow(args: {
  blueprint: SiteBlueprintV1;
  layerId: string;
  band: ResponsiveEditableBand;
  nodeId?: string | null;
}): boolean {
  return (
    isLayerExplicitBackground(args.blueprint, args.layerId, args.band) ||
    isLayerHiddenInBand(args)
  );
}

export type ResolvedRegionBox = {
  sectionId: string;
  layoutRect: PageRect;
  clipRect: PageRect;
};

function collectButtonLayerIds(blueprint: SiteBlueprintV1): Set<string> {
  const ids = new Set<string>();
  for (const node of Object.values(blueprint.nodes)) {
    if (!isSiteButtonNode(node)) continue;
    for (const id of node.layerIds ?? []) ids.add(id);
  }
  return ids;
}

function backgroundLayerIdsForDesignerGroup(args: {
  blueprint: SiteBlueprintV1;
  groupLayerId: string;
  index: SiteCreatorSelectionIndex;
}): Set<string> {
  const root = args.index.byId[args.groupLayerId];
  if (!root) return new Set();
  const childIds = args.index.entries
    .filter((e) => e.parentLayerId === args.groupLayerId)
    .map((e) => e.layerId);
  const layerIds = childIds.length ? childIds : [args.groupLayerId];
  const bounds =
    unionPageRects(layerIds.map((id) => args.index.byId[id]?.visualBounds).filter(Boolean) as PageRect[]) ??
    root.visualBounds;
  const bg = classifyContainerBackground({
    containerBounds: bounds,
    layerIds,
    index: args.index,
    buttonLayerIds: collectButtonLayerIds(args.blueprint),
  });
  return new Set(bg.backgroundLayerIds);
}

function designerGroupContainerLayerId(args: {
  layerIds: string[];
  index: SiteCreatorSelectionIndex;
}): string | null {
  const containers = new Set<string>();
  for (const layerId of args.layerIds) {
    const parentId = args.index.byId[layerId]?.parentLayerId;
    if (!parentId) continue;
    if (args.index.byId[parentId]?.type === "groupContainer") containers.add(parentId);
  }
  return containers.size === 1 ? [...containers][0]! : null;
}

function backgroundIdsForContentLayers(args: {
  blueprint: SiteBlueprintV1;
  contentLayerIds: string[];
  index: SiteCreatorSelectionIndex;
}): Set<string> {
  const containerId = designerGroupContainerLayerId({
    layerIds: args.contentLayerIds,
    index: args.index,
  });
  if (!containerId) return new Set<string>();
  return backgroundLayerIdsForDesignerGroup({
    blueprint: args.blueprint,
    groupLayerId: containerId,
    index: args.index,
  });
}

export function countContainerReflowUnits(args: {
  blueprint: SiteBlueprintV1;
  target: import("./site-creator-types").ResponsiveTargetRef;
  index: SiteCreatorSelectionIndex;
  band: ResponsiveEditableBand;
}): number {
  const target = args.target;
  if (target.kind === "blueprintNode") {
    const node = args.blueprint.nodes[target.nodeId];
    if (node?.kind === "layoutGroup") {
      let count = 0;
      for (const childId of node.childIds) {
        const layerIds = collectSemanticCoverageLayerIds(args.blueprint, childId).filter(
          (id) => !isLayerExcludedFromFlow({ blueprint: args.blueprint, layerId: id, band: args.band, nodeId: childId }),
        );
        if (layerIds.length) count += 1;
      }
      for (const layerId of node.layerIds ?? []) {
        if (isLayerExcludedFromFlow({ blueprint: args.blueprint, layerId, band: args.band })) continue;
        count += 1;
      }
      return count;
    }
    if (isSiteSectionNode(node)) return node.childIds.length;
  }
  if (target.kind === "designerGroup") {
    const bg = backgroundLayerIdsForDesignerGroup({
      blueprint: args.blueprint,
      groupLayerId: target.layerId,
      index: args.index,
    });
    const childIds = args.index.entries
      .filter((e) => e.parentLayerId === target.layerId)
      .map((e) => e.layerId)
      .filter(
        (id) =>
          !bg.has(id) &&
          !isLayerExcludedFromFlow({ blueprint: args.blueprint, layerId: id, band: args.band }),
      );
    return childIds.length;
  }
  return 0;
}

function isBackgroundUnit(layerIds: string[], backgroundIds: Set<string>): boolean {
  return layerIds.length > 0 && layerIds.every((id) => backgroundIds.has(id));
}

function displayRoots(
  layerIds: string[],
  index: SiteCreatorSelectionIndex,
): string[] {
  const set = new Set(layerIds);
  return layerIds.filter((id) => {
    const parent = index.byId[id]?.parentLayerId;
    return !parent || !set.has(parent);
  });
}

function currentBounds(
  byId: Map<string, FreehandObject>,
  layerIds: string[],
  index: SiteCreatorSelectionIndex,
): PageRect | null {
  const rects: PageRect[] = [];
  for (const id of displayRoots(layerIds, index)) {
    const obj = byId.get(id);
    if (!obj) continue;
    rects.push({ x: obj.x, y: obj.y, width: obj.width, height: obj.height });
  }
  return unionPageRects(rects);
}

function scaleSubtreeLocal(obj: FreehandObject, scale: number): void {
  if (obj.type === "text" || obj.type === "textOnPath") {
    scaleTextTypographyFields(obj, scale);
  } else {
    scaleStyleFields(obj, scale);
  }
  if (obj.type === "groupContainer" || obj.type === "booleanGroup") {
    for (const ch of (obj as { children?: FreehandObject[] }).children ?? []) {
      ch.x *= scale;
      ch.y *= scale;
      ch.width = Math.max(1, ch.width * scale);
      ch.height = Math.max(1, ch.height * scale);
      scaleSubtreeLocal(ch, scale);
    }
    return;
  }
  if (obj.type === "clippingContainer") {
    const c = obj as { mask?: FreehandObject; content?: FreehandObject[] };
    for (const ch of [c.mask, ...(c.content ?? [])].filter(Boolean) as FreehandObject[]) {
      ch.x *= scale;
      ch.y *= scale;
      ch.width = Math.max(1, ch.width * scale);
      ch.height = Math.max(1, ch.height * scale);
      scaleSubtreeLocal(ch, scale);
    }
  }
}

function sourceBoundsOfIds(
  layerIds: string[],
  index: SiteCreatorSelectionIndex,
): PageRect | null {
  const rects = layerIds
    .map((id) => index.byId[id]?.visualBounds)
    .filter((r): r is PageRect => Boolean(r));
  return unionPageRects(rects);
}

function placeLayersFromSource(
  byId: Map<string, FreehandObject>,
  layerIds: string[],
  index: SiteCreatorSelectionIndex,
  origin: PageRect,
  target: { x: number; y: number; scaleX: number; scaleY: number },
): void {
  const set = new Set(layerIds);
  const roots = displayRoots(layerIds, index);
  for (const id of roots) {
    const obj = byId.get(id);
    const entry = index.byId[id];
    if (!obj || !entry) continue;
    const b = entry.visualBounds;
    const world: PageRect = {
      x: target.x + (b.x - origin.x) * target.scaleX,
      y: target.y + (b.y - origin.y) * target.scaleY,
      width: Math.max(1, b.width * target.scaleX),
      height: Math.max(1, b.height * target.scaleY),
    };
    if (obj.type === "path") {
      transformPathObjectRelative(obj as PathObject, origin, target);
    }
    obj.x = world.x;
    obj.y = world.y;
    obj.width = world.width;
    obj.height = world.height;
    const uniform = Math.min(target.scaleX, target.scaleY);
    if (
      obj.type === "groupContainer" ||
      obj.type === "booleanGroup" ||
      obj.type === "clippingContainer"
    ) {
      scaleSubtreeLocal(obj, uniform);
    } else if (obj.type === "text" || obj.type === "textOnPath") {
      scaleTextTypographyFields(obj, uniform);
      reflowAreaTextHeightsInTree(obj);
    } else {
      scaleStyleFields(obj, uniform);
    }
  }
  void set;
}

function transformDisplayLayers(
  byId: Map<string, FreehandObject>,
  layerIds: string[],
  index: SiteCreatorSelectionIndex,
  origin: PageRect,
  target: { x: number; y: number; scaleX: number; scaleY: number },
): void {
  const set = new Set(layerIds);
  const roots = displayRoots(layerIds, index);
  for (const id of roots) {
    const obj = byId.get(id);
    if (!obj) continue;
    const b = { x: obj.x, y: obj.y, width: obj.width, height: obj.height };
    const world: PageRect = {
      x: target.x + (b.x - origin.x) * target.scaleX,
      y: target.y + (b.y - origin.y) * target.scaleY,
      width: Math.max(1, b.width * target.scaleX),
      height: Math.max(1, b.height * target.scaleY),
    };
    if (obj.type === "path") {
      transformPathObjectRelative(obj as PathObject, origin, target);
    }
    obj.x = world.x;
    obj.y = world.y;
    obj.width = world.width;
    obj.height = world.height;
    const uniform = Math.min(target.scaleX, target.scaleY);
    if (
      obj.type === "groupContainer" ||
      obj.type === "booleanGroup" ||
      obj.type === "clippingContainer"
    ) {
      scaleSubtreeLocal(obj, uniform);
    } else if (obj.type === "text" || obj.type === "textOnPath") {
      scaleTextTypographyFields(obj, uniform);
      reflowAreaTextHeightsInTree(obj);
    } else {
      scaleStyleFields(obj, uniform);
    }
  }
  void set;
}

function hideLayers(
  byId: Map<string, FreehandObject>,
  layerIds: string[],
  park: PageRect,
  mode: HiddenItemsRenderMode,
): void {
  for (const id of layerIds) {
    const obj = byId.get(id);
    if (!obj) continue;
    applyHiddenObjectAppearance(obj, mode);
    if (mode === "omit") {
      obj.x = park.x;
      obj.y = park.y;
    }
  }
}

function containingRegion(
  bounds: PageRect,
  regions: ResolvedRegionBox[],
): ResolvedRegionBox | null {
  let best: ResolvedRegionBox | null = null;
  let bestArea = 0;
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  for (const region of regions) {
    const r = region.layoutRect;
    const inside =
      cx >= r.x && cx <= r.x + r.width && cy >= r.y && cy <= r.y + r.height;
    if (!inside) continue;
    const area = r.width * r.height;
    if (area > bestArea) {
      best = region;
      bestArea = area;
    }
  }
  return best ?? regions[0] ?? null;
}

function minFontForEditableBand(band: ResponsiveEditableBand): number {
  if (band === "mobile") return 15;
  if (band === "tablet") return 14;
  return 12;
}

function applyOneItem(args: {
  byId: Map<string, FreehandObject>;
  blueprint: SiteBlueprintV1;
  index: SiteCreatorSelectionIndex;
  target: ResponsiveItemRef;
  band: ResponsiveEditableBand;
  regions: ResolvedRegionBox[];
  viewportWidth: number;
  hiddenItems: HiddenItemsRenderMode;
}): void {
  const tune = resolveItemTune(args.blueprint, args.target, args.band);
  if (!tune) return;
  const layerIds = coverageLayerIdsForItem(args.blueprint, args.target, args.index);
  if (layerIds.length === 0) return;

  if (tune.hidden) {
    const park = args.regions[0]?.clipRect ?? { x: 0, y: 0, width: 1, height: 1 };
    hideLayers(args.byId, layerIds, park, args.hiddenItems);
    return;
  }

  const origin = currentBounds(args.byId, layerIds, args.index);
  if (!origin) return;
  const region = containingRegion(origin, args.regions);
  const layout = region?.layoutRect ?? {
    x: 0,
    y: origin.y,
    width: args.viewportWidth,
    height: origin.height,
  };
  const sectionTarget =
    region != null
      ? ({ kind: "blueprintNode" as const, nodeId: region.sectionId })
      : null;
  const containerTune = sectionTarget
    ? resolveContainerTune(args.blueprint, sectionTarget, args.band)
    : null;
  const padding = containerTune?.padding ?? (layout.width >= 700 ? 28 : 20);
  const contentLeft = layout.x + padding;
  const contentWidth = Math.max(
    80,
    Math.min(layout.width - padding * 2, containerTune?.maxContentWidth ?? layout.width - padding * 2),
  );

  let box: PageRect = { ...origin };
  let scaleX = 1;
  let scaleY = 1;

  const itemNode =
    args.target.kind === "blueprintNode" ? args.blueprint.nodes[args.target.nodeId] : null;
  const textObj =
    layerIds.length === 1 ? args.byId.get(layerIds[0]!) ?? null : null;
  const treatAsText =
    isTextObject(textObj) &&
    !(itemNode && isSiteButtonNode(itemNode)) &&
    !(textObj && layerOwnedByButton(args.blueprint, textObj.id));
  const treatAsAreaText = treatAsText && isAreaTextObject(textObj);

  if (tune.widthMode === "full") {
    scaleX = layout.width / Math.max(1, origin.width);
    box = { ...box, x: layout.x, width: layout.width };
  } else if (tune.widthMode === "container") {
    scaleX = contentWidth / Math.max(1, origin.width);
    box = { ...box, x: contentLeft, width: contentWidth };
  }

  const fontScale = treatAsText ? normalizeItemFontScale(tune.fontScale ?? 1) : 1;
  const boxW = treatAsAreaText ? normalizeItemBoxFactor(tune.boxW ?? 1) : 1;
  const boxH = treatAsAreaText && tune.boxH != null ? normalizeItemBoxFactor(tune.boxH) : null;

  if (treatAsText) {
    const widthChanged = treatAsAreaText && !tune.widthMode && Math.abs(boxW - 1) > 0.001;
    const fontChanged = Math.abs(fontScale - 1) > 0.001;
    const shouldResizeTextBox =
      treatAsAreaText && (widthChanged || fontChanged || boxH != null);
    if (widthChanged) {
      scaleX = boxW;
      box = { ...box, width: Math.max(8, origin.width * boxW) };
    }
    if (textObj) {
      if (fontChanged) {
        scaleTextTypographyFields(
          textObj,
          fontScale,
          minFontForEditableBand(args.band),
        );
      }
      if (shouldResizeTextBox) {
        const hug = hugAreaTextHeight(textObj, box.width);
        const explicitH = boxH != null ? origin.height * boxH : 0;
        const nextH = Math.max(hug, explicitH);
        scaleY = nextH / Math.max(1, origin.height);
        box = { ...box, height: nextH };
      }
    }
  } else {
    const relativeScale =
      typeof tune.scale === "number" && Number.isFinite(tune.scale) && tune.scale > 0
        ? tune.scale
        : 1;
    const useRelativeScale = Math.abs(relativeScale - 1) > 0.001;
    if (useRelativeScale) {
      scaleX *= relativeScale;
      scaleY *= relativeScale;
      box = {
        ...box,
        width: Math.max(1, origin.width * scaleX),
        height: Math.max(1, origin.height * scaleY),
      };
    } else {
      if (tune.size?.width != null) {
        scaleX = tune.size.width / Math.max(1, origin.width);
        box = { ...box, width: tune.size.width };
      }
      if (tune.size?.height != null) {
        scaleY = tune.size.height / Math.max(1, origin.height);
        box = { ...box, height: tune.size.height };
      }
    }
  }

  if (tune.alignX) {
    box = {
      ...box,
      x: contentBoxX({
        align: tune.alignX,
        contentLeft,
        contentWidth,
        boxWidth: box.width,
      }),
    };
  }

  if (tune.alignY) {
    const contentTop = layout.y + padding;
    const contentHeight = Math.max(1, layout.height - padding * 2);
    box = {
      ...box,
      y: contentBoxY({
        align: tune.alignY,
        contentTop,
        contentHeight,
        boxHeight: box.height,
      }),
    };
  }

  const useRelativeShift = tune.shiftX != null || tune.shiftY != null;
  if (useRelativeShift) {
    // Misma base que el arrastre: tamaño visual actual (post escala / widthMode / box),
    // no el origin pre-corrección. Así la caja fantasma y el soltar coinciden.
    const shiftBasisW = Math.max(1, box.width);
    const shiftBasisH = Math.max(1, box.height);
    box = {
      ...box,
      x: box.x + (tune.shiftX ?? 0) * shiftBasisW,
      y: box.y + (tune.shiftY ?? 0) * shiftBasisH,
    };
  } else if (tune.offset) {
    box = { ...box, x: box.x + tune.offset.x, y: box.y + tune.offset.y };
  }

  const node =
    args.target.kind === "blueprintNode" ? args.blueprint.nodes[args.target.nodeId] : null;
  if (node && isSiteButtonNode(node) && Math.abs(scaleX - 1) > 0.001) {
    scaleY = scaleX;
    box = { ...box, height: origin.height * scaleX };
  }

  box = {
    ...box,
    width: Math.min(box.width, args.viewportWidth),
    x: Math.max(0, Math.min(box.x, args.viewportWidth - Math.min(box.width, args.viewportWidth))),
  };

  if (
    Math.abs(box.x - origin.x) < 0.01 &&
    Math.abs(box.y - origin.y) < 0.01 &&
    Math.abs(scaleX - 1) < 0.001 &&
    Math.abs(scaleY - 1) < 0.001 &&
    Math.abs(fontScale - 1) < 0.001
  ) {
    return;
  }

  transformDisplayLayers(args.byId, layerIds, args.index, origin, {
    x: box.x,
    y: box.y,
    scaleX,
    scaleY,
  });
}

export function applyResponsiveMediaTunes(args: {
  byId: Map<string, FreehandObject>;
  blueprint: SiteBlueprintV1;
  index: SiteCreatorSelectionIndex;
  band: ResponsiveEditableBand;
  backgroundLayerIds: Set<string>;
}): void {
  for (const rule of args.blueprint.responsive?.media ?? []) {
    if (args.backgroundLayerIds.has(rule.layerId)) continue;
    const tune = resolveMediaTune(args.blueprint, rule.layerId, args.band);
    if (!tune) continue;
    const obj = args.byId.get(rule.layerId);
    const entry = args.index.byId[rule.layerId];
    if (!obj || !entry || obj.type !== "image") continue;
    const sourceRect = entry.visualBounds;
    const targetRect: PageRect = { x: obj.x, y: obj.y, width: obj.width, height: obj.height };
    const fit = tune.fit ?? "cover";
    const placed =
      fit === "contain"
        ? resolveBackgroundContainTransform({
            sourceRect,
            targetRect,
            focalPoint: tune.focal,
          })
        : fit === "preserve"
          ? resolveBackgroundPreserveTransform({
              sourceRect,
              sourceRegion: sourceRect,
              targetRect,
            })
          : resolveBackgroundCoverTransform({
              sourceRect,
              targetRect,
              focalPoint: tune.focal,
            });
    obj.x = placed.x;
    obj.y = placed.y;
    obj.width = placed.width;
    obj.height = placed.height;
  }
}

export function applyResponsiveItemTunes(args: {
  byId: Map<string, FreehandObject>;
  blueprint: SiteBlueprintV1;
  index: SiteCreatorSelectionIndex;
  band: ResponsiveEditableBand;
  regions: ResolvedRegionBox[];
  viewportWidth: number;
  hiddenItems?: HiddenItemsRenderMode;
}): void {
  const items = args.blueprint.responsive?.items ?? [];
  const hiddenItems = args.hiddenItems ?? "omit";
  for (const rule of items) {
    if (!rule.byBand[args.band]) continue;
    applyOneItem({
      byId: args.byId,
      blueprint: args.blueprint,
      index: args.index,
      target: rule.target,
      band: args.band,
      regions: args.regions,
      viewportWidth: args.viewportWidth,
      hiddenItems,
    });
  }
}

function defaultBandInset(band: ResponsiveEditableBand): number {
  if (band === "mobile") return 20;
  if (band === "tablet") return 28;
  return 0;
}

function defaultBandGap(band: ResponsiveEditableBand): number {
  return band === "mobile" ? 16 : 20;
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

function layoutGroupsInSection(blueprint: SiteBlueprintV1, sectionId: string): string[] {
  const ids: string[] = [];
  const visit = (id: string) => {
    const node = blueprint.nodes[id];
    if (!node) return;
    if (node.kind === "layoutGroup") ids.push(id);
    for (const childId of node.childIds) visit(childId);
  };
  if (blueprint.nodes[sectionId]) {
    visit(sectionId);
  } else {
    for (const node of Object.values(blueprint.nodes)) {
      if (node.kind === "layoutGroup") ids.push(node.id);
    }
  }
  return ids.sort((a, b) => layoutGroupDepth(blueprint, b) - layoutGroupDepth(blueprint, a));
}

function displayChildUnitsForGroup(args: {
  blueprint: SiteBlueprintV1;
  groupId: string;
  byId: Map<string, FreehandObject>;
  index: SiteCreatorSelectionIndex;
  band: ResponsiveEditableBand;
}): Array<{ layerIds: string[]; display: PageRect; source: PageRect }> {
  const group = args.blueprint.nodes[args.groupId];
  if (!group || group.kind !== "layoutGroup") return [];
  const allContentLayerIds = [
    ...group.layerIds,
    ...group.childIds.flatMap((childId) => collectSemanticCoverageLayerIds(args.blueprint, childId)),
  ];
  const backgroundIds = backgroundIdsForContentLayers({
    blueprint: args.blueprint,
    contentLayerIds: allContentLayerIds,
    index: args.index,
  });
  const units: Array<{ layerIds: string[]; display: PageRect; source: PageRect }> = [];
  const used = new Set<string>();
  for (const childId of group.childIds) {
    const layerIds = collectSemanticCoverageLayerIds(args.blueprint, childId).filter(
      (id) => !isLayerExcludedFromFlow({ blueprint: args.blueprint, layerId: id, band: args.band, nodeId: childId }),
    );
    if (layerIds.length === 0 || isBackgroundUnit(layerIds, backgroundIds)) continue;
    layerIds.forEach((id) => used.add(id));
    const display = currentBounds(args.byId, layerIds, args.index);
    const source = sourceBoundsOfIds(layerIds, args.index);
    if (!display || !source) continue;
    units.push({ layerIds, display, source });
  }
  for (const layerId of group.layerIds) {
    if (used.has(layerId) || backgroundIds.has(layerId)) continue;
    if (isLayerExcludedFromFlow({ blueprint: args.blueprint, layerId, band: args.band })) continue;
    const display = currentBounds(args.byId, [layerId], args.index);
    const source = sourceBoundsOfIds([layerId], args.index);
    if (!display || !source) continue;
    used.add(layerId);
    units.push({ layerIds: [layerId], display, source });
  }
  units.sort((a, b) => a.display.y - b.display.y || a.display.x - b.display.x);
  return units;
}

function expandRegionToBottom(
  region: ResolvedRegionBox & { backgroundLayerIds?: string[] },
  bottom: number,
  byId: Map<string, FreehandObject>,
): void {
  const needed = bottom - region.layoutRect.y;
  if (needed <= region.layoutRect.height + 0.5) return;
  region.layoutRect = { ...region.layoutRect, height: needed };
  region.clipRect = { ...region.clipRect, height: needed };
  for (const id of region.backgroundLayerIds ?? []) {
    const obj = byId.get(id);
    if (!obj) continue;
    obj.y = region.layoutRect.y;
    obj.height = region.layoutRect.height;
  }
}

function reflowGroupUnits(args: {
  byId: Map<string, FreehandObject>;
  index: SiteCreatorSelectionIndex;
  band: ResponsiveEditableBand;
  units: Array<{ layerIds: string[]; display: PageRect; source: PageRect }>;
  tune: NonNullable<ReturnType<typeof resolveContainerTune>>;
  region: ResolvedRegionBox;
  viewportWidth: number;
  stacked: boolean;
}): number {
  const { units, tune, region, band } = args;
  if (units.length === 0) return region.layoutRect.y + region.layoutRect.height;

  const parentPad = defaultBandInset(band);
  const widthMode = tune.contentWidthMode === "content" ? "content" : "container";
  const paddedAvail = Math.max(80, region.layoutRect.width - parentPad * 2);
  let availWidth = paddedAvail;
  if (typeof tune.maxContentWidth === "number") {
    availWidth = Math.min(availWidth, tune.maxContentWidth);
  }
  if (widthMode === "content") {
    availWidth = Math.min(availWidth, Math.max(80, ...units.map((u) => u.source.width)));
  }
  const availLeft = contentBoxX({
    align: tune.contentAlignX ?? "center",
    contentLeft: region.layoutRect.x + parentPad,
    contentWidth: paddedAvail,
    boxWidth: Math.min(availWidth, paddedAvail),
  });
  const pad = typeof tune.padding === "number" ? tune.padding : 0;
  const innerLeft = availLeft + pad;
  const innerWidth = Math.max(1, availWidth - pad * 2);
  const innerTop = Math.min(...units.map((u) => u.display.y));
  const gap = typeof tune.gap === "number" ? tune.gap : defaultBandGap(band);
  const shouldStack = args.stacked || typeof tune.gap === "number";
  const stackOrigin = unionPageRects(units.map((u) => u.source));
  const layoutScale = stackLayoutScale(stackOrigin, innerWidth);
  const stackGaps = preservedStackGaps(
    units.map((u) => ({ bounds: u.source })),
    layoutScale,
    gap,
  );

  let contentBottom = innerTop + pad;
  if (shouldStack) {
    let y = innerTop + pad;
    for (let i = 0; i < units.length; i++) {
      const unit = units[i]!;
      const scale = layoutScale;
      const w = unit.source.width * scale;
      const h = unit.source.height * scale;
      const x = tune.contentAlignX
        ? contentBoxX({
            align: tune.contentAlignX,
            contentLeft: innerLeft,
            contentWidth: innerWidth,
            boxWidth: w,
          })
        : stackColumnX(unit.source, stackOrigin, layoutScale, innerLeft, innerWidth, w);
      placeLayersFromSource(args.byId, unit.layerIds, args.index, unit.source, {
        x,
        y,
        scaleX: scale,
        scaleY: scale,
      });
      y += h;
      if (i < units.length - 1) y += stackGaps[i] ?? gap;
    }
    contentBottom = y + pad;
  } else {
    const origin = unionPageRects(units.map((u) => u.source));
    if (!origin) return region.layoutRect.y + region.layoutRect.height;
    const scale = Math.min(1, innerWidth / Math.max(1, origin.width));
    const y0 = innerTop + pad;
    if (tune.contentAlignX) {
      for (const unit of units) {
        const childScale = Math.min(1, innerWidth / Math.max(1, unit.source.width));
        const w = unit.source.width * childScale;
        const x = contentBoxX({
          align: tune.contentAlignX,
          contentLeft: innerLeft,
          contentWidth: innerWidth,
          boxWidth: w,
        });
        const y = y0 + (unit.source.y - origin.y) * scale;
        placeLayersFromSource(args.byId, unit.layerIds, args.index, unit.source, {
          x,
          y,
          scaleX: childScale,
          scaleY: childScale,
        });
      }
    } else {
      const w = origin.width * scale;
      const x = innerLeft + (innerWidth - w) / 2;
      placeLayersFromSource(
        args.byId,
        units.flatMap((u) => u.layerIds),
        args.index,
        origin,
        { x, y: y0, scaleX: scale, scaleY: scale },
      );
    }
    contentBottom = y0 + origin.height * scale + pad;
  }

  const minH = typeof tune.minHeight === "number" ? tune.minHeight : 0;
  const boxTop = innerTop;
  const contentH = contentBottom - boxTop;
  const boxH = Math.max(contentH, minH);
  if (boxH > contentH + 0.5 && tune.contentAlignY) {
    const nextTop = contentBoxY({
      align: tune.contentAlignY,
      contentTop: boxTop,
      contentHeight: boxH,
      boxHeight: contentH,
    });
    const dy = nextTop - boxTop;
    if (Math.abs(dy) > 0.5) {
      for (const unit of units) {
        const now = currentBounds(args.byId, unit.layerIds, args.index);
        if (!now) continue;
        transformDisplayLayers(args.byId, unit.layerIds, args.index, now, {
          x: now.x,
          y: now.y + dy,
          scaleX: 1,
          scaleY: 1,
        });
      }
    }
  }
  return boxTop + boxH;
}

/**
 * Aplica padding, gap, alineación y límites de Hero/Sección/Grupo en la vista actual.
 * Las secciones ya entran por el layout; aquí se reflowan grupos (y se agranda la región si hace falta).
 */
export function applyResponsiveContainerTunes(args: {
  byId: Map<string, FreehandObject>;
  blueprint: SiteBlueprintV1;
  index: SiteCreatorSelectionIndex;
  band: ResponsiveEditableBand;
  regions: Array<ResolvedRegionBox & { backgroundLayerIds?: string[] }>;
  viewportWidth: number;
}): void {
  for (const region of args.regions) {
    const groups = layoutGroupsInSection(args.blueprint, region.sectionId);
    for (const groupId of groups) {
      const tune = resolveContainerTune(args.blueprint, { kind: "blueprintNode", nodeId: groupId }, args.band);
      if (!tune) continue;
      if (tune.contentWidthMode === "full" || tune.contentWidthMode === "scale") continue;
      const units = displayChildUnitsForGroup({
        blueprint: args.blueprint,
        groupId,
        byId: args.byId,
        index: args.index,
        band: args.band,
      });
      const stacked =
        resolveEffectiveResponsiveMode({
          blueprint: args.blueprint,
          target: { kind: "blueprintNode", nodeId: groupId },
          band: args.band,
          index: args.index,
        }).mode === "stack";
      const bottom = reflowGroupUnits({
        byId: args.byId,
        index: args.index,
        band: args.band,
        units,
        tune,
        region,
        viewportWidth: args.viewportWidth,
        stacked,
      });
      expandRegionToBottom(region, bottom, args.byId);
    }

    for (const rule of args.blueprint.responsive?.containerTunes ?? []) {
      if (rule.target.kind !== "designerGroup") continue;
      const tune = rule.byBand[args.band];
      if (!tune) continue;
      if (tune.contentWidthMode === "full" || tune.contentWidthMode === "scale") continue;
      const groupLayerId = rule.target.layerId;
      const root = args.byId.get(groupLayerId);
      if (!root) continue;
      const backgroundIds = backgroundLayerIdsForDesignerGroup({
        blueprint: args.blueprint,
        groupLayerId,
        index: args.index,
      });
      const childIds = args.index.entries
        .filter((e) => e.parentLayerId === groupLayerId)
        .map((e) => e.layerId)
        .filter(
          (id) =>
            !backgroundIds.has(id) &&
            !isLayerExcludedFromFlow({ blueprint: args.blueprint, layerId: id, band: args.band }),
        );
      const units = (childIds.length ? childIds : [])
        .map((layerId) => {
          const display = currentBounds(args.byId, [layerId], args.index);
          const source = sourceBoundsOfIds([layerId], args.index);
          return display && source ? { layerIds: [layerId], display, source } : null;
        })
        .filter((u): u is { layerIds: string[]; display: PageRect; source: PageRect } => Boolean(u));
      const stacked =
        resolveEffectiveResponsiveMode({
          blueprint: args.blueprint,
          target: rule.target,
          band: args.band,
          index: args.index,
        }).mode === "stack";
      const bottom = reflowGroupUnits({
        byId: args.byId,
        index: args.index,
        band: args.band,
        units,
        tune,
        region,
        viewportWidth: args.viewportWidth,
        stacked,
      });
      expandRegionToBottom(region, bottom, args.byId);
    }
  }
}

type ResponsiveVisualClusterLike = {
  kind: string;
  allLayerIds: string[];
  unit?: { nodeId?: string };
};

export function sortClustersByItemOrder<T extends { cluster: ResponsiveVisualClusterLike }>(
  items: T[],
  blueprint: SiteBlueprintV1,
  band: ResponsiveEditableBand,
  refOf: (item: T) => ResponsiveItemRef | null,
): T[] {
  return [...items]
    .map((item, index) => {
      const ref = refOf(item);
      const order = ref ? resolveItemTune(blueprint, ref, band)?.order : undefined;
      const nodeId = item.cluster.unit?.nodeId;
      const hidden =
        (ref ? resolveItemTune(blueprint, ref, band)?.hidden === true : false) ||
        (item.cluster.kind === "solo"
          ? item.cluster.allLayerIds.some((layerId) =>
              isLayerExcludedFromFlow({ blueprint, layerId, band, nodeId }),
            )
          : item.cluster.allLayerIds.length > 0 &&
            item.cluster.allLayerIds.every((layerId) =>
              isLayerExcludedFromFlow({ blueprint, layerId, band, nodeId }),
            ));
      return { item, index, order: order ?? index, hidden };
    })
    .filter((row) => !row.hidden)
    .sort((a, b) => a.order - b.order || a.index - b.index)
    .map((row) => row.item);
}

export { sameItemRef };
