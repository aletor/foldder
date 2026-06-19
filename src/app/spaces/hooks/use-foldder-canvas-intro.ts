import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { Edge, Node } from "@xyflow/react";

export const FOLDDER_REGISTER_CANVAS_INTRO_EVENT = "foldder-register-canvas-intro";

type SetNodes = Dispatch<SetStateAction<Node[]>>;
type UpdateNodeInternals = (id: string) => void;

const EMPTY_INTRO_IDS = new Set<string>() as ReadonlySet<string>;

export function useFoldderCanvasIntro(
  _nodes: Node[],
  _setNodes: SetNodes,
  _liveNodesRef: MutableRefObject<Node[]>,
  _liveEdgesRef: MutableRefObject<Edge[]>,
  _updateNodeInternals: UpdateNodeInternals,
) {
  const scheduleFoldderCanvasIntroEnd = useCallback((_nodeId: string) => {}, []);
  const markCanvasNodesIntroCompleted = useCallback((_nodeIds: Iterable<string>) => {}, []);
  const isNodeInCanvasIntro = useCallback((_nodeId: string) => false, []);

  return {
    scheduleFoldderCanvasIntroEnd,
    isNodeInCanvasIntro,
    activeIntroIds: EMPTY_INTRO_IDS,
    markCanvasNodesIntroCompleted,
  };
}
