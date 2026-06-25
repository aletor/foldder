/**
 * Resuelve el nodo Dataset conectado al handle dataset de Populate.
 */

import type { Edge, Node } from "@xyflow/react";
import type { DatasetNodeData } from "@/app/spaces/dataset/dataset-types";

export interface PopulateDatasetSource {
  sourceNodeId: string;
  datasetRefId: string | null;
  datasetRefVersion: number | null;
  inlineDataset: boolean;
}

export function findPopulateDatasetSource(
  populateNodeId: string,
  nodes: Node[],
  edges: Edge[],
): PopulateDatasetSource | null {
  const edge = edges.find((e) => e.target === populateNodeId && e.targetHandle === "dataset");
  if (!edge) return null;
  const source = nodes.find((n) => n.id === edge.source);
  if (!source || source.type !== "dataset") return null;
  const data = (source.data ?? {}) as DatasetNodeData;
  return {
    sourceNodeId: source.id,
    datasetRefId: data.datasetRef?.datasetId ?? null,
    datasetRefVersion: data.datasetRef?.version ?? null,
    inlineDataset: Boolean(data.dataset),
  };
}
