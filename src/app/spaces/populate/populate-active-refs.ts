/**
 * Referencias de imagen ACTIVAS en el nodo creativo plantilla:
 * slots declarados que tienen un cable entrante con media resuelta.
 */

import type { Edge, Node } from "@xyflow/react";
import { resolveMediaUrlFromEdgeSource } from "@/app/spaces/resolve-connected-media-url";
import type { CreativeInputDescriptor } from "./populate-types";

export interface ActiveImageRef extends CreativeInputDescriptor {
  /** URL ya conectada en el grafo (semilla para modo "imagen fija"). */
  fixedUrl: string;
  /** Etiqueta legible del nodo fuente (p. ej. "Media Input"). */
  sourceLabel?: string;
}

/**
 * Devuelve solo los slots de imagen que tienen una conexión activa al nodo
 * plantilla. Populate actúa sobre estas refs, no sobre slots vacíos declarados.
 */
export function resolveActiveImageRefs(args: {
  templateNodeId: string;
  imageInputs: CreativeInputDescriptor[];
  nodes: Node[];
  edges: Edge[];
}): ActiveImageRef[] {
  const { templateNodeId, imageInputs, nodes, edges } = args;
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const active: ActiveImageRef[] = [];

  for (const slot of imageInputs) {
    const refEdge = edges.find(
      (e) => e.target === templateNodeId && e.targetHandle === slot.inputId,
    );
    if (!refEdge) continue;
    const url = resolveMediaUrlFromEdgeSource(refEdge, nodes, edges)?.trim();
    if (!url) continue;
    const sourceNode = nodesById.get(refEdge.source);
    const sourceData = (sourceNode?.data ?? {}) as Record<string, unknown>;
    const sourceLabel =
      (typeof sourceData.label === "string" && sourceData.label.trim()) ||
      sourceNode?.type ||
      undefined;
    active.push({
      ...slot,
      fixedUrl: url,
      sourceLabel,
    });
  }

  return active;
}

export function activeImageRefsSignature(refs: ActiveImageRef[]): string {
  return refs.map((r) => `${r.inputId}:${r.fixedUrl}`).join("|");
}
