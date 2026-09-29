"use client";

import { useMemo } from "react";
import { useNodesData, useStore, type Edge, type Node, type ReactFlowState } from "@xyflow/react";
import { shallow } from "zustand/shallow";
import { findBrandKitBrainEdge } from "../designer/use-designer-brandkit-connection";
import { writerBrandSnippet } from "./writer-brain";

const MISSING_NODE = "__writer_brand_missing__";

export function useWriterBrandSnippet(nodeId: string): string {
  const edge = useStore(
    (state: ReactFlowState<Node, Edge>) => findBrandKitBrainEdge(state, nodeId),
    shallow,
  );
  const source = useNodesData(edge?.source ?? MISSING_NODE);
  return useMemo(() => {
    if (!edge || source?.type !== "brandKit") return "";
    return writerBrandSnippet(source.data);
  }, [edge, source]);
}
