import type { SiteCreatorSelectionIndex, SiteCreatorSelectionIndexEntry } from "./site-creator-selection-types";
import type { SiteBlueprintV1 } from "./site-creator-types";
import { isDesignerGroupIdMirrorDismissed } from "./site-creator-designer-group-dismiss";

export const DESIGNER_GROUP_ID_MIRROR_PREFIX = "scgrp_dg_gid_";

export function designerGroupIdMirrorNodeId(designerGroupId: string): string {
  return `${DESIGNER_GROUP_ID_MIRROR_PREFIX}${designerGroupId}`;
}

export function isDesignerGroupIdMirrorNode(node: { kind: string; id: string }): boolean {
  return node.kind === "layoutGroup" && node.id.startsWith(DESIGNER_GROUP_ID_MIRROR_PREFIX);
}

export interface DesignerGroupIdCluster {
  designerGroupId: string;
  parentLayerId: string | null;
  memberIds: string[];
  /** Menor siblingIndex del cluster (orden en el padre). */
  sortIndex: number;
}

function parentScopeKey(parentLayerId: string | null): string {
  return parentLayerId ?? "__root__";
}

function clusterBucketKey(parentLayerId: string | null, designerGroupId: string): string {
  return `${parentScopeKey(parentLayerId)}\0${designerGroupId}`;
}

function isGroupIdClusterMember(entry: SiteCreatorSelectionIndexEntry): boolean {
  if (entry.containerKind) return false;
  if (!entry.selectableFromCanvas) return false;
  const gid = entry.object.groupId;
  return typeof gid === "string" && gid.length > 0;
}

/** Clusters Ctrl+G (`groupId`) agrupados por padre común en el árbol Designer. */
export function collectDesignerGroupIdClusters(
  index: SiteCreatorSelectionIndex,
): DesignerGroupIdCluster[] {
  const buckets = new Map<
    string,
    { designerGroupId: string; parentLayerId: string | null; memberIds: string[]; sortIndex: number }
  >();

  for (const entry of index.entries) {
    if (!isGroupIdClusterMember(entry)) continue;
    const designerGroupId = entry.object.groupId as string;
    const key = clusterBucketKey(entry.parentLayerId, designerGroupId);
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, {
        designerGroupId,
        parentLayerId: entry.parentLayerId,
        memberIds: [entry.layerId],
        sortIndex: entry.siblingIndex,
      });
      continue;
    }
    existing.memberIds.push(entry.layerId);
    existing.sortIndex = Math.min(existing.sortIndex, entry.siblingIndex);
  }

  return [...buckets.values()]
    .filter((bucket) => bucket.memberIds.length >= 2)
    .map((bucket) => ({
      designerGroupId: bucket.designerGroupId,
      parentLayerId: bucket.parentLayerId,
      memberIds: [...bucket.memberIds].sort((a, b) => a.localeCompare(b)),
      sortIndex: bucket.sortIndex,
    }))
    .sort((a, b) => {
      const depthA = a.parentLayerId ? (index.byId[a.parentLayerId]?.depth ?? 0) + 1 : 0;
      const depthB = b.parentLayerId ? (index.byId[b.parentLayerId]?.depth ?? 0) + 1 : 0;
      if (depthA !== depthB) return depthA - depthB;
      return a.sortIndex - b.sortIndex;
    });
}

/** ¿Site Creator debe tratar este cluster Ctrl+G como una sola unidad de selección? */
export function shouldTreatDesignerGroupIdAsUnit(
  blueprint: SiteBlueprintV1 | null | undefined,
  designerGroupId: string,
): boolean {
  if (blueprint && isDesignerGroupIdMirrorDismissed(blueprint, designerGroupId)) return false;
  if (blueprint?.nodes[designerGroupIdMirrorNodeId(designerGroupId)]) return true;
  if (!blueprint) return true;
  return !isDesignerGroupIdMirrorDismissed(blueprint, designerGroupId);
}

/** Mismas capas que Designer al seleccionar un miembro de un grupo Ctrl+G activo. */
export function designerGroupMemberIds(
  layerId: string,
  index: SiteCreatorSelectionIndex,
  blueprint?: SiteBlueprintV1 | null,
): string[] {
  const entry = index.byId[layerId];
  if (!entry || !isGroupIdClusterMember(entry)) return [layerId];
  const designerGroupId = entry.object.groupId as string;
  if (!shouldTreatDesignerGroupIdAsUnit(blueprint, designerGroupId)) return [layerId];
  const scope = parentScopeKey(entry.parentLayerId);
  const members = index.entries
    .filter(
      (candidate) =>
        isGroupIdClusterMember(candidate) &&
        candidate.object.groupId === designerGroupId &&
        parentScopeKey(candidate.parentLayerId) === scope,
    )
    .map((candidate) => candidate.layerId)
    .sort((a, b) => a.localeCompare(b));
  return members.length >= 2 ? members : [layerId];
}

export function expandLayerIdsWithDesignerGroups(
  layerIds: string[],
  index: SiteCreatorSelectionIndex,
  blueprint?: SiteBlueprintV1 | null,
): string[] {
  const out = new Set<string>();
  for (const layerId of layerIds) {
    for (const memberId of designerGroupMemberIds(layerId, index, blueprint)) {
      out.add(memberId);
    }
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

export function designerGroupIdClusterLabel(
  memberIds: string[],
  index: SiteCreatorSelectionIndex,
): string {
  if (memberIds.length === 1) {
    return index.byId[memberIds[0]!]?.name?.trim() || "Grupo";
  }
  return `Grupo · ${memberIds.length} capas`;
}
