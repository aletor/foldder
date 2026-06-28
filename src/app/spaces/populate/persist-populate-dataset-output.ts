"use client";

import type { Edge, Node } from "@xyflow/react";
import { saveGlobalDataset } from "@/app/spaces/dataset/dataset-api";
import { normalizeDataset } from "@/app/spaces/dataset/dataset-migrate";
import type { Dataset, DatasetNodeData } from "@/app/spaces/dataset/dataset-types";
import {
  applyPopulateChannelsToDataset,
  applyPopulateResultsToDataset,
  type ApplyPopulateChannelsResult,
  type ApplyPopulateDatasetOutputResult,
  type PopulateChannelOutput,
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

/**
 * Multi-canal: aplica TODOS los canales al Dataset en memoria (cada uno a su columna) y persiste
 * UNA sola vez. Evita los conflictos de versión que tendría llamar al escritor de 1 canal en bucle
 * sobre un Dataset global (cada guardado incrementa la versión).
 */
export async function persistPopulateChannelsDatasetOutput(args: {
  populateNodeId: string;
  nodes: Node[];
  edges: Edge[];
  dataset: Dataset;
  listId: string;
  channels: PopulateChannelOutput[];
  setNodes: (updater: (nodes: Node[]) => Node[]) => void;
}): Promise<ApplyPopulateChannelsResult> {
  const { populateNodeId, nodes, edges, dataset, listId, channels, setNodes } = args;
  const source = findPopulateDatasetSource(populateNodeId, nodes, edges);
  if (!source) throw new Error("No hay un nodo Dataset conectado a Populate.");

  const result = applyPopulateChannelsToDataset({
    dataset: normalizeDataset(dataset),
    listId,
    channels,
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
