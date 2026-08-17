import type { SiteCreatorSelectionIndex } from "./site-creator-selection-types";
import {
  collectDesignerGroupIdClusters,
  designerGroupIdMirrorNodeId,
  isDesignerGroupIdMirrorNode,
} from "./site-creator-designer-group-id";
import {
  isDesignerGroupMirrorNode,
  mirrorContainerLayerIdFromNode,
} from "./site-creator-designer-group-bootstrap";
import type {
  SiteBlueprintLayoutGroupNode,
  SiteBlueprintNode,
  SiteBlueprintV1,
  SiteDismissedDesignerMirrorsV1,
} from "./site-creator-types";

export function emptyDismissedDesignerMirrors(): SiteDismissedDesignerMirrorsV1 {
  return { containerLayerIds: [], groupIds: [] };
}

export function readDismissedDesignerMirrors(
  blueprint: SiteBlueprintV1,
): SiteDismissedDesignerMirrorsV1 {
  return blueprint.dismissedDesignerMirrors ?? emptyDismissedDesignerMirrors();
}

export function isDesignerContainerMirrorDismissed(
  blueprint: SiteBlueprintV1,
  containerLayerId: string,
): boolean {
  return readDismissedDesignerMirrors(blueprint).containerLayerIds.includes(containerLayerId);
}

export function isDesignerGroupIdMirrorDismissed(
  blueprint: SiteBlueprintV1,
  designerGroupId: string,
): boolean {
  return readDismissedDesignerMirrors(blueprint).groupIds.includes(designerGroupId);
}

export function dismissDesignerContainerMirror(
  blueprint: SiteBlueprintV1,
  containerLayerId: string,
): SiteBlueprintV1 {
  const prev = readDismissedDesignerMirrors(blueprint);
  if (prev.containerLayerIds.includes(containerLayerId)) return blueprint;
  return {
    ...blueprint,
    dismissedDesignerMirrors: {
      ...prev,
      containerLayerIds: [...prev.containerLayerIds, containerLayerId],
    },
  };
}

export function dismissDesignerGroupIdMirror(
  blueprint: SiteBlueprintV1,
  designerGroupId: string,
): SiteBlueprintV1 {
  const prev = readDismissedDesignerMirrors(blueprint);
  if (prev.groupIds.includes(designerGroupId)) return blueprint;
  return {
    ...blueprint,
    dismissedDesignerMirrors: {
      ...prev,
      groupIds: [...prev.groupIds, designerGroupId],
    },
  };
}

export function designerGroupIdFromMirrorNode(node: SiteBlueprintNode): string | null {
  if (!isDesignerGroupIdMirrorNode(node)) return null;
  return node.id.slice(designerGroupIdMirrorNodeId("").length);
}

/** Registra que el usuario desagrupó un espejo automático del Designer. */
export function dismissDesignerMirrorNode(
  blueprint: SiteBlueprintV1,
  node: SiteBlueprintLayoutGroupNode,
  index: SiteCreatorSelectionIndex,
): SiteBlueprintV1 {
  const groupId = designerGroupIdFromMirrorNode(node);
  if (groupId) return dismissDesignerGroupIdMirror(blueprint, groupId);
  if (isDesignerGroupMirrorNode(node, index)) {
    const containerId = mirrorContainerLayerIdFromNode(node);
    if (containerId) return dismissDesignerContainerMirror(blueprint, containerId);
  }
  return blueprint;
}

export function isAutoDesignerMirrorNode(
  node: SiteBlueprintNode,
  index: SiteCreatorSelectionIndex,
): boolean {
  if (node.kind !== "layoutGroup") return false;
  return isDesignerGroupIdMirrorNode(node) || isDesignerGroupMirrorNode(node, index);
}

/** Limpia ids obsoletos tras cambios en Designer. */
export function pruneDismissedDesignerMirrors(
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
): SiteBlueprintV1 {
  const prev = readDismissedDesignerMirrors(blueprint);
  const liveContainers = new Set(
    index.entries.filter((e) => e.type === "groupContainer").map((e) => e.layerId),
  );
  const liveGroupIds = new Set(collectDesignerGroupIdClusters(index).map((c) => c.designerGroupId));

  const containerLayerIds = prev.containerLayerIds.filter((id) => liveContainers.has(id));
  const groupIds = prev.groupIds.filter((id) => liveGroupIds.has(id));

  if (
    containerLayerIds.length === prev.containerLayerIds.length &&
    groupIds.length === prev.groupIds.length
  ) {
    return blueprint;
  }

  if (containerLayerIds.length === 0 && groupIds.length === 0) {
    const { dismissedDesignerMirrors: _removed, ...rest } = blueprint;
    return rest;
  }

  return {
    ...blueprint,
    dismissedDesignerMirrors: { containerLayerIds, groupIds },
  };
}
