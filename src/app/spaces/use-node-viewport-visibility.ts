"use client";

import { useCallback, useEffect, useState } from "react";
import { useStore, type Edge, type Node, type ReactFlowState } from "@xyflow/react";
import { useInputMode } from "./input-mode-context";
import { FOLDDER_CANVAS_PERFORMANCE_MODE_EVENT } from "./performance-events";
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

function useTouchCanvasGesturing(): boolean {
  const { isTouchUI } = useInputMode();
  const [gesturing, setGesturing] = useState(false);

  useEffect(() => {
    if (!isTouchUI) return;
    const onMode = (event: Event) => {
      const detail = (event as CustomEvent<{ active?: boolean }>).detail;
      setGesturing(Boolean(detail?.active));
    };
    window.addEventListener(FOLDDER_CANVAS_PERFORMANCE_MODE_EVENT, onMode);
    return () => window.removeEventListener(FOLDDER_CANVAS_PERFORMANCE_MODE_EVENT, onMode);
  }, [isTouchUI]);

  return isTouchUI && gesturing;
}

export function useNodeViewportVisibility(nodeId: string, marginPx = 800, selected = false): boolean {
  const { isTouchUI } = useInputMode();
  const canvasGesturing = useTouchCanvasGesturing();
  const effectiveMargin = isTouchUI ? FOLDDER_TOUCH_NODE_VISIBILITY_MARGIN_PX : marginPx;
  const inViewport = useStore(
    useCallback(
      (state: ReactFlowState<Node, Edge>) =>
        selectNodeViewportVisibility(state, nodeId, effectiveMargin),
      [effectiveMargin, nodeId],
    ),
  );

  if (!isTouchUI) return inViewport;
  if (canvasGesturing) return false;
  if (!selected) return false;
  return inViewport;
}
