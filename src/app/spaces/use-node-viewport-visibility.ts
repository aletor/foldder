"use client";

import { useCallback } from "react";
import { useStore, type Edge, type Node, type ReactFlowState } from "@xyflow/react";
import { useInputMode } from "./input-mode-context";
import { FOLDDER_TOUCH_NODE_VISIBILITY_MARGIN_PX } from "./touch-canvas-tool";

function selectNodeViewportVisibility(
  state: ReactFlowState<Node, Edge>,
  nodeId: string,
  marginPx: number,
): boolean {
  const node = state.nodeLookup.get(nodeId);
  if (!node) return true;

  const viewportWidth = typeof state.width === "number" ? state.width : 0;
  const viewportHeight = typeof state.height === "number" ? state.height : 0;
  if (viewportWidth <= 0 || viewportHeight <= 0) return true;

  const [tx, ty, zoom] = state.transform;
  const nodeWidth = node.width ?? node.measured?.width ?? 320;
  const nodeHeight = node.height ?? node.measured?.height ?? 240;
  const x = node.position.x * zoom + tx;
  const y = node.position.y * zoom + ty;
  const width = nodeWidth * zoom;
  const height = nodeHeight * zoom;
  const margin = Math.max(0, marginPx);

  return (
    x + width >= -margin &&
    x <= viewportWidth + margin &&
    y + height >= -margin &&
    y <= viewportHeight + margin
  );
}

export function useNodeViewportVisibility(nodeId: string, marginPx = 800): boolean {
  const { isTouchUI } = useInputMode();
  const effectiveMargin = isTouchUI ? Math.min(marginPx, FOLDDER_TOUCH_NODE_VISIBILITY_MARGIN_PX) : marginPx;
  return useStore(
    useCallback(
      (state: ReactFlowState<Node, Edge>) =>
        selectNodeViewportVisibility(state, nodeId, effectiveMargin),
      [effectiveMargin, nodeId],
    ),
  );
}
