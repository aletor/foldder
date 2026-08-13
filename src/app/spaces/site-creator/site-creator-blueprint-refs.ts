import { collectSnapshotLayerIds } from "./designer-source-layers";
import type { DesignerSourceSnapshotV1, SiteBlueprintV1 } from "./site-creator-types";

export interface SiteBlueprintReferenceState {
  validLayerIds: string[];
  missingLayerIds: string[];
  missingReferencesByBlueprintNodeId: Record<string, string[]>;
}

/** Todos los layerIds referenciados por nodos del Blueprint. */
export function collectSiteBlueprintLayerReferences(blueprint: SiteBlueprintV1): string[] {
  const ids = new Set<string>();
  for (const node of Object.values(blueprint.nodes ?? {})) {
    for (const layerId of node.layerIds ?? []) {
      if (layerId) ids.add(layerId);
    }
  }
  return [...ids].sort((a, b) => a.localeCompare(b));
}

export function isSiteBlueprintEmpty(blueprint: SiteBlueprintV1): boolean {
  return (
    (blueprint.rootChildIds?.length ?? 0) === 0 &&
    Object.keys(blueprint.nodes ?? {}).length === 0
  );
}

export function canReplaceDesignerOrigin(blueprint: SiteBlueprintV1): boolean {
  return isSiteBlueprintEmpty(blueprint) && collectSiteBlueprintLayerReferences(blueprint).length === 0;
}

export function resolveSiteBlueprintReferenceState(
  blueprint: SiteBlueprintV1,
  snapshot: DesignerSourceSnapshotV1 | undefined,
): SiteBlueprintReferenceState {
  const referenced = collectSiteBlueprintLayerReferences(blueprint);
  // Referencias responsive a grupos Designer: mismo canal POR REVISAR si la capa desapareció.
  for (const rule of blueprint.responsive?.rules ?? []) {
    if (rule.target.kind === "designerGroup" && !referenced.includes(rule.target.layerId)) {
      referenced.push(rule.target.layerId);
    }
  }
  referenced.sort((a, b) => a.localeCompare(b));

  const snapshotIds = snapshot ? collectSnapshotLayerIds(snapshot.page.objects) : [];
  const validSet = new Set(snapshotIds);

  const missingLayerIds = referenced.filter((id) => !validSet.has(id)).sort((a, b) => a.localeCompare(b));
  const validLayerIds = referenced.filter((id) => validSet.has(id)).sort((a, b) => a.localeCompare(b));

  const missingReferencesByBlueprintNodeId: Record<string, string[]> = {};
  for (const [nodeId, node] of Object.entries(blueprint.nodes ?? {})) {
    const missing = (node.layerIds ?? []).filter((layerId) => !validSet.has(layerId));
    if (missing.length > 0) {
      missingReferencesByBlueprintNodeId[nodeId] = [...missing].sort((a, b) => a.localeCompare(b));
    }
  }

  return { validLayerIds, missingLayerIds, missingReferencesByBlueprintNodeId };
}
