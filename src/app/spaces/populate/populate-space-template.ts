import type { Edge, Node } from "@xyflow/react";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import { extractDesignerDynamicFields } from "@/app/spaces/loop/loop-designer-fields";
import { isNodeCloneTemplateType } from "@/app/spaces/loop/loop-designer-template";
import type { SpaceMapEntryLike } from "@/app/spaces/space-portal-loop-link";
import type { PopulateDesignerTemplateConfig } from "./populate-designer-template";
import { POPULATE_TEMPLATE_TARGET_HANDLE } from "./populate-template-link";

const DESIGNER_DOCUMENT_SOURCE_HANDLES = new Set(["document", "template"]);

export const POPULATE_SPACE_TEMPLATE_SOURCE_HANDLES = new Set(["out", "media_list"]);

export function populateSpaceTemplateNodeId(spacePortalId: string, innerDesignerId: string): string {
  return `${spacePortalId}::${innerDesignerId}`;
}

export function readPopulateSpaceInnerGraph(
  spacePortal: Pick<Node, "id" | "data">,
  spacesMap?: Record<string, SpaceMapEntryLike | undefined>,
): { nodes: Node[]; edges: Edge[] } | null {
  const data = (spacePortal.data ?? {}) as Record<string, unknown>;
  const spaceId = typeof data.spaceId === "string" ? data.spaceId.trim() : "";

  if (spaceId && spacesMap) {
    const entry = spacesMap[spaceId];
    if (entry?.nodes?.length) {
      return {
        nodes: entry.nodes.filter((n) => n.type !== "spaceInput" && n.type !== "spaceOutput"),
        edges: (entry.edges ?? []).filter((e) => e.source !== "in"),
      };
    }
  }

  const cachedNodes = data._foldderSpaceInnerNodes;
  const cachedEdges = data._foldderSpaceInnerEdges;
  if (Array.isArray(cachedNodes) && cachedNodes.length > 0) {
    return {
      nodes: cachedNodes as Node[],
      edges: Array.isArray(cachedEdges) ? (cachedEdges as Edge[]) : [],
    };
  }

  return null;
}

function sortInnerNodes(nodes: Node[]): Node[] {
  return [...nodes].sort((a, b) => {
    if (a.position.y !== b.position.y) return a.position.y - b.position.y;
    if (a.position.x !== b.position.x) return a.position.x - b.position.x;
    return String(a.id).localeCompare(String(b.id));
  });
}

/** Designers internos cableados al spaceOutput por handle Document. */
export function findDesignerNodesFeedingSpaceOutput(
  innerNodes: Node[],
  innerEdges: Edge[],
): Node[] {
  const outputNode =
    innerNodes.find((n) => n.type === "spaceOutput") ?? innerNodes.find((n) => n.id === "out");
  const outputIds = new Set<string>([outputNode?.id ?? "out"]);

  const incoming = innerEdges.filter(
    (e) => outputIds.has(e.target) && (e.targetHandle === "in" || e.targetHandle == null),
  );

  const designerIds = new Set<string>();
  for (const edge of incoming) {
    const src = innerNodes.find((n) => n.id === edge.source);
    if (!src || !isNodeCloneTemplateType(src.type)) continue;
    const sh = edge.sourceHandle ?? "document";
    if (DESIGNER_DOCUMENT_SOURCE_HANDLES.has(sh)) {
      designerIds.add(src.id);
    }
  }

  return sortInnerNodes(innerNodes.filter((n) => designerIds.has(n.id)));
}

export function isPopulateSpaceTemplateLinkEdge(
  edge: Pick<Edge, "source" | "target" | "sourceHandle" | "targetHandle">,
  populateId: string,
  sourceNodeType?: string | null,
): boolean {
  if (edge.target !== populateId || edge.targetHandle !== POPULATE_TEMPLATE_TARGET_HANDLE) {
    return false;
  }
  if (sourceNodeType !== "space") return false;
  const sh = edge.sourceHandle ?? "out";
  return POPULATE_SPACE_TEMPLATE_SOURCE_HANDLES.has(sh);
}

export function findPopulateSpaceTemplateLinkEdges(
  populateId: string,
  nodes: { id: string; type?: string }[],
  edges: Edge[],
): Edge[] {
  return edges.filter((e) => {
    if (e.target !== populateId) return false;
    const sourceType = nodes.find((n) => n.id === e.source)?.type;
    return isPopulateSpaceTemplateLinkEdge(e, populateId, sourceType);
  });
}

export function listPopulateDesignerTemplatesFromSpacePortal(
  spacePortal: Node,
  spacesMap?: Record<string, SpaceMapEntryLike | undefined>,
): PopulateDesignerTemplateConfig[] {
  const graph = readPopulateSpaceInnerGraph(spacePortal, spacesMap);
  if (!graph) return [];

  return findDesignerNodesFeedingSpaceOutput(graph.nodes, graph.edges).map((designer) => {
    const data = (designer.data ?? {}) as { label?: string; pages?: DesignerPageState[] };
    const pages = Array.isArray(data.pages) ? data.pages : [];
    return {
      templateNodeId: populateSpaceTemplateNodeId(spacePortal.id, designer.id),
      templateType: designer.type ?? "designer",
      templateLabel:
        typeof data.label === "string" && data.label.trim() ? data.label.trim() : "Designer",
      pages,
      dynamicFields: extractDesignerDynamicFields(pages),
    };
  });
}
