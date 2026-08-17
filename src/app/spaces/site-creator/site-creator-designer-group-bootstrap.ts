import { buildSiteSelectionIndex } from "./build-site-selection-index";
import {
  collectDesignerGroupIdClusters,
  designerGroupIdClusterLabel,
  designerGroupIdMirrorNodeId,
  isDesignerGroupIdMirrorNode,
  type DesignerGroupIdCluster,
} from "./site-creator-designer-group-id";
import {
  isDesignerContainerMirrorDismissed,
  isDesignerGroupIdMirrorDismissed,
  pruneDismissedDesignerMirrors,
} from "./site-creator-designer-group-dismiss";
import { looksTechnicalName } from "./site-creator-display-labels";
import {
  buildBlueprintOwnershipIndex,
  buildBlueprintOwnershipIndexWithTree,
  findLayerSemanticOwner,
} from "./site-blueprint-ownership";
import { assertValidBlueprint, cloneBlueprint } from "./site-blueprint-validate";
import type {
  SiteCreatorSelectionIndex,
  SiteCreatorSelectionIndexEntry,
} from "./site-creator-selection-types";
import type {
  SiteBlueprintLayoutGroupNode,
  SiteBlueprintNode,
  SiteBlueprintV1,
} from "./site-creator-types";
import { isSiteButtonNode, isSiteSectionNode } from "./site-creator-types";

export const DESIGNER_GROUP_MIRROR_ID_PREFIX = "scgrp_dg_";

export function designerGroupMirrorNodeId(containerLayerId: string): string {
  return `${DESIGNER_GROUP_MIRROR_ID_PREFIX}${containerLayerId}`;
}

export function mirrorContainerLayerIdFromNode(node: SiteBlueprintLayoutGroupNode): string | null {
  if (isDesignerGroupIdMirrorNode(node)) return null;
  if (node.layerIds.length === 1) return node.layerIds[0]!;
  if (
    node.id.startsWith(DESIGNER_GROUP_MIRROR_ID_PREFIX) &&
    !node.id.startsWith(`${DESIGNER_GROUP_MIRROR_ID_PREFIX}gid_`)
  ) {
    return node.id.slice(DESIGNER_GROUP_MIRROR_ID_PREFIX.length);
  }
  return null;
}

function isDesignerGroupMirrorCandidate(node: SiteBlueprintNode): boolean {
  if (node.kind !== "layoutGroup") return false;
  if (isDesignerGroupIdMirrorNode(node)) return false;
  return mirrorContainerLayerIdFromNode(node) != null;
}

export { isDesignerGroupIdMirrorNode };

/** layoutGroup que refleja un groupContainer del Designer (por layerIds o id estable). */
export function isDesignerGroupMirrorNode(
  node: SiteBlueprintNode,
  index: SiteCreatorSelectionIndex,
): boolean {
  if (!isDesignerGroupMirrorCandidate(node)) return false;
  const containerId = mirrorContainerLayerIdFromNode(node as SiteBlueprintLayoutGroupNode);
  if (!containerId) return false;
  const entry = index.byId[containerId];
  if (entry?.type === "groupContainer") return true;
  return node.id.startsWith(DESIGNER_GROUP_MIRROR_ID_PREFIX);
}

function compareZOrderPath(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    if (a[i] !== b[i]) return a[i]! - b[i]!;
  }
  return a.length - b.length;
}

function groupContainerLabel(entry: SiteCreatorSelectionIndexEntry): string {
  const name = entry.name?.trim();
  if (name && name !== entry.layerId && !looksTechnicalName(name, entry.type)) return name;
  return "Grupo de capas";
}

/** Si el padre es groupContainer con espejo, el hijo no posee layerIds (evita conflicto de ownership). */
function shouldMirrorOwnContainerLayer(
  entry: SiteCreatorSelectionIndexEntry,
  mirrorIdByContainer: Map<string, string>,
): boolean {
  const parentLayerId = entry.parentLayerId;
  if (!parentLayerId) return true;
  return !mirrorIdByContainer.has(parentLayerId);
}

function collectGroupContainerEntries(
  index: SiteCreatorSelectionIndex,
): SiteCreatorSelectionIndexEntry[] {
  return index.entries
    .filter((e) => e.type === "groupContainer")
    .sort((a, b) => {
      if (a.depth !== b.depth) return a.depth - b.depth;
      return compareZOrderPath(a.zOrderPath, b.zOrderPath);
    });
}

function findMirrorNodeIdForContainer(
  blueprint: SiteBlueprintV1,
  containerId: string,
  index: SiteCreatorSelectionIndex,
): string | null {
  const stableId = designerGroupMirrorNodeId(containerId);
  const stable = blueprint.nodes[stableId];
  if (
    stable &&
    isDesignerGroupMirrorNode(stable, index) &&
    stable.layerIds[0] === containerId
  ) {
    return stableId;
  }
  for (const [nodeId, node] of Object.entries(blueprint.nodes)) {
    if (
      node.layerIds.length === 1 &&
      node.layerIds[0] === containerId &&
      isDesignerGroupMirrorNode(node, index)
    ) {
      return nodeId;
    }
  }
  return null;
}

function isDirectlyOwnedByUserSemantics(
  blueprint: SiteBlueprintV1,
  layerId: string,
  index: SiteCreatorSelectionIndex,
): boolean {
  const ownerId = buildBlueprintOwnershipIndex(blueprint).ownerByLayerId[layerId];
  if (!ownerId) return false;
  const owner = blueprint.nodes[ownerId];
  if (!owner) return false;
  if (isSiteSectionNode(owner) || isSiteButtonNode(owner)) return true;
  if (
    owner.kind === "layoutGroup" &&
    !isDesignerGroupMirrorNode(owner, index) &&
    !isDesignerGroupIdMirrorNode(owner)
  ) {
    return true;
  }
  return false;
}

function findMirrorNodeIdForGroupId(
  blueprint: SiteBlueprintV1,
  designerGroupId: string,
): string | null {
  const stableId = designerGroupIdMirrorNodeId(designerGroupId);
  if (blueprint.nodes[stableId]?.kind === "layoutGroup") return stableId;
  for (const [nodeId, node] of Object.entries(blueprint.nodes)) {
    if (!isDesignerGroupIdMirrorNode(node)) continue;
    if (nodeId === stableId || nodeId.endsWith(designerGroupId)) return nodeId;
  }
  return null;
}

function canBootstrapGroupIdCluster(
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
  memberIds: string[],
): boolean {
  const ownership = buildBlueprintOwnershipIndexWithTree(blueprint, index);
  for (const layerId of memberIds) {
    if (isDirectlyOwnedByUserSemantics(blueprint, layerId, index)) return false;
    if (ownership.coveredByContainerOwner[layerId]) return false;
    const ownerId = ownership.ownerByLayerId[layerId];
    if (!ownerId) continue;
    const owner = blueprint.nodes[ownerId];
    if (owner && isDesignerGroupIdMirrorNode(owner)) continue;
    if (owner && isDesignerGroupMirrorNode(owner, index)) return false;
  }
  return true;
}

function resolveGroupIdMirrorParentId(
  cluster: DesignerGroupIdCluster,
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
  mirrorIdByContainer: Map<string, string>,
): string | null {
  const parentLayerId = cluster.parentLayerId;
  if (!parentLayerId) return null;
  const parentEntry = index.byId[parentLayerId];
  if (parentEntry?.type === "groupContainer") {
    const parentMirror = mirrorIdByContainer.get(parentLayerId);
    if (parentMirror) return parentMirror;
    const semanticOwner = findLayerSemanticOwner(blueprint, parentLayerId, index);
    if (semanticOwner && (semanticOwner.kind === "layoutGroup" || isSiteSectionNode(semanticOwner))) {
      return semanticOwner.id;
    }
  }
  return null;
}

function detachFromTree(blueprint: SiteBlueprintV1, nodeId: string): SiteBlueprintV1 {
  const node = blueprint.nodes[nodeId];
  if (!node) return blueprint;
  const nodes = { ...blueprint.nodes };
  if (node.parentId && nodes[node.parentId]) {
    const parent = nodes[node.parentId]!;
    nodes[node.parentId] = {
      ...parent,
      childIds: parent.childIds.filter((id) => id !== nodeId),
    } as SiteBlueprintNode;
  }
  nodes[nodeId] = { ...node, parentId: null };
  return {
    ...blueprint,
    nodes,
    rootChildIds: blueprint.rootChildIds.filter((id) => id !== nodeId),
  };
}

function attachMirrorToParent(
  blueprint: SiteBlueprintV1,
  mirrorId: string,
  parentId: string | null,
): SiteBlueprintV1 {
  let next = detachFromTree(blueprint, mirrorId);
  const child = next.nodes[mirrorId];
  if (!child) return next;

  if (parentId == null) {
    const nodes = {
      ...next.nodes,
      [mirrorId]: { ...child, parentId: null } as SiteBlueprintNode,
    };
    const rootChildIds = next.rootChildIds.includes(mirrorId)
      ? next.rootChildIds
      : [...next.rootChildIds, mirrorId];
    return { ...next, nodes, rootChildIds };
  }

  const parent = next.nodes[parentId];
  if (!parent) return next;
  const childIds = parent.childIds.includes(mirrorId)
    ? parent.childIds
    : [...parent.childIds, mirrorId];
  const nodes = {
    ...next.nodes,
    [mirrorId]: { ...child, parentId } as SiteBlueprintNode,
    [parentId]: { ...parent, childIds } as SiteBlueprintNode,
  };
  return {
    ...next,
    nodes,
    rootChildIds: next.rootChildIds.filter((id) => id !== mirrorId),
  };
}

function removeMirrorNode(blueprint: SiteBlueprintV1, mirrorId: string): SiteBlueprintV1 {
  const node = blueprint.nodes[mirrorId];
  if (!node) return blueprint;
  const parentId = node.parentId;
  let next = blueprint;
  for (const childId of [...node.childIds]) {
    next = attachMirrorToParent(next, childId, parentId);
  }
  const nodes = { ...next.nodes };
  delete nodes[mirrorId];
  return {
    ...next,
    nodes,
    rootChildIds: next.rootChildIds.filter((id) => id !== mirrorId),
  };
}

function resolveDesiredParentId(
  entry: SiteCreatorSelectionIndexEntry,
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
  mirrorIdByContainer: Map<string, string>,
): string | null {
  const parentLayerId = entry.parentLayerId;
  if (!parentLayerId) return null;
  const parentEntry = index.byId[parentLayerId];
  if (parentEntry?.type === "groupContainer") {
    const parentMirror = mirrorIdByContainer.get(parentLayerId);
    if (parentMirror) return parentMirror;
    const semanticOwner = findLayerSemanticOwner(blueprint, parentLayerId, index);
    if (
      semanticOwner &&
      (isSiteSectionNode(semanticOwner) || semanticOwner.kind === "layoutGroup")
    ) {
      return semanticOwner.id;
    }
    return null;
  }
  return null;
}

function sortRootChildrenByDesignerOrder(
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
  autoMirrorNodeIds: Set<string>,
): SiteBlueprintV1 {
  const rootChildIds = [...blueprint.rootChildIds].sort((a, b) => {
    const aAuto = autoMirrorNodeIds.has(a);
    const bAuto = autoMirrorNodeIds.has(b);
    if (aAuto && bAuto) {
      const zIndex = (nodeId: string): number => {
        const node = blueprint.nodes[nodeId];
        if (!node) return 0;
        const first = node.layerIds[0];
        if (!first) return 0;
        return index.byId[first]?.zOrderPath[0] ?? 0;
      };
      return zIndex(a) - zIndex(b);
    }
    return blueprint.rootChildIds.indexOf(a) - blueprint.rootChildIds.indexOf(b);
  });
  return { ...blueprint, rootChildIds };
}

function sortMirrorChildOrders(
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
  autoMirrorNodeIds: Set<string>,
): SiteBlueprintV1 {
  const nodes = { ...blueprint.nodes };
  for (const mirrorId of autoMirrorNodeIds) {
    const node = nodes[mirrorId];
    if (!node || node.childIds.length <= 1) continue;
    const sorted = [...node.childIds].sort((a, b) => {
      const na = nodes[a];
      const nb = nodes[b];
      if (!na || !nb) return 0;
      const za = na.layerIds[0] ? (index.byId[na.layerIds[0]!]?.siblingIndex ?? 0) : 0;
      const zb = nb.layerIds[0] ? (index.byId[nb.layerIds[0]!]?.siblingIndex ?? 0) : 0;
      return za - zb;
    });
    nodes[mirrorId] = { ...node, childIds: sorted };
  }
  return { ...blueprint, nodes };
}

function reconcileGroupIdMirrors(
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
  mirrorIdByContainer: Map<string, string>,
): { blueprint: SiteBlueprintV1; mirrorIdByGroupId: Map<string, string> } {
  let next = blueprint;
  const clusters = collectDesignerGroupIdClusters(index);
  const liveGroupIds = new Set(clusters.map((c) => c.designerGroupId));
  const mirrorIdByGroupId = new Map<string, string>();

  for (const cluster of clusters) {
    const existing = findMirrorNodeIdForGroupId(next, cluster.designerGroupId);
    if (existing) mirrorIdByGroupId.set(cluster.designerGroupId, existing);
  }

  for (const [nodeId, node] of Object.entries(next.nodes)) {
    if (!isDesignerGroupIdMirrorNode(node)) continue;
    const gid = nodeId.slice(`${DESIGNER_GROUP_MIRROR_ID_PREFIX}gid_`.length);
    if (!liveGroupIds.has(gid) || isDesignerGroupIdMirrorDismissed(next, gid)) {
      next = removeMirrorNode(next, nodeId);
      mirrorIdByGroupId.delete(gid);
    }
  }

  for (const cluster of clusters) {
    if (isDesignerGroupIdMirrorDismissed(next, cluster.designerGroupId)) continue;
    if (!canBootstrapGroupIdCluster(next, index, cluster.memberIds)) continue;

    let mirrorId =
      mirrorIdByGroupId.get(cluster.designerGroupId) ??
      findMirrorNodeIdForGroupId(next, cluster.designerGroupId);
    const label = designerGroupIdClusterLabel(cluster.memberIds, index);
    const layerIds = [...cluster.memberIds];

    if (!mirrorId) {
      mirrorId = designerGroupIdMirrorNodeId(cluster.designerGroupId);
      if (next.nodes[mirrorId] && !isDesignerGroupIdMirrorNode(next.nodes[mirrorId]!)) {
        mirrorId = `${mirrorId}_m`;
      }
      const group: SiteBlueprintLayoutGroupNode = {
        id: mirrorId,
        kind: "layoutGroup",
        label,
        parentId: null,
        childIds: [],
        layerIds,
      };
      next = {
        ...next,
        nodes: { ...next.nodes, [mirrorId]: group },
        rootChildIds: next.rootChildIds.includes(mirrorId)
          ? next.rootChildIds
          : [...next.rootChildIds, mirrorId],
      };
    } else {
      const existing = next.nodes[mirrorId]!;
      next = {
        ...next,
        nodes: {
          ...next.nodes,
          [mirrorId]: { ...existing, label, layerIds } as SiteBlueprintNode,
        },
      };
    }
    mirrorIdByGroupId.set(cluster.designerGroupId, mirrorId);
  }

  for (const cluster of clusters) {
    if (isDesignerGroupIdMirrorDismissed(next, cluster.designerGroupId)) continue;
    if (!canBootstrapGroupIdCluster(next, index, cluster.memberIds)) continue;
    const mirrorId = mirrorIdByGroupId.get(cluster.designerGroupId);
    if (!mirrorId) continue;
    const parentId = resolveGroupIdMirrorParentId(cluster, next, index, mirrorIdByContainer);
    next = attachMirrorToParent(next, mirrorId, parentId);
  }

  return { blueprint: next, mirrorIdByGroupId };
}

/**
 * Crea o actualiza layoutGroups espejo para carpetas (`groupContainer`) y grupos Ctrl+G (`groupId`).
 * No modifica secciones, botones ni grupos manuales del usuario.
 */
export function reconcileDesignerGroupMirrors(
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
): SiteBlueprintV1 {
  let next = pruneDismissedDesignerMirrors(cloneBlueprint(blueprint), index);
  const groupEntries = collectGroupContainerEntries(index);
  const liveContainerIds = new Set(groupEntries.map((e) => e.layerId));
  const mirrorIdByContainer = new Map<string, string>();

  for (const entry of groupEntries) {
    const existing = findMirrorNodeIdForContainer(next, entry.layerId, index);
    if (existing) mirrorIdByContainer.set(entry.layerId, existing);
  }

  for (const [nodeId, node] of Object.entries(next.nodes)) {
    if (!isDesignerGroupMirrorCandidate(node)) continue;
    const containerId = mirrorContainerLayerIdFromNode(node as SiteBlueprintLayoutGroupNode);
    if (
      !containerId ||
      !liveContainerIds.has(containerId) ||
      isDesignerContainerMirrorDismissed(next, containerId)
    ) {
      next = removeMirrorNode(next, nodeId);
      if (containerId) mirrorIdByContainer.delete(containerId);
    }
  }

  for (const entry of groupEntries) {
    if (isDirectlyOwnedByUserSemantics(next, entry.layerId, index)) continue;
    if (isDesignerContainerMirrorDismissed(next, entry.layerId)) continue;

    let mirrorId =
      mirrorIdByContainer.get(entry.layerId) ??
      findMirrorNodeIdForContainer(next, entry.layerId, index);
    const label = groupContainerLabel(entry);
    const ownContainerLayer = shouldMirrorOwnContainerLayer(entry, mirrorIdByContainer);

    if (!mirrorId) {
      mirrorId = designerGroupMirrorNodeId(entry.layerId);
      if (next.nodes[mirrorId] && !isDesignerGroupMirrorCandidate(next.nodes[mirrorId]!)) {
        mirrorId = `${mirrorId}_m`;
      }
      const group: SiteBlueprintLayoutGroupNode = {
        id: mirrorId,
        kind: "layoutGroup",
        label,
        parentId: null,
        childIds: [],
        layerIds: ownContainerLayer ? [entry.layerId] : [],
      };
      next = {
        ...next,
        nodes: { ...next.nodes, [mirrorId]: group },
        rootChildIds: next.rootChildIds.includes(mirrorId)
          ? next.rootChildIds
          : [...next.rootChildIds, mirrorId],
      };
    } else {
      const existing = next.nodes[mirrorId]!;
      next = {
        ...next,
        nodes: {
          ...next.nodes,
          [mirrorId]: {
            ...existing,
            label,
            layerIds: ownContainerLayer ? [entry.layerId] : [],
          } as SiteBlueprintNode,
        },
      };
    }
    mirrorIdByContainer.set(entry.layerId, mirrorId);
  }

  for (const entry of groupEntries) {
    if (isDirectlyOwnedByUserSemantics(next, entry.layerId, index)) continue;
    if (isDesignerContainerMirrorDismissed(next, entry.layerId)) continue;
    const mirrorId = mirrorIdByContainer.get(entry.layerId);
    if (!mirrorId) continue;
    const parentId = resolveDesiredParentId(entry, next, index, mirrorIdByContainer);
    next = attachMirrorToParent(next, mirrorId, parentId);
  }

  const groupIdPass = reconcileGroupIdMirrors(next, index, mirrorIdByContainer);
  next = groupIdPass.blueprint;

  const autoMirrorNodeIds = new Set([
    ...mirrorIdByContainer.values(),
    ...groupIdPass.mirrorIdByGroupId.values(),
  ]);
  next = sortRootChildrenByDesignerOrder(next, index, autoMirrorNodeIds);
  next = sortMirrorChildOrders(next, index, autoMirrorNodeIds);

  return assertValidBlueprint(next, index);
}

export function reconcileDesignerGroupMirrorsForPage(
  blueprint: SiteBlueprintV1,
  page: { objects?: unknown[] },
): SiteBlueprintV1 {
  const index = buildSiteSelectionIndex(page as Parameters<typeof buildSiteSelectionIndex>[0]);
  return reconcileDesignerGroupMirrors(blueprint, index);
}
