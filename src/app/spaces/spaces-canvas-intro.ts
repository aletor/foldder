/** Runtime-only: no persistir; la animación se controla vía `useFoldderCanvasIntro`. */
export const FOLDDER_CANVAS_INTRO_DATA_KEY = "_foldderCanvasIntro";

/** Clases derivadas en `flowNodes`; nunca deben persistir en el estado del nodo. */
const EPHEMERAL_NODE_CLASS_NAMES = new Set([
  "foldder-node-canvas-intro",
  "foldder-node-ai-executing",
  "library-drop-compatible",
  "library-drop-highlight",
  "foldder-ctrl-overview-hover",
  "foldder-cards-front",
  "foldder-cards-intro-a",
  "foldder-cards-intro-b",
]);

export function stripEphemeralNodeClassNames(className: string | undefined): string | undefined {
  if (!className) return undefined;
  const kept = className
    .split(/\s+/)
    .filter(Boolean)
    .filter((part) => !EPHEMERAL_NODE_CLASS_NAMES.has(part));
  return kept.length > 0 ? kept.join(" ") : undefined;
}

export function stripFoldderCanvasIntroFromNodeData(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {};
  }
  if (!(FOLDDER_CANVAS_INTRO_DATA_KEY in (data as Record<string, unknown>))) {
    return data as Record<string, unknown>;
  }
  const { [FOLDDER_CANVAS_INTRO_DATA_KEY]: _drop, ...rest } = data as Record<string, unknown>;
  return rest;
}

/** Compat: ya no escribe en `node.data`; el caller debe llamar `scheduleFoldderCanvasIntroEnd(id)`. */
export function withFoldderCanvasIntro(
  nodeType: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (nodeType === "canvasGroup") return stripFoldderCanvasIntroFromNodeData(data);
  return stripFoldderCanvasIntroFromNodeData(data);
}
