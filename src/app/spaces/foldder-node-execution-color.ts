import { getNodeCardBackgroundColor, PROMPT_DEFAULT_CARD_BG } from "./node-card-palette";

type NodeLike = {
  type?: string;
  data?: unknown;
};

/** Color de identidad del tile para la animación de ejecución IA. */
export function resolveNodeExecutionColor(node: NodeLike | undefined): string {
  if (!node) return PROMPT_DEFAULT_CARD_BG;
  const data = node.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const cardBg = (data as { _foldderCardBg?: unknown })._foldderCardBg;
    if (typeof cardBg === "string" && cardBg.trim()) return cardBg.trim();
  }
  return getNodeCardBackgroundColor(node.type);
}
