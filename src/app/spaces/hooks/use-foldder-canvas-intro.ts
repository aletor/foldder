import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { Edge, Node } from "@xyflow/react";
import { FOLDDER_CANVAS_INTRO_CLEAR_MS } from "../spaces-view-constants";
import { stripFoldderCanvasIntroFromNodeData } from "../spaces-canvas-intro";

export const FOLDDER_REGISTER_CANVAS_INTRO_EVENT = "foldder-register-canvas-intro";

type SetNodes = Dispatch<SetStateAction<Node[]>>;
type UpdateNodeInternals = (id: string) => void;

export function useFoldderCanvasIntro(
  nodes: Node[],
  setNodes: SetNodes,
  liveNodesRef: MutableRefObject<Node[]>,
  liveEdgesRef: MutableRefObject<Edge[]>,
  updateNodeInternals: UpdateNodeInternals,
) {
  const [activeIntroIds, setActiveIntroIds] = useState<ReadonlySet<string>>(() => new Set());
  const activeIntroIdsRef = useRef(activeIntroIds);
  /** Nodos que ya mostraron intro (o existían al cargar): nunca repetir animación. */
  const completedIntroIdsRef = useRef(new Set<string>());
  const introTimeoutsRef = useRef(new Map<string, number>());

  useEffect(() => {
    activeIntroIdsRef.current = activeIntroIds;
  }, [activeIntroIds]);

  const markCanvasNodesIntroCompleted = useCallback((nodeIds: Iterable<string>) => {
    let added = false;
    for (const id of nodeIds) {
      if (typeof id !== "string" || !id) continue;
      if (completedIntroIdsRef.current.has(id)) continue;
      completedIntroIdsRef.current.add(id);
      added = true;
      const pending = introTimeoutsRef.current.get(id);
      if (pending) {
        window.clearTimeout(pending);
        introTimeoutsRef.current.delete(id);
      }
    }
    if (!added) return;
    setActiveIntroIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of nodeIds) {
        if (typeof id !== "string" || !id || !next.has(id)) continue;
        next.delete(id);
        changed = true;
      }
      return changed ? next : prev;
    });
  }, []);

  const refreshIntroNodeInternals = useCallback(
    (nodeId: string) => {
      requestAnimationFrame(() => {
        updateNodeInternals(nodeId);
        for (const e of liveEdgesRef.current) {
          if (e.source === nodeId) updateNodeInternals(e.target);
          if (e.target === nodeId) updateNodeInternals(e.source);
        }
      });
    },
    [liveEdgesRef, updateNodeInternals],
  );

  const clearIntroFromNodeData = useCallback(
    (nodeId: string) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n;
          const nextData = stripFoldderCanvasIntroFromNodeData(n.data);
          if (nextData === n.data) return n;
          return { ...n, data: nextData };
        }),
      );
    },
    [setNodes],
  );

  const finishCanvasIntro = useCallback(
    (nodeId: string) => {
      introTimeoutsRef.current.delete(nodeId);
      completedIntroIdsRef.current.add(nodeId);
      setActiveIntroIds((prev) => {
        if (!prev.has(nodeId)) return prev;
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });
      clearIntroFromNodeData(nodeId);
      refreshIntroNodeInternals(nodeId);
    },
    [clearIntroFromNodeData, refreshIntroNodeInternals],
  );

  const scheduleFoldderCanvasIntroEnd = useCallback(
    (nodeId: string) => {
      if (!nodeId) return;
      if (completedIntroIdsRef.current.has(nodeId)) return;
      if (activeIntroIdsRef.current.has(nodeId)) return;

      setActiveIntroIds((prev) => {
        const next = new Set(prev);
        next.add(nodeId);
        return next;
      });

      const timeoutId = window.setTimeout(() => {
        finishCanvasIntro(nodeId);
      }, FOLDDER_CANVAS_INTRO_CLEAR_MS);

      introTimeoutsRef.current.set(nodeId, timeoutId);
    },
    [finishCanvasIntro],
  );

  const isNodeInCanvasIntro = useCallback(
    (nodeId: string) =>
      activeIntroIds.has(nodeId) && !completedIntroIdsRef.current.has(nodeId),
    [activeIntroIds],
  );

  useEffect(() => {
    const onRegister = (event: Event) => {
      const detail = (event as CustomEvent<{ nodeIds?: string[] }>).detail;
      const ids = Array.isArray(detail?.nodeIds) ? detail.nodeIds : [];
      for (const id of ids) {
        if (typeof id === "string" && id.length > 0) scheduleFoldderCanvasIntroEnd(id);
      }
    };
    window.addEventListener(FOLDDER_REGISTER_CANVAS_INTRO_EVENT, onRegister);
    return () => window.removeEventListener(FOLDDER_REGISTER_CANVAS_INTRO_EVENT, onRegister);
  }, [scheduleFoldderCanvasIntroEnd]);

  /** Flags huérfanos en `node.data`: limpiar y marcar como ya presentados. */
  useEffect(() => {
    const stuckIds = nodes
      .filter((n) => {
        const data = n.data as { _foldderCanvasIntro?: boolean } | undefined;
        return data?._foldderCanvasIntro && !activeIntroIdsRef.current.has(n.id);
      })
      .map((n) => n.id);
    if (stuckIds.length === 0) return;
    markCanvasNodesIntroCompleted(stuckIds);
    setNodes((nds) =>
      nds.map((n) => {
        if (!stuckIds.includes(n.id)) return n;
        const nextData = stripFoldderCanvasIntroFromNodeData(n.data);
        if (nextData === n.data) return n;
        return { ...n, data: nextData };
      }),
    );
  }, [markCanvasNodesIntroCompleted, nodes, setNodes]);

  /**
   * Durante el zoom CSS de intro, los handles se mueven frame a frame; React Flow no remide solo.
   */
  useEffect(() => {
    let rafId = 0;
    let stopped = false;

    const tick = () => {
      if (stopped) return;
      const introIds = Array.from(activeIntroIdsRef.current);
      if (introIds.length === 0) return;

      const refresh = new Set<string>(introIds);
      for (const e of liveEdgesRef.current) {
        if (introIds.includes(e.source)) {
          refresh.add(e.source);
          refresh.add(e.target);
        }
        if (introIds.includes(e.target)) {
          refresh.add(e.source);
          refresh.add(e.target);
        }
      }
      for (const id of refresh) updateNodeInternals(id);

      if (!stopped) rafId = requestAnimationFrame(tick);
    };

    if (activeIntroIds.size > 0) {
      rafId = requestAnimationFrame(tick);
    }

    return () => {
      stopped = true;
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [activeIntroIds, updateNodeInternals, liveEdgesRef]);

  useEffect(
    () => () => {
      for (const timeoutId of introTimeoutsRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      introTimeoutsRef.current.clear();
    },
    [],
  );

  return {
    scheduleFoldderCanvasIntroEnd,
    isNodeInCanvasIntro,
    activeIntroIds,
    markCanvasNodesIntroCompleted,
  };
}
