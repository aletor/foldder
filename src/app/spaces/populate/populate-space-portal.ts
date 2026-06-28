/**
 * Populate — portal Nested Space en el lienzo padre.
 *
 * Tras un lote, aparece (o reutiliza) un nodo `space` a la derecha de Populate,
 * conectado por `out` → `in`. Si ya hay un space conectado, el siguiente bucle
 * reemplaza su contenido; si no, crea uno nuevo al lado.
 */

import type { Edge, Node } from "@xyflow/react";
import {
  FOLDDER_GRID_GAP,
  applyNodeGridPreset,
  foldderGridFrame,
  getNodeGridFrameForType,
  snapPositionToGrid,
} from "../canvas-grid-layout";
import { normalizeSpaceNodeForRuntime } from "../space-node-drag";

function parseStyleDimension(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/px/gi, "").trim());
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

function nodeCanvasDimensions(node: Node): { width: number; height: number } {
  const style = (node.style ?? {}) as Record<string, unknown>;
  const frame = getNodeGridFrameForType(node.type, node.data);
  return {
    width: parseStyleDimension(style.width) ?? frame?.width ?? 320,
    height: parseStyleDimension(style.height) ?? frame?.height ?? 240,
  };
}

/** Nodo `space` conectado en el grafo al Populate (por cualquier arista directa). */
export function findPopulateSpacePortalNode(
  populateNodeId: string,
  nodes: Node[],
  edges: Edge[],
): Node | null {
  for (const edge of edges) {
    if (edge.source !== populateNodeId && edge.target !== populateNodeId) continue;
    const otherId = edge.source === populateNodeId ? edge.target : edge.source;
    const other = nodes.find((n) => n.id === otherId);
    if (other?.type === "space") return other;
  }
  return null;
}

/** Coloca el portal a la derecha del nodo Populate, centrado verticalmente. */
export function computeSpacePortalPositionBeside(populateNode: Node): { x: number; y: number } {
  const pop = nodeCanvasDimensions(populateNode);
  const spaceFrame = getNodeGridFrameForType("space") ?? foldderGridFrame(3, 2);
  return snapPositionToGrid({
    x: populateNode.position.x + pop.width + FOLDDER_GRID_GAP,
    y: populateNode.position.y + Math.max(0, (pop.height - spaceFrame.height) / 2),
  });
}

export function internalCategoriesFromGeneratedNodes(nodes: Node[]): string[] {
  const categories = new Set<string>();
  for (const n of nodes) {
    const type = String(n.type || "").toLowerCase();
    if (type.includes("banana") || type.includes("image") || type.includes("media")) {
      categories.add("image");
    }
    if (type.includes("prompt") || type.includes("describer") || type.includes("enhancer")) {
      categories.add("prompt");
    }
    if (type.includes("video")) categories.add("video");
    if (type.includes("nano") || type.includes("grok") || type.includes("gemini")) {
      categories.add("ai");
    }
  }
  return Array.from(categories).slice(0, 5);
}

export function buildPopulateSpacePortalNode(args: {
  portalNodeId: string;
  spaceId: string;
  spaceName: string;
  populateNode: Node;
  internalCategories: string[];
}): Node {
  return normalizeSpaceNodeForRuntime(
    applyNodeGridPreset({
      id: args.portalNodeId,
      type: "space",
      position: computeSpacePortalPositionBeside(args.populateNode),
      data: {
        spaceId: args.spaceId,
        label: args.spaceName,
        hasInput: true,
        hasOutput: true,
        internalCategories: args.internalCategories,
      },
    }),
  );
}

export function buildPopulateToSpaceEdge(populateNodeId: string, spacePortalNodeId: string): Edge {
  return {
    id: `edge_populate_space_${populateNodeId}_${spacePortalNodeId}`,
    source: populateNodeId,
    sourceHandle: "out",
    target: spacePortalNodeId,
    targetHandle: "in",
  };
}

export function resolvePopulateCommitSpaceId(
  populateNodeId: string,
  existingPortal: Node | null,
): { spaceId: string; portalNodeId: string; isNewPortal: boolean } {
  if (existingPortal) {
    const spaceId = String(
      (existingPortal.data as { spaceId?: string })?.spaceId || `space_populate_${populateNodeId}`,
    );
    return { spaceId, portalNodeId: existingPortal.id, isNewPortal: false };
  }
  const stamp = Date.now();
  return {
    spaceId: `space_populate_${populateNodeId}_${stamp}`,
    portalNodeId: `node_space_pop_${populateNodeId}_${stamp}`,
    isNewPortal: true,
  };
}
