"use client";

import { useMemo } from "react";
import { useNodesData, useStore, type Edge, type Node, type ReactFlowState } from "@xyflow/react";
import { shallow } from "zustand/shallow";
import { findBrandKitBrainEdge } from "../designer/use-designer-brandkit-connection";
import { getLiveStudioNodePatch } from "../studio-live-documents";
import {
  cineBrandFromBrandKitData,
  EMPTY_CINE_BRAND_PACK,
  type CineBrandPack,
} from "./cine-brandkit";

const MISSING_NODE = "__cine_brand_missing__";

export function useCineBrandKitRuntime(nodeId: string): CineBrandPack {
  const edge = useStore(
    (state: ReactFlowState<Node, Edge>) => findBrandKitBrainEdge(state, nodeId),
    shallow,
  );
  const source = useNodesData(edge?.source ?? MISSING_NODE);

  return useMemo(() => {
    if (!edge || source?.type !== "brandKit") return EMPTY_CINE_BRAND_PACK;
    const livePatch = getLiveStudioNodePatch(source.id);
    const data = {
      ...((source.data ?? {}) as Record<string, unknown>),
      ...(livePatch ?? {}),
    };
    const pack = cineBrandFromBrandKitData(data);
    if (!pack.enabled) {
      return {
        ...pack,
        connected: true,
        hints:
          pack.hints.length > 0
            ? pack.hints
            : ["BrandKit conectado — completa voz, esencia, mundo visual o logo"],
      };
    }
    return pack;
  }, [edge, source]);
}
