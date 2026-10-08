"use client";

import { useMemo } from "react";
import { useNodesData, useStore, type Edge, type Node, type ReactFlowState } from "@xyflow/react";
import { shallow } from "zustand/shallow";
import { findBrandKitBrainEdge } from "./designer/use-designer-brandkit-connection";
import { getLiveStudioNodePatch } from "./studio-live-documents";
import { guionistaBrainFromBrandKitData } from "./guionista-brandkit";
import type { GuionistaBrainContext } from "./guionista-types";

const MISSING_NODE = "__guionista_brand_missing__";

export type GuionistaBrandKitRuntime = {
  brainConnected: boolean;
  brainContext: GuionistaBrainContext;
  brainHints: string[];
};

export function useGuionistaBrandKitRuntime(nodeId: string): GuionistaBrandKitRuntime {
  const edge = useStore(
    (state: ReactFlowState<Node, Edge>) => findBrandKitBrainEdge(state, nodeId),
    shallow,
  );
  const source = useNodesData(edge?.source ?? MISSING_NODE);

  return useMemo(() => {
    if (!edge || source?.type !== "brandKit") {
      return {
        brainConnected: false,
        brainContext: { enabled: false },
        brainHints: [],
      };
    }

    const livePatch = getLiveStudioNodePatch(source.id);
    const data = {
      ...((source.data ?? {}) as Record<string, unknown>),
      ...(livePatch ?? {}),
    };
    const mapped = guionistaBrainFromBrandKitData(data);
    return {
      brainConnected: true,
      brainContext: mapped.context.enabled
        ? mapped.context
        : { ...mapped.context, enabled: true },
      brainHints:
        mapped.hints.length > 0
          ? mapped.hints
          : ["BrandKit conectado — completa voz y esencia para enriquecer el texto"],
    };
  }, [edge, source]);
}
