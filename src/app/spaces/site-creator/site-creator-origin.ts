import type { Node } from "@xyflow/react";
import { designerPageCount, findSiteCreatorDocumentEdge } from "./site-creator-connection";
import type { DesignerSourceSnapshotV1 } from "./site-creator-types";
import type { Edge } from "@xyflow/react";

export type SiteCreatorOriginState =
  | "no_source"
  | "preparing"
  | "synced"
  | "source_disconnected"
  | "different_source"
  | "incompatible_document";

export function siteCreatorOriginStateLabel(state: SiteCreatorOriginState): string {
  switch (state) {
    case "no_source":
      return "Sin origen";
    case "preparing":
      return "Preparando diseño";
    case "synced":
      return "Sincronizado";
    case "source_disconnected":
      return "Origen desconectado · usando copia guardada";
    case "different_source":
      return "Origen distinto · requiere revisión";
    case "incompatible_document":
      return "Documento incompatible";
    default:
      return "Sin origen";
  }
}

export function resolveSiteCreatorOriginState(args: {
  snapshot?: DesignerSourceSnapshotV1;
  documentEdge: Pick<Edge, "source"> | null;
  liveDesignerPageCount: number;
  isCapturing?: boolean;
}): SiteCreatorOriginState {
  const { snapshot, documentEdge, liveDesignerPageCount, isCapturing } = args;
  const edgeDesignerId = documentEdge?.source ?? null;

  if (isCapturing) return "preparing";

  if (!snapshot && !edgeDesignerId) return "no_source";

  if (!snapshot && edgeDesignerId) {
    if (liveDesignerPageCount === 0) return "incompatible_document";
    if (liveDesignerPageCount !== 1) return "incompatible_document";
    return "preparing";
  }

  if (snapshot && !edgeDesignerId) return "source_disconnected";

  if (snapshot && edgeDesignerId && snapshot.designerNodeId !== edgeDesignerId) {
    return "different_source";
  }

  if (edgeDesignerId && liveDesignerPageCount !== 0 && liveDesignerPageCount !== 1) {
    return "incompatible_document";
  }

  if (snapshot && edgeDesignerId && snapshot.designerNodeId === edgeDesignerId) {
    if (liveDesignerPageCount === 1) return "synced";
  }

  if (snapshot) return "source_disconnected";

  return "no_source";
}

/** @deprecated Prefer resolveSiteCreatorOriginState. */
export function resolveSiteCreatorOriginFromGraph(
  siteCreatorId: string,
  nodes: Node[],
  edges: Pick<Edge, "source" | "target" | "targetHandle">[],
  snapshot: DesignerSourceSnapshotV1 | undefined,
  isCapturing?: boolean,
): SiteCreatorOriginState {
  const documentEdge = findSiteCreatorDocumentEdge(siteCreatorId, edges);
  const liveDesignerNode = documentEdge
    ? (nodes.find((node) => node.id === documentEdge.source) ?? null)
    : null;
  const liveDesignerPageCount = liveDesignerNode ? designerPageCount(liveDesignerNode) : 0;
  return resolveSiteCreatorOriginState({
    snapshot,
    documentEdge,
    liveDesignerPageCount,
    isCapturing,
  });
}
