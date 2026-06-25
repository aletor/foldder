import type { Edge } from "@xyflow/react";
import { ORCHESTRABLE_CREATIVE_TYPES } from "@/app/spaces/connection-utils";

export const POPULATE_TEMPLATE_TARGET_HANDLE = "template" as const;

/** Handles de salida del creativo que pueden cablear la plantilla de Populate. */
export const POPULATE_TEMPLATE_SOURCE_HANDLES = new Set(["image", "template", "document"]);

function isOrchestrableCreativeType(nodeType: string | undefined | null): boolean {
  return !!nodeType && ORCHESTRABLE_CREATIVE_TYPES.has(nodeType);
}

export function isPopulateTemplateLinkEdge(
  edge: Pick<Edge, "source" | "target" | "sourceHandle" | "targetHandle">,
  populateId: string,
  sourceNodeType?: string | null,
): boolean {
  if (edge.target !== populateId || edge.targetHandle !== POPULATE_TEMPLATE_TARGET_HANDLE) {
    return false;
  }
  if (sourceNodeType != null && !isOrchestrableCreativeType(sourceNodeType)) {
    return false;
  }
  const sourceHandle = edge.sourceHandle ?? "image";
  return POPULATE_TEMPLATE_SOURCE_HANDLES.has(sourceHandle);
}

export function findPopulateTemplateLinkEdge(
  populateId: string,
  nodes: { id: string; type?: string }[],
  edges: Edge[],
): Edge | undefined {
  const orchestrableIds = new Set(
    nodes.filter((n) => isOrchestrableCreativeType(n.type)).map((n) => n.id),
  );
  return edges.find(
    (e) => isPopulateTemplateLinkEdge(e, populateId) && orchestrableIds.has(e.source),
  );
}
