import type { Node } from "@xyflow/react";

/** Proyectos antiguos guardaban el orquestador batch como type "populate" (ahora Loop). */
export function normalizeLegacyPopulateNodeType(node: Node): Node {
  if (node.type !== "populate") return node;
  const d = (node.data ?? {}) as Record<string, unknown>;
  if (d._populateKind === "assign") return node;
  if (Array.isArray(d.templateBindings)) return node;
  return { ...node, type: "loop" };
}

export function normalizeLegacyPopulateNodes(nodes: Node[]): Node[] {
  return nodes.map(normalizeLegacyPopulateNodeType);
}
