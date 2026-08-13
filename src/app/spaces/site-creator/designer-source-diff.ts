import type { DesignerPageState } from "../designer/DesignerNode";
import { getPageDimensions } from "../indesign/page-formats";
import {
  indexSnapshotLayerHierarchy,
  layerHierarchyFingerprint,
  layerObjectMap,
  layerVisualFingerprint,
} from "./designer-layer-fingerprint";
import { collectSnapshotLayerIds } from "./designer-source-layers";
import type { DesignerSourceSnapshotV1 } from "./site-creator-types";

export interface DesignerSourceDiffV1 {
  currentHash: string;
  candidateHash: string;

  pageChanges: {
    dimensionsChanged: boolean;
    backgroundChanged: boolean;
    formatChanged: boolean;
  };

  layers: {
    addedIds: string[];
    removedIds: string[];
    visuallyChangedIds: string[];
    hierarchyChangedIds: string[];
    unchangedIds: string[];
  };

  summary: {
    added: number;
    removed: number;
    visuallyChanged: number;
    hierarchyChanged: number;
    unchanged: number;
  };
}

function pageMeta(page: DesignerPageState) {
  const dims = getPageDimensions(page);
  return {
    format: page.format,
    width: dims.width,
    height: dims.height,
    background: page.pageBackground ?? "white",
  };
}

function sortIds(ids: Iterable<string>): string[] {
  return [...ids].sort((a, b) => a.localeCompare(b));
}

/** Diff puro entre snapshot confirmado y candidato derivado del Designer. */
export function diffDesignerSourceSnapshots(
  current: DesignerSourceSnapshotV1,
  candidate: DesignerSourceSnapshotV1,
): DesignerSourceDiffV1 {
  const currentMeta = pageMeta(current.page);
  const candidateMeta = pageMeta(candidate.page);

  const pageChanges = {
    dimensionsChanged:
      currentMeta.width !== candidateMeta.width || currentMeta.height !== candidateMeta.height,
    backgroundChanged: currentMeta.background !== candidateMeta.background,
    formatChanged: currentMeta.format !== candidateMeta.format,
  };

  const currentIds = collectSnapshotLayerIds(current.page.objects);
  const candidateIds = collectSnapshotLayerIds(candidate.page.objects);
  const currentSet = new Set(currentIds);
  const candidateSet = new Set(candidateIds);

  const addedIds = sortIds(candidateIds.filter((id) => !currentSet.has(id)));
  const removedIds = sortIds(currentIds.filter((id) => !candidateSet.has(id)));

  const currentHierarchy = indexSnapshotLayerHierarchy(current.page);
  const candidateHierarchy = indexSnapshotLayerHierarchy(candidate.page);
  const currentObjects = layerObjectMap(current.page);
  const candidateObjects = layerObjectMap(candidate.page);

  const visuallyChangedIds: string[] = [];
  const hierarchyChangedIds: string[] = [];
  const unchangedIds: string[] = [];

  const sharedIds = sortIds(currentIds.filter((id) => candidateSet.has(id)));
  for (const layerId of sharedIds) {
    const currentObj = currentObjects.get(layerId);
    const candidateObj = candidateObjects.get(layerId);
    if (!currentObj || !candidateObj) continue;

    const visualChanged =
      layerVisualFingerprint(currentObj) !== layerVisualFingerprint(candidateObj);
    const currentH = currentHierarchy.get(layerId);
    const candidateH = candidateHierarchy.get(layerId);
    const hierarchyChanged =
      !currentH ||
      !candidateH ||
      layerHierarchyFingerprint(currentH) !== layerHierarchyFingerprint(candidateH);

    if (visualChanged) visuallyChangedIds.push(layerId);
    if (hierarchyChanged) hierarchyChangedIds.push(layerId);
    if (!visualChanged && !hierarchyChanged) unchangedIds.push(layerId);
  }

  return {
    currentHash: current.contentHash,
    candidateHash: candidate.contentHash,
    pageChanges,
    layers: {
      addedIds,
      removedIds,
      visuallyChangedIds: sortIds(visuallyChangedIds),
      hierarchyChangedIds: sortIds(hierarchyChangedIds),
      unchangedIds: sortIds(unchangedIds),
    },
    summary: {
      added: addedIds.length,
      removed: removedIds.length,
      visuallyChanged: visuallyChangedIds.length,
      hierarchyChanged: hierarchyChangedIds.length,
      unchanged: unchangedIds.length,
    },
  };
}

export function diffHasLayerOrPageChanges(diff: DesignerSourceDiffV1): boolean {
  return (
    diff.summary.added > 0 ||
    diff.summary.removed > 0 ||
    diff.summary.visuallyChanged > 0 ||
    diff.summary.hierarchyChanged > 0 ||
    diff.pageChanges.dimensionsChanged ||
    diff.pageChanges.backgroundChanged ||
    diff.pageChanges.formatChanged
  );
}

/** Capas modificadas visualmente o estructuralmente (para resumen UI). */
export function diffModifiedLayerCount(diff: DesignerSourceDiffV1): number {
  const modified = new Set([
    ...diff.layers.visuallyChangedIds,
    ...diff.layers.hierarchyChangedIds,
  ]);
  return modified.size;
}
