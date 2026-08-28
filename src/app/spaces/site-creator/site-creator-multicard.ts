/**
 * MultiCard: defaults responsive y helpers de árbol.
 * El parseo vive en site-creator-types (carga del nodo). No toca Designer.
 */
import { collectSemanticCoverageLayerIds, findLayerSemanticOwner } from "./site-blueprint-ownership";
import { createSiteMultiCardCardId } from "./site-blueprint-ids";
import { setResponsiveOverride } from "./site-creator-responsive-overrides";
import { patchContainerTune } from "./site-creator-responsive-tunes";
import { moldLayerIdFromDisplay, parseMultiCardInstanceId } from "./site-creator-multicard-ids";
import type { SiteCreatorSelectionIndex } from "./site-creator-selection-types";
import type {
  ResponsiveEditableBand,
  ResponsiveTargetRef,
  SiteBlueprintV1,
  SiteMultiCardInstanceV1,
} from "./site-creator-types";
import {
  MULTICARD_COUNT_MAX,
  MULTICARD_COUNT_MIN,
  MULTICARD_DEFAULT_COUNT,
  isSiteMultiCardNode,
  isSiteSectionNode,
} from "./site-creator-types";

const DEFAULT_BANDS: ResponsiveEditableBand[] = ["monitor", "tablet", "mobile"];

export function createDefaultMultiCardCards(count = MULTICARD_DEFAULT_COUNT): SiteMultiCardInstanceV1[] {
  const n = Math.min(MULTICARD_COUNT_MAX, Math.max(MULTICARD_COUNT_MIN, Math.round(count)));
  return Array.from({ length: n }, () => ({
    id: createSiteMultiCardCardId(),
    overrides: {},
  }));
}

export function applyNewMultiCardResponsiveDefaults(
  blueprint: SiteBlueprintV1,
  nodeId: string,
): SiteBlueprintV1 {
  const target: ResponsiveTargetRef = { kind: "blueprintNode", nodeId };
  let next = blueprint;
  for (const band of DEFAULT_BANDS) {
    ({ blueprint: next } = setResponsiveOverride({
      blueprint: next,
      target,
      band,
      mode: "preserve",
    }));
    ({ blueprint: next } = patchContainerTune({
      blueprint: next,
      target,
      band,
      patch: { padding: 0, gap: 0, minHeight: 0 },
    }));
  }
  return next;
}

export function nodeIsInsideMultiCard(blueprint: SiteBlueprintV1, nodeId: string): boolean {
  let walk: string | null = blueprint.nodes[nodeId]?.parentId ?? null;
  while (walk) {
    const node = blueprint.nodes[walk];
    if (!node) return false;
    if (isSiteMultiCardNode(node)) return true;
    walk = node.parentId;
  }
  return false;
}

export function layerIsInsideMultiCard(
  blueprint: SiteBlueprintV1,
  layerId: string,
  index: SiteCreatorSelectionIndex,
): boolean {
  for (const node of Object.values(blueprint.nodes)) {
    if (!isSiteMultiCardNode(node)) continue;
    const coverage = collectSemanticCoverageLayerIds(blueprint, node.id);
    if (coverage.includes(layerId)) return true;
    const entry = index.byId[layerId];
    if (entry?.ancestorIds.some((id) => coverage.includes(id))) return true;
  }
  return false;
}

export function findOwningMultiCardDisplay(
  blueprint: SiteBlueprintV1,
  layerId: string,
  index: SiteCreatorSelectionIndex,
): { nodeId: string; cardId: string; moldLayerId: string } | null {
  const instance = parseMultiCardInstanceId(layerId);
  if (instance && isSiteMultiCardNode(blueprint.nodes[instance.nodeId]!)) {
    return instance;
  }
  const entry = index.byId[layerId];
  const candidates = [layerId, ...(entry?.ancestorIds ?? [])];
  for (const candidate of candidates) {
    let owner = findLayerSemanticOwner(blueprint, candidate, index);
    while (owner) {
      if (isSiteMultiCardNode(owner)) {
        const cardId = owner.cards[0]?.id;
        if (!cardId) return null;
        return { nodeId: owner.id, cardId, moldLayerId: moldLayerIdFromDisplay(layerId) };
      }
      owner = owner.parentId ? blueprint.nodes[owner.parentId] ?? null : null;
    }
  }
  return null;
}

export function collectOwningSectionIds(
  blueprint: SiteBlueprintV1,
  layerIds: string[],
  index: SiteCreatorSelectionIndex,
): string[] {
  const ids = new Set<string>();
  for (const layerId of layerIds) {
    const owner = findOwningSection(blueprint, layerId, index);
    if (owner) ids.add(owner);
  }
  return [...ids];
}

function findOwningSection(
  blueprint: SiteBlueprintV1,
  layerId: string,
  index: SiteCreatorSelectionIndex,
): string | null {
  for (const node of Object.values(blueprint.nodes)) {
    if (!node.layerIds.includes(layerId)) continue;
    let walk: string | null = node.id;
    while (walk) {
      const current = blueprint.nodes[walk];
      if (!current) break;
      if (isSiteSectionNode(current)) return current.id;
      walk = current.parentId;
    }
  }
  const entry = index.byId[layerId];
  if (!entry) return null;
  const mid = entry.visualBounds.y + entry.visualBounds.height / 2;
  for (const node of Object.values(blueprint.nodes)) {
    if (!isSiteSectionNode(node)) continue;
    if (mid >= node.sourceRange.top && mid < node.sourceRange.bottom) return node.id;
  }
  return null;
}
