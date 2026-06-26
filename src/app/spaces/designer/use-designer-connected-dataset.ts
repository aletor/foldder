"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore, type Edge, type Node, type ReactFlowState } from "@xyflow/react";
import { shallow } from "zustand/shallow";
import { fetchGlobalDataset } from "@/app/spaces/dataset/dataset-api";
import { normalizeDataset } from "@/app/spaces/dataset/dataset-migrate";
import type { Dataset, DatasetNodeData } from "@/app/spaces/dataset/dataset-types";

type DatasetSourceSnapshot = {
  sourceNodeId: string;
  /**
   * Referencia cruda al dataset inline (sin normalizar). Su identidad solo cambia cuando el nodo
   * Dataset reescribe `data.dataset` (es decir, en una edición real), no en cada tick del store.
   * Normalizar aquí dentro rompería `shallow` (objeto nuevo cada tick → re-render en cada interacción).
   */
  inlineDatasetRaw: Dataset | null;
  /** `version` del dataset inline: señal barata de cambio de contenido (se incrementa en cada edición). */
  inlineVersion: number | null;
  datasetRefId: string | null;
  datasetRefVersion: number | null;
  datasetRemoteVersion: number | null;
} | null;

function findDatasetInputEdge(
  state: ReactFlowState<Node, Edge>,
  consumerNodeId: string,
  targetHandle: string = "dataset",
): Edge | undefined {
  for (const row of state.edges) {
    if (row.target !== consumerNodeId) continue;
    if (row.targetHandle === targetHandle) return row;
    // Legacy: dataset cableado a ranura media_list (ml0…) por error de resolución de handle.
    const source = state.nodeLookup.get(row.source) ?? state.nodes.find((n) => n.id === row.source);
    if (source?.type === "dataset" && row.sourceHandle === "dataset") return row;
  }
  return undefined;
}

function selectConnectedDatasetSource(
  state: ReactFlowState<Node, Edge>,
  consumerNodeId: string,
  targetHandle: string = "dataset",
): DatasetSourceSnapshot {
  const edge = findDatasetInputEdge(state, consumerNodeId, targetHandle);
  if (!edge) return null;
  const source = state.nodeLookup.get(edge.source) ?? state.nodes.find((row) => row.id === edge.source);
  if (!source || source.type !== "dataset") return null;
  const data = (source.data ?? {}) as DatasetNodeData;
  return {
    sourceNodeId: source.id,
    inlineDatasetRaw: data.dataset ?? null,
    inlineVersion: data.dataset?.version ?? null,
    datasetRefId: data.datasetRef?.datasetId ?? null,
    datasetRefVersion: data.datasetRef?.version ?? null,
    datasetRemoteVersion: data.datasetRemoteVersion ?? null,
  };
}

export { selectConnectedDatasetSource };

export type DesignerConnectedDatasetState = {
  datasetConnected: boolean;
  connectedDataset: Dataset | null;
  datasetLoading: boolean;
};

export function useDesignerConnectedDataset(designerNodeId: string): DesignerConnectedDatasetState {
  const sourceSnapshot = useStore(
    useCallback(
      (state: ReactFlowState<Node, Edge>) => selectConnectedDatasetSource(state, designerNodeId),
      [designerNodeId],
    ),
    shallow,
  );

  const inlineDataset = useMemo(
    () =>
      sourceSnapshot?.inlineDatasetRaw
        ? normalizeDataset(sourceSnapshot.inlineDatasetRaw)
        : null,
    // Solo re-normaliza cuando cambia la referencia cruda o la versión (no en cada tick del store).
    [sourceSnapshot?.inlineDatasetRaw, sourceSnapshot?.inlineVersion],
  );

  const [fetchedDataset, setFetchedDataset] = useState<Dataset | null>(null);
  const [datasetLoading, setDatasetLoading] = useState(false);

  useEffect(() => {
    if (!sourceSnapshot) {
      setFetchedDataset(null);
      setDatasetLoading(false);
      return;
    }
    if (inlineDataset) {
      setFetchedDataset(inlineDataset);
      setDatasetLoading(false);
      return;
    }
    const refId = sourceSnapshot.datasetRefId;
    if (!refId) {
      setFetchedDataset(null);
      setDatasetLoading(false);
      return;
    }
    let cancelled = false;
    setDatasetLoading(true);
    void fetchGlobalDataset(refId)
      .then((response) => {
        if (cancelled) return;
        setFetchedDataset(normalizeDataset(response.dataset));
        setDatasetLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setFetchedDataset(null);
          setDatasetLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    sourceSnapshot,
    inlineDataset,
    sourceSnapshot?.datasetRefId,
    sourceSnapshot?.datasetRefVersion,
    sourceSnapshot?.datasetRemoteVersion,
  ]);

  return {
    datasetConnected: !!sourceSnapshot,
    connectedDataset: inlineDataset ?? fetchedDataset,
    datasetLoading,
  };
}
