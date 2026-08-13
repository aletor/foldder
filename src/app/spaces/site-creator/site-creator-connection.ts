import type { Edge, Node } from "@xyflow/react";
import type { DesignerNodeData } from "../designer/DesignerNode";
import { walkDesignerObjectTree } from "../designer/designer-object-tree";
import { getPageDimensions } from "../indesign/page-formats";

export const SITE_CREATOR_DOCUMENT_INPUT_HANDLE = "document";
export const SITE_CREATOR_TEMPLATE_OUTPUT_HANDLE = "template";

export type SiteCreatorSourceStatus = "none" | "valid" | "needs_review";

export function designerPageCount(node: Node): number {
  if (node.type !== "designer") return 0;
  const pages = (node.data as DesignerNodeData)?.pages;
  return Array.isArray(pages) ? pages.length : 0;
}

export function countDesignerLayersFromNode(node: Node): number {
  if (node.type !== "designer") return 0;
  const pages = (node.data as DesignerNodeData)?.pages;
  if (!Array.isArray(pages) || pages.length !== 1) return 0;
  let count = 0;
  walkDesignerObjectTree(pages[0]!.objects, () => {
    count += 1;
  });
  return count;
}

export function findSiteCreatorDocumentEdge(
  siteCreatorId: string,
  edges: Pick<Edge, "source" | "target" | "targetHandle">[],
): Pick<Edge, "source" | "target" | "targetHandle"> | null {
  return (
    edges.find(
      (edge) =>
        edge.target === siteCreatorId &&
        (edge.targetHandle === SITE_CREATOR_DOCUMENT_INPUT_HANDLE || edge.targetHandle == null),
    ) ?? null
  );
}

export function isValidSiteCreatorDocumentConnection(
  sourceNode: Node,
  targetNode: Node,
  connection: { sourceHandle?: string | null; targetHandle?: string | null },
  edges?: Pick<Edge, "source" | "target" | "targetHandle" | "sourceHandle" | "id">[],
  options?: { ignoreEdgeId?: string },
): boolean {
  if (targetNode.type !== "siteCreator") return false;

  const targetHandle = connection.targetHandle ?? SITE_CREATOR_DOCUMENT_INPUT_HANDLE;
  if (targetHandle !== SITE_CREATOR_DOCUMENT_INPUT_HANDLE) return false;

  if (sourceNode.type !== "designer") return false;

  const sourceHandle = connection.sourceHandle ?? "document";
  if (sourceHandle !== "document") return false;

  if (designerPageCount(sourceNode) !== 1) return false;

  if (edges?.length) {
    const existing = edges.filter(
      (edge) =>
        edge.id !== options?.ignoreEdgeId &&
        edge.target === targetNode.id &&
        (edge.targetHandle === SITE_CREATOR_DOCUMENT_INPUT_HANDLE || edge.targetHandle == null),
    );
    if (existing.some((edge) => edge.source === sourceNode.id)) return true;
    if (existing.length > 0) return false;
  }

  return true;
}

export function resolveSiteCreatorSourceState(
  siteCreatorId: string,
  nodes: Node[],
  edges: Pick<Edge, "source" | "target" | "targetHandle">[],
): {
  status: SiteCreatorSourceStatus;
  designerNodeId: string | null;
  designerLabel: string | null;
  pageCount: number;
  layerCount: number;
  pageDimensions: { width: number; height: number } | null;
} {
  const documentEdge = findSiteCreatorDocumentEdge(siteCreatorId, edges);
  if (!documentEdge) {
    return {
      status: "none",
      designerNodeId: null,
      designerLabel: null,
      pageCount: 0,
      layerCount: 0,
      pageDimensions: null,
    };
  }

  const designerNode = nodes.find((node) => node.id === documentEdge.source);
  if (!designerNode || designerNode.type !== "designer") {
    return {
      status: "needs_review",
      designerNodeId: documentEdge.source,
      designerLabel: null,
      pageCount: 0,
      layerCount: 0,
      pageDimensions: null,
    };
  }

  const pageCount = designerPageCount(designerNode);
  const pages = (designerNode.data as DesignerNodeData)?.pages;
  const page = Array.isArray(pages) && pages.length === 1 ? pages[0]! : null;
  const pageDimensions = page ? getPageDimensions(page) : null;
  const layerCount = countDesignerLayersFromNode(designerNode);
  const designerLabel =
    typeof (designerNode.data as DesignerNodeData)?.label === "string"
      ? ((designerNode.data as DesignerNodeData).label as string).trim() || designerNode.id
      : designerNode.id;

  return {
    status: pageCount === 1 ? "valid" : "needs_review",
    designerNodeId: designerNode.id,
    designerLabel,
    pageCount,
    layerCount,
    pageDimensions,
  };
}
