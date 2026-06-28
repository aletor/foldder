import type { Node } from "@xyflow/react";

/** Desplazamiento visual máximo de las capas fantasma (translate + rotate). */
export const SPACE_NODE_GHOST_STACK_PX = 22;

/** Nested Space: arrastre desde todo el portal (no dragHandle — las capas fantasma son decorativas). */
export function normalizeSpaceNodeForRuntime<T extends Node>(node: T): T {
  if (node.type !== "space") return node;
  const { dragHandle: _dragHandle, ...rest } = node;
  return rest as T;
}
