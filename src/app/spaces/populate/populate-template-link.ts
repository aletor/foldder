import type { Edge } from "@xyflow/react";
import {
  isValidPopulateSinkEdge,
  POPULATE_SINK_SOURCE_HANDLES,
  primarySinkSourceHandle,
} from "./pipeline/pipeline-bindings";
import { POPULATE_PIPELINE_EXECUTABLE_TYPES } from "./pipeline/populate-pipeline-sink-types";

export const POPULATE_TEMPLATE_TARGET_HANDLE = "template" as const;

/** Handles de salida del creativo que pueden cablear la plantilla de Populate. */
export const POPULATE_TEMPLATE_SOURCE_HANDLES = POPULATE_SINK_SOURCE_HANDLES;

function isPipelineSinkType(nodeType: string | undefined | null): boolean {
  if (!nodeType || !POPULATE_PIPELINE_EXECUTABLE_TYPES.has(nodeType)) return false;
  return isValidPopulateSinkEdge({
    sourceNodeType: nodeType,
    sourceHandle: primarySinkSourceHandle(nodeType),
    isPipelineExecutable: (t) => !!t && POPULATE_PIPELINE_EXECUTABLE_TYPES.has(t),
  });
}

export function isPopulateTemplateLinkEdge(
  edge: Pick<Edge, "source" | "target" | "sourceHandle" | "targetHandle">,
  populateId: string,
  sourceNodeType?: string | null,
): boolean {
  if (edge.target !== populateId || edge.targetHandle !== POPULATE_TEMPLATE_TARGET_HANDLE) {
    return false;
  }
  if (sourceNodeType === "space") {
    const sourceHandle = edge.sourceHandle ?? "media_list";
    return sourceHandle === "media_list" || sourceHandle === "out";
  }
  if (sourceNodeType != null && !isPipelineSinkType(sourceNodeType)) {
    return false;
  }
  const sourceHandle = edge.sourceHandle ?? primarySinkSourceHandle(sourceNodeType) ?? "image";
  return POPULATE_TEMPLATE_SOURCE_HANDLES.has(sourceHandle);
}

export function findPopulateTemplateLinkEdge(
  populateId: string,
  nodes: { id: string; type?: string }[],
  edges: Edge[],
): Edge | undefined {
  const templateSourceIds = new Set(
    nodes
      .filter((n) => isPipelineSinkType(n.type) || n.type === "space")
      .map((n) => n.id),
  );
  return edges.find((e) => {
    if (!templateSourceIds.has(e.source)) return false;
    const sourceType = nodes.find((n) => n.id === e.source)?.type;
    return isPopulateTemplateLinkEdge(e, populateId, sourceType);
  });
}
