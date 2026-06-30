import type { Edge } from "@xyflow/react";
import { isNodeCloneTemplateType } from "@/app/spaces/loop/loop-designer-template";

export const POPULATE_TEMPLATE_TARGET_HANDLE = "template" as const;

const DESIGNER_TEMPLATE_SOURCE_HANDLES = new Set(["document", "template"]);

export function isPopulateTemplateLinkEdge(
  edge: Pick<Edge, "source" | "target" | "sourceHandle" | "targetHandle">,
  populateId: string,
  sourceNodeType?: string | null,
): boolean {
  if (edge.target !== populateId || edge.targetHandle !== POPULATE_TEMPLATE_TARGET_HANDLE) {
    return false;
  }
  if (!isNodeCloneTemplateType(sourceNodeType)) return false;
  const sh = edge.sourceHandle ?? "document";
  return DESIGNER_TEMPLATE_SOURCE_HANDLES.has(sh);
}

export function findPopulateTemplateLinkEdges(
  populateId: string,
  nodes: { id: string; type?: string }[],
  edges: Edge[],
): Edge[] {
  return edges.filter((e) => {
    if (e.target !== populateId) return false;
    const sourceType = nodes.find((n) => n.id === e.source)?.type;
    return isPopulateTemplateLinkEdge(e, populateId, sourceType);
  });
}
