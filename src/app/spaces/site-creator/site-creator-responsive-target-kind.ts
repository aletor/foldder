/**
 * 6B hotfix — clasificación conservadora de targets responsive.
 */
import type { SiteCreatorSelectionIndex } from "./site-creator-selection-types";
import type { SiteBlueprintV1 } from "./site-creator-types";
import { isSiteSectionNode } from "./site-creator-types";
import { collectSemanticCoverageLayerIds } from "./site-blueprint-ownership";
import type { PageRect } from "./site-creator-coordinate-space";
import { intersectionArea } from "./site-creator-microbar-placement";

export type ResponsiveTargetKind =
  | "page-unstructured"
  | "composition-group"
  | "layout-group"
  | "semantic-region";

function rectsOverlap(a: PageRect, b: PageRect): boolean {
  return intersectionArea(a, b) > 0;
}

function unitsOverlap(
  units: Array<{ bounds: PageRect }>,
): boolean {
  for (let i = 0; i < units.length; i += 1) {
    for (let j = i + 1; j < units.length; j += 1) {
      if (rectsOverlap(units[i]!.bounds, units[j]!.bounds)) return true;
    }
  }
  return false;
}

function isClearRowOrColumn(units: Array<{ bounds: PageRect }>): boolean {
  if (units.length < 2) return false;
  const ys = units.map((u) => u.bounds.y + u.bounds.height / 2);
  const xs = units.map((u) => u.bounds.x + u.bounds.width / 2);
  const ySpread = Math.max(...ys) - Math.min(...ys);
  const xSpread = Math.max(...xs) - Math.min(...xs);
  const avgH = units.reduce((s, u) => s + u.bounds.height, 0) / units.length;
  const avgW = units.reduce((s, u) => s + u.bounds.width, 0) / units.length;
  if (ySpread <= avgH * 0.35 && xSpread > avgW * 0.5) return true;
  if (xSpread <= avgW * 0.35 && ySpread > avgH * 0.5) return true;
  return false;
}

export function directLayoutGroupUnits(args: {
  blueprint: SiteBlueprintV1;
  groupId: string;
  index: SiteCreatorSelectionIndex;
}): Array<{ layerIds: string[]; bounds: PageRect }> {
  const group = args.blueprint.nodes[args.groupId];
  if (!group || group.kind !== "layoutGroup") return [];
  const units: Array<{ layerIds: string[]; bounds: PageRect }> = [];
  const used = new Set<string>();

  for (const childId of group.childIds) {
    const layerIds = collectSemanticCoverageLayerIds(args.blueprint, childId);
    const bounds = layerBounds(layerIds, args.index);
    if (!bounds || layerIds.length === 0) continue;
    layerIds.forEach((id) => used.add(id));
    units.push({ layerIds, bounds });
  }
  for (const layerId of group.layerIds) {
    if (used.has(layerId)) continue;
    const entry = args.index.byId[layerId];
    if (!entry?.visible) continue;
    units.push({ layerIds: [layerId], bounds: entry.visualBounds });
  }
  return units;
}

function layerBounds(layerIds: string[], index: SiteCreatorSelectionIndex): PageRect | null {
  const rects = layerIds
    .map((id) => index.byId[id]?.visualBounds)
    .filter((r): r is PageRect => Boolean(r));
  if (rects.length === 0) return null;
  const x1 = Math.min(...rects.map((r) => r.x));
  const y1 = Math.min(...rects.map((r) => r.y));
  const x2 = Math.max(...rects.map((r) => r.x + r.width));
  const y2 = Math.max(...rects.map((r) => r.y + r.height));
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export function classifyLayoutGroupKind(args: {
  blueprint: SiteBlueprintV1;
  groupId: string;
  index: SiteCreatorSelectionIndex;
}): "composition-group" | "layout-group" {
  const units = directLayoutGroupUnits(args);
  if (units.length < 2) return "composition-group";
  if (unitsOverlap(units)) return "composition-group";
  if (isClearRowOrColumn(units)) return "layout-group";
  return "composition-group";
}

export function hasSemanticRegions(blueprint: SiteBlueprintV1): boolean {
  return blueprint.rootChildIds.some((id) => {
    const node = blueprint.nodes[id];
    return node && isSiteSectionNode(node);
  });
}

export function classifyPageResponsiveKind(blueprint: SiteBlueprintV1): ResponsiveTargetKind {
  if (!hasSemanticRegions(blueprint)) return "page-unstructured";
  return "semantic-region";
}
