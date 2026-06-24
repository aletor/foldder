import type { Node } from "@xyflow/react";
import { normalizeDataset, totalCardCount } from "./dataset-migrate";
import type { Dataset, DatasetNodeData, DatasetPreview } from "./dataset-types";
import { validate } from "./dataset-logic";

export function buildDatasetPreview(dataset: Dataset): DatasetPreview {
  const normalized = normalizeDataset(dataset);
  const validation = validate(normalized);
  return {
    id: normalized.id,
    name: normalized.name,
    scope: normalized.scope,
    version: normalized.version,
    listCount: normalized.lists.length,
    cardCount: totalCardCount(normalized),
    constantCount: normalized.constants.fields.length,
    lists: normalized.lists.map((list) => ({
      id: list.id,
      name: list.name,
      key: list.key,
      cardCount: list.cards.length,
      schemaKeys: list.schema.map((field) => field.key),
    })),
    complete: validation.complete,
    gapCount: validation.gaps.length,
  };
}

export function collectDatasetRefsFromNodes(nodes: Node[]): Array<{ datasetId: string; version: number }> {
  const out: Array<{ datasetId: string; version: number }> = [];
  for (const node of nodes) {
    if (node.type !== "dataset") continue;
    const data = node.data as DatasetNodeData | undefined;
    const ref = data?.datasetRef;
    if (!ref?.datasetId) continue;
    out.push({
      datasetId: ref.datasetId,
      version: typeof ref.version === "number" ? ref.version : 0,
    });
  }
  return out;
}

export function collectGlobalDatasetIdsFromNodes(nodes: Node[]): string[] {
  return [...new Set(collectDatasetRefsFromNodes(nodes).map((ref) => ref.datasetId))];
}

export function normalizeDatasetNodeDataForPersistence(data: DatasetNodeData): DatasetNodeData {
  if (!data.datasetRef?.datasetId) return data;
  const { dataset: _inline, ...rest } = data;
  return rest;
}

export function collectGlobalDatasetIdsFromSpaces(
  spaces: Record<string, { nodes?: Node[] } | undefined> | null | undefined,
): string[] {
  const ids: string[] = [];
  if (!spaces || typeof spaces !== "object") return ids;
  for (const space of Object.values(spaces)) {
    if (!space?.nodes?.length) continue;
    ids.push(...collectGlobalDatasetIdsFromNodes(space.nodes as Node[]));
  }
  return [...new Set(ids)];
}

export function normalizeDatasetNodesForPersistence(nodes: Node[]): Node[] {
  return nodes.map((node) => {
    if (node.type !== "dataset") return node;
    const data = node.data as DatasetNodeData | undefined;
    if (!data) return node;
    const normalized = normalizeDatasetNodeDataForPersistence(data);
    if (normalized === data) return node;
    return { ...node, data: normalized as Record<string, unknown> };
  });
}
