"use client";

import React, { useMemo } from "react";
import type { Node } from "@xyflow/react";
import { listPopulateDesignerTemplatesFromSpacePortal } from "./populate/populate-space-template";
import { reconcileSpacePortalNode } from "./space-media-list";
import { useSpacesMapCanvas } from "./spaces-map-canvas-context";
import {
  FoldderTemplatePreviewGrid,
  type FoldderTemplatePreviewSource,
} from "./studio-node/foldder-template-preview-grid";

export function SpaceNodeTemplatePreview({
  nodeId,
  nodeData,
}: {
  nodeId: string;
  nodeData: Record<string, unknown>;
}) {
  const spacesMap = useSpacesMapCanvas();

  const portalNode = useMemo(
    () =>
      reconcileSpacePortalNode(
        { id: nodeId, data: nodeData, type: "space", position: { x: 0, y: 0 } } as Node,
        spacesMap,
      ),
    [nodeData, nodeId, spacesMap],
  );

  const sources = useMemo<FoldderTemplatePreviewSource[]>(() => {
    return listPopulateDesignerTemplatesFromSpacePortal(portalNode, spacesMap).map((template) => ({
      id: template.templateNodeId,
      pages: template.pages,
      thumbUrl: template.previewThumbUrl,
    }));
  }, [portalNode, spacesMap]);

  if (sources.length === 0) return null;

  return (
    <>
      <FoldderTemplatePreviewGrid sources={sources} />
      <div className="space-node-template-summary nodrag pointer-events-none">
        <p className="space-node-template-summary__text">
          {sources.length} template{sources.length === 1 ? "" : "s"}
        </p>
      </div>
    </>
  );
}
