import { useCallback } from "react";
import type { Node } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import { FOLDDER_FIT_VIEW_EASE } from "@/lib/fit-view-ease";
import { fitAnim, FIT_VIEW_PADDING_NODE_FOCUS } from "../spaces-view-constants";
import { useInputMode } from "../input-mode-context";

/** Encuadra solo los nodos indicados (normalmente uno: el recién añadido), sin fit a todo el grafo */
export function useSpacesFitViewToNodeIds() {
  const { fitView } = useReactFlow();
  const { isTouchUI } = useInputMode();

  const fitViewToNodeIds = useCallback(
    (ids: string[], duration = 650, options?: { padding?: number }) => {
      const unique = [...new Set(ids.filter(Boolean))];
      if (unique.length === 0) return;
      const d = isTouchUI ? 0 : fitAnim(duration);
      const padding = options?.padding ?? FIT_VIEW_PADDING_NODE_FOCUS;
      setTimeout(() => {
        void fitView({
          nodes: unique.map((id) => ({ id })) as Node[],
          padding,
          duration: d,
          interpolate: isTouchUI ? "linear" : "smooth",
          ...FOLDDER_FIT_VIEW_EASE,
        });
      }, isTouchUI ? 0 : 60);
    },
    [fitView, isTouchUI],
  );

  return fitViewToNodeIds;
}
