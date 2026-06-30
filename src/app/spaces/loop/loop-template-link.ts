import type { Edge } from "@xyflow/react";
import {
  isValidLoopSinkEdge,
  LOOP_SINK_SOURCE_HANDLES,
  primarySinkSourceHandle,
} from "./pipeline/pipeline-bindings";
import { LOOP_PIPELINE_EXECUTABLE_TYPES } from "./pipeline/loop-pipeline-sink-types";

export const LOOP_TEMPLATE_TARGET_HANDLE = "template" as const;

/** Handles de salida del creativo que pueden cablear la plantilla de Loop. */
export const LOOP_TEMPLATE_SOURCE_HANDLES = LOOP_SINK_SOURCE_HANDLES;

function isPipelineSinkType(nodeType: string | undefined | null): boolean {
  if (!nodeType || !LOOP_PIPELINE_EXECUTABLE_TYPES.has(nodeType)) return false;
  return isValidLoopSinkEdge({
    sourceNodeType: nodeType,
    sourceHandle: primarySinkSourceHandle(nodeType),
    isPipelineExecutable: (t) => !!t && LOOP_PIPELINE_EXECUTABLE_TYPES.has(t),
  });
}

export function isLoopTemplateLinkEdge(
  edge: Pick<Edge, "source" | "target" | "sourceHandle" | "targetHandle">,
  loopId: string,
  sourceNodeType?: string | null,
): boolean {
  if (edge.target !== loopId || edge.targetHandle !== LOOP_TEMPLATE_TARGET_HANDLE) {
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
  return LOOP_TEMPLATE_SOURCE_HANDLES.has(sourceHandle);
}

export function findLoopTemplateLinkEdge(
  loopId: string,
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
    return isLoopTemplateLinkEdge(e, loopId, sourceType);
  });
}
