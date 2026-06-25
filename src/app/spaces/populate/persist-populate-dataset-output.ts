"use client";

import type { Edge, Node } from "@xyflow/react";
import { saveGlobalDataset } from "@/app/spaces/dataset/dataset-api";
import { normalizeDataset } from "@/app/spaces/dataset/dataset-migrate";
import type { Dataset, DatasetNodeData } from "@/app/spaces/dataset/dataset-types";
import {
  applyPopulateResultsToDataset,
  type ApplyPopulateDatasetOutputResult,
} from "./populate-dataset-output";
import { findPopulateDatasetSource } from "./populate-dataset-source";
import type { MaterializedRow } from "./populate-materialize";
import type { PopulateDatasetOutputSettings } from "./populate-types";

export async function persistPopulateDatasetOutput(args: {
  populateNodeId: string;
  nodes: Node[];
  edges: Edge[];
  dataset: Dataset;
  listId: string;
  rows: MaterializedRow[];
  settings: PopulateDatasetOutputSettings;
  setNodes: (updater: (nodes: Node[]) => Node[]) => void;
}): Promise<ApplyPopulateDatasetOutputResult> {
  const { populateNodeId, nodes, edges, dataset, listId, rows, settings, setNodes } = args;
  const source = findPopulateDatasetSource(populateNodeId, nodes, edges);
  if (!source) throw new Error("No hay un nodo Dataset conectado a Populate.");

  const result = applyPopulateResultsToDataset({
    dataset: normalizeDataset(dataset),
    listId,
    rows,
    settings,
  });

  const sourceNode = nodes.find((n) => n.id === source.sourceNodeId);
  const sourceData = (sourceNode?.data ?? {}) as DatasetNodeData;

  if (source.datasetRefId) {
    const response = await saveGlobalDataset(result.dataset, sourceData.datasetRef?.version ?? null);
    const saved = normalizeDataset(response.dataset);
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== source.sourceNodeId) return n;
        const d = (n.data ?? {}) as DatasetNodeData;
        return {
          ...n,
          data: {
            ...d,
            dataset: undefined,
            datasetRef: { datasetId: saved.id, version: saved.version },
            datasetRemoteVersion: saved.version,
            label: saved.name,
          },
        };
      }),
    );
    return { ...result, dataset: saved };
  }

  setNodes((nds) =>
    nds.map((n) => {
      if (n.id !== source.sourceNodeId) return n;
      const d = (n.data ?? {}) as DatasetNodeData;
      return {
        ...n,
        data: {
          ...d,
          dataset: { ...result.dataset, scope: "local", projectId: d.dataset?.projectId },
          label: result.dataset.name,
        },
      };
    }),
  );

  return result;
}
