import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Edge, Node } from "@xyflow/react";

const UNDO_REDO_DEPTH = 10;

type SetGraph = Dispatch<SetStateAction<Node[]>>;

type GraphSnapshot = { nodes: Node[]; edges: Edge[] };

function graphFingerprint(nodes: Node[], edges: Edge[]): string {
  const nodePart = nodes
    .map((n) => `${n.id}:${Math.round(n.position.x)}:${Math.round(n.position.y)}:${n.type ?? ""}`)
    .sort()
    .join("|");
  const edgePart = edges
    .map((e) => `${e.id}:${e.source}:${e.target}:${e.sourceHandle ?? ""}:${e.targetHandle ?? ""}`)
    .sort()
    .join("|");
  return `${nodePart};;${edgePart}`;
}

function snapshotsEqual(a: GraphSnapshot, b: GraphSnapshot): boolean {
  return graphFingerprint(a.nodes, a.edges) === graphFingerprint(b.nodes, b.edges);
}

function cloneSnapshot(nodes: Node[], edges: Edge[]): GraphSnapshot {
  return { nodes: [...nodes], edges: [...edges] };
}

export function useSpacesUndoRedo(
  setNodes: SetGraph,
  setEdges: Dispatch<SetStateAction<Edge[]>>,
  liveNodesRef: MutableRefObject<Node[]>,
  liveEdgesRef: MutableRefObject<Edge[]>,
) {
  const historyRef = useRef<GraphSnapshot[]>([]);
  const futureRef = useRef<GraphSnapshot[]>([]);

  const takeSnapshot = useCallback(() => {
    const next = cloneSnapshot(liveNodesRef.current, liveEdgesRef.current);
    const last = historyRef.current[historyRef.current.length - 1];
    if (last && snapshotsEqual(last, next)) return;
    historyRef.current = [...historyRef.current.slice(-(UNDO_REDO_DEPTH - 1)), next];
    futureRef.current = [];
  }, [liveNodesRef, liveEdgesRef]);

  const undo = useCallback(() => {
    const current = cloneSnapshot(liveNodesRef.current, liveEdgesRef.current);
    while (historyRef.current.length > 0) {
      const prev = historyRef.current[historyRef.current.length - 1]!;
      if (snapshotsEqual(prev, current)) {
        historyRef.current.pop();
        continue;
      }
      futureRef.current.unshift(current);
      if (futureRef.current.length > UNDO_REDO_DEPTH) {
        futureRef.current.pop();
      }
      historyRef.current.pop();
      setNodes([...prev.nodes]);
      setEdges([...prev.edges]);
      return;
    }
  }, [setNodes, setEdges, liveNodesRef, liveEdgesRef]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    const current = cloneSnapshot(liveNodesRef.current, liveEdgesRef.current);
    const lastHistory = historyRef.current[historyRef.current.length - 1];
    if (!lastHistory || !snapshotsEqual(lastHistory, current)) {
      historyRef.current = [
        ...historyRef.current.slice(-(UNDO_REDO_DEPTH - 1)),
        current,
      ];
    }
    const next = futureRef.current.shift()!;
    setNodes([...next.nodes]);
    setEdges([...next.edges]);
  }, [setNodes, setEdges, liveNodesRef, liveEdgesRef]);

  return { takeSnapshot, undo, redo };
}
