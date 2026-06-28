/**
 * Multi-canal Populate — composición de prompt por canal.
 *
 * El prompt del nodo Image Creator lleva la identidad compartida (persona, retrato, fondo…).
 * El `channelPrompt` de Populate es un delta fijo (p. ej. pose), idéntico en todas las filas.
 * Composición: `{nodePrompt}, {channelPrompt}` — sin override del nodo.
 */

import { getNodeOrchestrationDeclaration } from "./populate-declaration";
import type { ExecutorNode } from "./pipeline/node-executor";

/** Prompt inline del nodo creativo (p. ej. `promptText` en Image Creation). */
export function promptTextFromCreativeNode(node: ExecutorNode | undefined): string {
  if (!node?.type) return "";
  const data = (node.data ?? {}) as Record<string, unknown>;
  const declaration = getNodeOrchestrationDeclaration(node.type);
  const key = declaration.promptDataKey ?? "promptText";
  const raw = data[key];
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * Prompt efectivo de un canal: identidad del nodo + delta del canal.
 * Si `channelPrompt` está vacío, devuelve solo el prompt del nodo (sin composición).
 */
export function composeChannelEffectivePrompt(
  nodePrompt: string,
  channelPrompt?: string | null,
): string {
  const base = nodePrompt.trim();
  const delta = (channelPrompt ?? "").trim();
  if (!delta) return base;
  if (!base) return delta;
  return `${base}, ${delta}`;
}

export interface ChannelPromptParts {
  channelId: string;
  nodePrompt: string;
  channelPrompt?: string;
}

/** Mapa sinkId → prompt efectivo para el motor (`promptTemplatesByNodeId`). */
export function buildMultiChannelPromptTemplatesByNodeId(
  channels: readonly ChannelPromptParts[],
): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const ch of channels) {
    const effective = composeChannelEffectivePrompt(ch.nodePrompt, ch.channelPrompt);
    if (effective) out[ch.channelId] = effective;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
