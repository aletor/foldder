import { useCallback, useRef } from "react";
import type { Node } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import { FOLDDER_FIT_VIEW_EASE } from "@/lib/fit-view-ease";
import { fitAnim, FIT_VIEW_PADDING_NODE_FOCUS } from "../spaces-view-constants";
import { useInputMode } from "../input-mode-context";

const FIT_VIEW_TO_NODES_DEBOUNCE_MS = 480;

/** Encuadra solo los nodos indicados (normalmente uno: el recién añadido), sin fit a todo el grafo */
export function useSpacesFitViewToNodeIds() {
  const { fitView } = useReactFlow();
  const { isTouchUI } = useInputMode();
  const pendingTimeoutRef = useRef<number | null>(null);
  const lastFitRef = useRef<{ key: string; at: number } | null>(null);

  const fitViewToNodeIds = useCallback(
    (ids: string[], duration = 650, options?: { padding?: number }) => {
      const unique = [...new Set(ids.filter(Boolean))];
      if (unique.length === 0) return;
      const key = unique.slice().sort().join("\u0001");
      const now = Date.now();
      const last = lastFitRef.current;
      if (last && last.key === key && now - last.at < FIT_VIEW_TO_NODES_DEBOUNCE_MS) return;
      lastFitRef.current = { key, at: now };

      if (pendingTimeoutRef.current != null) {
        window.clearTimeout(pendingTimeoutRef.current);
      }

      const d = isTouchUI ? 0 : fitAnim(duration);
      const padding = options?.padding ?? FIT_VIEW_PADDING_NODE_FOCUS;
      pendingTimeoutRef.current = window.setTimeout(() => {
        pendingTimeoutRef.current = null;
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
