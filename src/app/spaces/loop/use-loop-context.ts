"use client";

/**
 * useLoopContextForNode — descubre, desde un nodo creativo, si está conectado
 * a un nodo Loop y resuelve el Dataset que Loop tiene de entrada.
 *
 * Topología (plantilla fuera):
 *   [Dataset] --dataset--> [Loop] <-- Image out -- [Image Creation]
 *
 * La resolución del Dataset se delega en `useDesignerConnectedDataset` (genérico:
 * resuelve el Dataset conectado a un nodo por el handle `dataset`). Aquí solo
 * añadimos el salto creativo → Loop. Si no hay Loop/Dataset, el nodo se
 * comporta como hoy.
 */

import { useCallback, useMemo } from "react";
import { useStore, type Edge, type Node, type ReactFlowState } from "@xyflow/react";
import { shallow } from "zustand/shallow";
import { useDesignerConnectedDataset } from "@/app/spaces/designer/use-designer-connected-dataset";
import type { Dataset, FieldDef } from "@/app/spaces/dataset/dataset-types";
import type { LoopNodeData } from "./loop-types";
import {
  isLoopTemplateLinkEdge,
  LOOP_TEMPLATE_TARGET_HANDLE,
} from "./loop-template-link";

export const LOOP_NODE_TYPE = "loop" as const;
/** @deprecated Use LOOP_TEMPLATE_TARGET_HANDLE */
export const LOOP_TEMPLATE_HANDLE = LOOP_TEMPLATE_TARGET_HANDLE;

/** Evento que SpacesContent escucha para depositar los nodos generados en el Nested Space. */
export const LOOP_COMMIT_EVENT = "foldder-loop-commit";

/**
 * Hook genérico: resuelve el Dataset conectado directamente a `nodeId` por el handle
 * `dataset`. Reutiliza la implementación de Designer (es independiente del tipo de nodo).
 */
export { useDesignerConnectedDataset as useConnectedDatasetForNode } from "@/app/spaces/designer/use-designer-connected-dataset";

function findLoopForCreative(
  state: ReactFlowState<Node, Edge>,
  creativeNodeId: string,
): Node | null {
  for (const edge of state.edges) {
    if (edge.source !== creativeNodeId) continue;
    const candidate = state.nodes.find(
      (n) =>
        n.id === edge.target &&
        (n.type === LOOP_NODE_TYPE || n.type === "populate"),
    );
    if (!candidate) continue;
    if (isLoopTemplateLinkEdge(edge, candidate.id, state.nodes.find((n) => n.id === creativeNodeId)?.type)) {
      return candidate;
    }
  }
  return null;
}

type LoopLink = { loopNodeId: string; listId: string | null } | null;

function selectLoopLink(
  state: ReactFlowState<Node, Edge>,
  creativeNodeId: string,
): LoopLink {
  const loopNode = findLoopForCreative(state, creativeNodeId);
  if (!loopNode) return null;
  const data = (loopNode.data ?? {}) as LoopNodeData;
  return { loopNodeId: loopNode.id, listId: data.listId ?? null };
}

export type LoopContextState = {
  /** Está conectado a un Loop. */
  loopConnected: boolean;
  loopNodeId: string | null;
  /** Dataset de entrada del Loop (resuelto inline o global). */
  dataset: Dataset | null;
  datasetLoading: boolean;
  /** Listado activo elegido en el Loop (o el primero por defecto). */
  listId: string | null;
  /** Schema del listado activo (para ofrecer columnas a los inputs). */
  schema: FieldDef[];
};

export function useLoopContextForNode(creativeNodeId: string): LoopContextState {
  const link = useStore(
    useCallback(
      (state: ReactFlowState<Node, Edge>) => selectLoopLink(state, creativeNodeId),
      [creativeNodeId],
    ),
    shallow,
  );

  const { connectedDataset, datasetLoading } = useDesignerConnectedDataset(
    link?.loopNodeId ?? "",
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
    loopConnected: !!link,
    loopNodeId: link?.loopNodeId ?? null,
    dataset,
    datasetLoading: link ? datasetLoading : false,
    listId,
    schema,
  };
}
