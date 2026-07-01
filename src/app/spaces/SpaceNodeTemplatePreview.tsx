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
import { FoldderPreviewDeckStack } from "./studio-node/foldder-preview-deck-stack";

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
    <FoldderPreviewDeckStack layerCount={sources.length} className="space-node-template-stack">
      <FoldderTemplatePreviewGrid sources={sources} />
    </FoldderPreviewDeckStack>
  );
}
