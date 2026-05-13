import type { Edge, Node, ReactFlowState } from "@xyflow/react";

export type NodeFrameSnapshot = {
  width?: number;
  height?: number;
  measuredWidth?: number;
  measuredHeight?: number;
  styleWidth?: string | number;
  styleHeight?: string | number;
};

export const EMPTY_NODE_FRAME: NodeFrameSnapshot = {};

export function selectNodeFrameSnapshot(
  state: ReactFlowState<Node, Edge>,
  nodeId: string,
): NodeFrameSnapshot {
  const node = state.nodeLookup.get(nodeId);
  if (!node) return EMPTY_NODE_FRAME;
  const style = node.style as { width?: string | number; height?: string | number } | undefined;
  return {
    width: typeof node.width === "number" ? node.width : undefined,
    height: typeof node.height === "number" ? node.height : undefined,
    measuredWidth: typeof node.measured?.width === "number" ? node.measured.width : undefined,
    measuredHeight: typeof node.measured?.height === "number" ? node.measured.height : undefined,
    styleWidth: style?.width,
    styleHeight: style?.height,
  };
}

export function nodeFrameFromSnapshot(
  snapshot: NodeFrameSnapshot,
): Pick<Node, "width" | "height" | "measured" | "style"> {
  return {
    width: snapshot.width,
    height: snapshot.height,
    measured: {
      width: snapshot.measuredWidth,
      height: snapshot.measuredHeight,
    },
    style: {
      width: snapshot.styleWidth,
      height: snapshot.styleHeight,
    },
  };
}

export function selectNodeById(state: ReactFlowState<Node, Edge>, nodeId: string): Node | undefined {
  return state.nodeLookup.get(nodeId);
}
