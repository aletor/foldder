"use client";

/**
 * usePopulateContextForNode — descubre, desde un nodo creativo, si está conectado
 * a un nodo Populate y resuelve el Dataset que Populate tiene de entrada.
 *
 * Topología (plantilla fuera):
 *   [Dataset] --dataset--> [Populate] <--template-- [Image Creation (plantilla)]
 *
 * La resolución del Dataset se delega en `useDesignerConnectedDataset` (genérico:
 * resuelve el Dataset conectado a un nodo por el handle `dataset`). Aquí solo
 * añadimos el salto creativo → Populate. Si no hay Populate/Dataset, el nodo se
 * comporta como hoy.
 */

import { useCallback, useMemo } from "react";
import { useStore, type Edge, type Node, type ReactFlowState } from "@xyflow/react";
import { shallow } from "zustand/shallow";
import { useDesignerConnectedDataset } from "@/app/spaces/designer/use-designer-connected-dataset";
import type { Dataset, FieldDef } from "@/app/spaces/dataset/dataset-types";
import type { PopulateNodeData } from "./populate-types";

export const POPULATE_NODE_TYPE = "populate" as const;
export const POPULATE_TEMPLATE_HANDLE = "template" as const;

/** Evento que SpacesContent escucha para depositar los nodos generados en el Nested Space. */
export const POPULATE_COMMIT_EVENT = "foldder-populate-commit";

/**
 * Hook genérico: resuelve el Dataset conectado directamente a `nodeId` por el handle
 * `dataset`. Reutiliza la implementación de Designer (es independiente del tipo de nodo).
 */
export { useDesignerConnectedDataset as useConnectedDatasetForNode } from "@/app/spaces/designer/use-designer-connected-dataset";

function findPopulateForCreative(
  state: ReactFlowState<Node, Edge>,
  creativeNodeId: string,
): Node | null {
  // Preferimos el handle "template", pero aceptamos cualquier edge creativo → populate.
  let fallback: Node | null = null;
  for (const edge of state.edges) {
    if (edge.source !== creativeNodeId) continue;
    const candidate = state.nodes.find(
      (n) => n.id === edge.target && n.type === POPULATE_NODE_TYPE,
    );
    if (!candidate) continue;
    if (edge.targetHandle === POPULATE_TEMPLATE_HANDLE) return candidate;
    fallback = candidate;
  }
  return fallback;
}

type PopulateLink = { populateNodeId: string; listId: string | null } | null;

function selectPopulateLink(
  state: ReactFlowState<Node, Edge>,
  creativeNodeId: string,
): PopulateLink {
  const populateNode = findPopulateForCreative(state, creativeNodeId);
  if (!populateNode) return null;
  const data = (populateNode.data ?? {}) as PopulateNodeData;
  return { populateNodeId: populateNode.id, listId: data.listId ?? null };
}

export type PopulateContextState = {
  /** Está conectado a un Populate. */
  populateConnected: boolean;
  populateNodeId: string | null;
  /** Dataset de entrada del Populate (resuelto inline o global). */
  dataset: Dataset | null;
  datasetLoading: boolean;
  /** Listado activo elegido en el Populate (o el primero por defecto). */
  listId: string | null;
  /** Schema del listado activo (para ofrecer columnas a los inputs). */
  schema: FieldDef[];
};

export function usePopulateContextForNode(creativeNodeId: string): PopulateContextState {
  const link = useStore(
    useCallback(
      (state: ReactFlowState<Node, Edge>) => selectPopulateLink(state, creativeNodeId),
      [creativeNodeId],
    ),
    shallow,
  );

  const { connectedDataset, datasetLoading } = useDesignerConnectedDataset(
    link?.populateNodeId ?? "",
  );

  const dataset = link ? connectedDataset : null;

  const listId = useMemo(() => {
    if (!dataset) return null;
    if (link?.listId && dataset.lists.some((l) => l.id === link.listId)) return link.listId;
    return dataset.lists[0]?.id ?? null;
  }, [dataset, link?.listId]);

  const schema = useMemo(() => {
    if (!dataset || !listId) return [] as FieldDef[];
    return dataset.lists.find((l) => l.id === listId)?.schema ?? [];
  }, [dataset, listId]);

  return {
    populateConnected: !!link,
    populateNodeId: link?.populateNodeId ?? null,
    dataset,
    datasetLoading: link ? datasetLoading : false,
    listId,
    schema,
  };
}
