"use client";

import { useMemo } from "react";
import { useNodesData, useStore, type Edge, type Node, type ReactFlowState } from "@xyflow/react";
import { shallow } from "zustand/shallow";
import { findBrandKitBrainEdge } from "../designer/use-designer-brandkit-connection";
import { getLiveStudioNodePatch } from "../studio-live-documents";
import { imageCreatorBrandFromBrandKitData, type ImageCreatorBrandPack } from "./image-creator-brandkit";

const MISSING_NODE = "__image_creator_brand_missing__";

const EMPTY: ImageCreatorBrandPack = { connected: false, styleBlock: "", styleImageUrls: [] };

export function useImageCreatorBrandKit(nodeId: string): ImageCreatorBrandPack {
  const edge = useStore(
    (state: ReactFlowState<Node, Edge>) => findBrandKitBrainEdge(state, nodeId),
    shallow,
  );
  const source = useNodesData(edge?.source ?? MISSING_NODE);

  return useMemo(() => {
    if (!edge || source?.type !== "brandKit") return EMPTY;
    const livePatch = getLiveStudioNodePatch(source.id);
    const data = {
      ...((source.data ?? {}) as Record<string, unknown>),
      ...(livePatch ?? {}),
    };
    return imageCreatorBrandFromBrandKitData(data);
  }, [edge, source]);
}
