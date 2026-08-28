import type { SiteCreatorSelectionIndex } from "./site-creator-selection-types";
import type { SiteBlueprintNode, SiteBlueprintV1 } from "./site-creator-types";

export interface BlueprintOwnershipIndex {
  /** layerId → nodo semántico que lo posee directamente. */
  ownerByLayerId: Record<string, string>;
  /** Capas cubiertas por un contenedor Designer asignado (ellos mismos o descendientes). */
  coveredByContainerOwner: Record<string, string>;
}

export function buildBlueprintOwnershipIndex(blueprint: SiteBlueprintV1): BlueprintOwnershipIndex {
  const ownerByLayerId: Record<string, string> = {};
  for (const node of Object.values(blueprint.nodes)) {
    for (const layerId of node.layerIds) {
      ownerByLayerId[layerId] = node.id;
    }
  }
  return { ownerByLayerId, coveredByContainerOwner: {} };
}

/** Incluye cobertura de descendientes Designer cuando un contenedor está asignado. */
export function buildBlueprintOwnershipIndexWithTree(
  blueprint: SiteBlueprintV1,
  selectionIndex: SiteCreatorSelectionIndex,
): BlueprintOwnershipIndex {
  const base = buildBlueprintOwnershipIndex(blueprint);
  const coveredByContainerOwner: Record<string, string> = {};
  for (const [layerId, ownerId] of Object.entries(base.ownerByLayerId)) {
    const entry = selectionIndex.byId[layerId];
    if (!entry?.containerKind) continue;
    for (const descendant of selectionIndex.entries) {
      if (descendant.layerId === layerId) continue;
      if (!descendant.ancestorIds.includes(layerId)) continue;
      coveredByContainerOwner[descendant.layerId] = ownerId;
    }
  }
  return { ...base, coveredByContainerOwner };
}

export function findLayerSemanticOwner(
  blueprint: SiteBlueprintV1,
  layerId: string,
  selectionIndex?: SiteCreatorSelectionIndex,
): SiteBlueprintNode | null {
  const index = selectionIndex
    ? buildBlueprintOwnershipIndexWithTree(blueprint, selectionIndex)
    : buildBlueprintOwnershipIndex(blueprint);
  const ownerId = index.ownerByLayerId[layerId] ?? index.coveredByContainerOwner[layerId];
  return ownerId ? blueprint.nodes[ownerId] ?? null : null;
}

export function collectOwnedLayerIds(node: SiteBlueprintNode): string[] {
  return [...node.layerIds];
}

/** Cobertura recursiva: layerIds propios + de todos los descendientes semánticos. */
export function collectSemanticCoverageLayerIds(
  blueprint: SiteBlueprintV1,
  nodeId: string,
): string[] {
  const node = blueprint.nodes[nodeId];
  if (!node) return [];
  const out = new Set<string>(node.layerIds);
  const seen = new Set<string>([nodeId]);
  const stack = [...node.childIds];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const child = blueprint.nodes[id];
    if (!child) continue;
    for (const layerId of child.layerIds) out.add(layerId);
    stack.push(...child.childIds);
  }
  return [...out];
}

export function validateBlueprintOwnership(
  blueprint: SiteBlueprintV1,
  selectionIndex?: SiteCreatorSelectionIndex,
): { ok: true } | { ok: false; message: string; duplicateLayerIds?: string[] } {
  const seen = new Map<string, string>();
  const duplicates: string[] = [];
  for (const node of Object.values(blueprint.nodes)) {
    for (const layerId of node.layerIds) {
      const prev = seen.get(layerId);
      if (prev && prev !== node.id) {
        duplicates.push(layerId);
      } else {
        seen.set(layerId, node.id);
      }
    }
  }
  if (duplicates.length > 0) {
    return {
      ok: false,
      message: "Una capa Designer no puede tener dos propietarios semánticos.",
      duplicateLayerIds: [...new Set(duplicates)].sort(),
    };
  }

  if (selectionIndex) {
    for (const node of Object.values(blueprint.nodes)) {
      for (const layerId of node.layerIds) {
        const entry = selectionIndex.byId[layerId];
        if (!entry) continue;
        for (const ancestorId of entry.ancestorIds) {
          const ancestorOwner = seen.get(ancestorId);
          if (ancestorOwner && ancestorOwner !== node.id) {
            return {
              ok: false,
              message:
                "Un ancestro y un descendiente Designer no pueden figurar como propietarios directos a la vez.",
            };
          }
          if (ancestorOwner === node.id && ancestorId !== layerId) {
            return {
              ok: false,
              message:
                "Un ancestro y un descendiente Designer no pueden figurar como propietarios directos a la vez.",
            };
          }
        }
      }
    }

    // Mismo nodo no debe poseer ancestro y descendiente simultáneamente.
    for (const node of Object.values(blueprint.nodes)) {
      const owned = new Set(node.layerIds);
      for (const layerId of node.layerIds) {
        const entry = selectionIndex.byId[layerId];
        if (!entry) continue;
        if (entry.ancestorIds.some((id) => owned.has(id))) {
          return {
            ok: false,
            message:
              "Un ancestro y un descendiente Designer no pueden figurar como propietarios directos a la vez.",
          };
        }
      }
    }
  }

  return { ok: true };
}

/**
 * Transfiere capas a un nodo destino: las quita de cualquier propietario previo
 * y las añade a destinationId. Inmutable.
 */
export function moveLayersToBlueprintNode(
  blueprint: SiteBlueprintV1,
  destinationId: string,
  layerIds: string[],
): SiteBlueprintV1 {
  const dest = blueprint.nodes[destinationId];
  if (!dest) return blueprint;
  const moving = new Set(layerIds);
  const nodes: Record<string, SiteBlueprintNode> = {};
  for (const [id, node] of Object.entries(blueprint.nodes)) {
    if (id === destinationId) continue;
    nodes[id] = {
      ...node,
      layerIds: node.layerIds.filter((layerId) => !moving.has(layerId)),
    } as SiteBlueprintNode;
  }
  const merged = [...dest.layerIds.filter((id) => !moving.has(id)), ...layerIds];
  nodes[destinationId] = { ...dest, layerIds: unique(merged) } as SiteBlueprintNode;
  return { ...blueprint, nodes };
}

export function unique(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Capas libres = no poseídas y no cubiertas por un contenedor asignado. */
export function countUnstructuredVisualLayers(
  blueprint: SiteBlueprintV1,
  selectionIndex: SiteCreatorSelectionIndex,
): number {
  const ownership = buildBlueprintOwnershipIndexWithTree(blueprint, selectionIndex);
  let count = 0;
  for (const entry of selectionIndex.entries) {
    if (ownership.ownerByLayerId[entry.layerId]) continue;
    if (ownership.coveredByContainerOwner[entry.layerId]) continue;
    count += 1;
  }
  return count;
}
