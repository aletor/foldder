/**
 * Candado de lienzo: se puede elegir en el árbol, no con clic en el preview.
 */
import { findLayerSemanticOwner } from "./site-blueprint-ownership";
import { cloneBlueprint } from "./site-blueprint-validate";
import type { SiteCreatorSelectionIndex } from "./site-creator-selection-types";
import type { SiteBlueprintV1 } from "./site-creator-types";
import type { SiteCreatorSelectionUnit } from "./site-creator-display-labels";

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

export function lockedLayerIds(blueprint: SiteBlueprintV1): string[] {
  return blueprint.canvasLocks?.layerIds ?? [];
}

export function lockedNodeIds(blueprint: SiteBlueprintV1): string[] {
  return blueprint.canvasLocks?.nodeIds ?? [];
}

export function isUnitOwnCanvasLocked(
  blueprint: SiteBlueprintV1,
  unit: SiteCreatorSelectionUnit,
): boolean {
  if (unit.kind === "layer") return lockedLayerIds(blueprint).includes(unit.layerId);
  return lockedNodeIds(blueprint).includes(unit.nodeId);
}

/** La capa (o un ancestro / nodo semántico) está bloqueada para el lienzo. */
export function isLayerCanvasLocked(
  blueprint: SiteBlueprintV1,
  layerId: string,
  index: SiteCreatorSelectionIndex,
): boolean {
  const layers = new Set(lockedLayerIds(blueprint));
  const nodes = new Set(lockedNodeIds(blueprint));
  if (layers.size === 0 && nodes.size === 0) return false;
  if (layers.has(layerId)) return true;
  const entry = index.byId[layerId];
  if (entry?.ancestorIds.some((id) => layers.has(id))) return true;
  let owner = findLayerSemanticOwner(blueprint, layerId, index);
  while (owner) {
    if (nodes.has(owner.id)) return true;
    owner = owner.parentId ? blueprint.nodes[owner.parentId] : undefined;
  }
  return false;
}

export function isUnitCanvasLocked(
  blueprint: SiteBlueprintV1,
  unit: SiteCreatorSelectionUnit,
  index: SiteCreatorSelectionIndex,
): boolean {
  if (isUnitOwnCanvasLocked(blueprint, unit)) return true;
  if (unit.kind === "layer") return isLayerCanvasLocked(blueprint, unit.layerId, index);
  const node = blueprint.nodes[unit.nodeId];
  if (!node) return false;
  const nodes = new Set(lockedNodeIds(blueprint));
  let parentId = node.parentId;
  while (parentId) {
    if (nodes.has(parentId)) return true;
    parentId = blueprint.nodes[parentId]?.parentId ?? null;
  }
  return false;
}

export function setUnitCanvasLock(
  blueprint: SiteBlueprintV1,
  unit: SiteCreatorSelectionUnit,
  locked: boolean,
): SiteBlueprintV1 {
  const next = cloneBlueprint(blueprint);
  const layerIds = new Set(lockedLayerIds(next));
  const nodeIds = new Set(lockedNodeIds(next));
  if (unit.kind === "layer") {
    if (locked) layerIds.add(unit.layerId);
    else layerIds.delete(unit.layerId);
  } else if (locked) {
    nodeIds.add(unit.nodeId);
  } else {
    nodeIds.delete(unit.nodeId);
  }
  if (layerIds.size === 0 && nodeIds.size === 0) {
    delete next.canvasLocks;
    return next;
  }
  next.canvasLocks = {
    ...(layerIds.size > 0 ? { layerIds: uniqueIds([...layerIds]) } : {}),
    ...(nodeIds.size > 0 ? { nodeIds: uniqueIds([...nodeIds]) } : {}),
  };
  return next;
}
