/**
 * Resuelve el nodo Dataset conectado al handle dataset de Loop.
 */

import type { Edge, Node } from "@xyflow/react";
import type { DatasetNodeData } from "@/app/spaces/dataset/dataset-types";

export interface LoopDatasetSource {
  sourceNodeId: string;
  datasetRefId: string | null;
  datasetRefVersion: number | null;
  inlineDataset: boolean;
}

export function findLoopDatasetSource(
  loopNodeId: string,
  nodes: Node[],
  edges: Edge[],
): LoopDatasetSource | null {
  const edge =
    edges.find((e) => e.target === loopNodeId && e.targetHandle === "dataset") ??
    edges.find((e) => {
      if (e.target !== loopNodeId) return false;
      const source = nodes.find((n) => n.id === e.source);
      return source?.type === "dataset" && (!e.targetHandle || e.sourceHandle === "dataset");
    });
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
