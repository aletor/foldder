/**
 * Loop — portal Nested Space en el lienzo padre.
 *
 * Tras un lote, aparece (o reutiliza) un nodo `space` a la derecha de Loop,
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

/** Nodo `space` conectado en el grafo al Loop (por cualquier arista directa). */
export function findLoopSpacePortalNode(
  loopNodeId: string,
  nodes: Node[],
  edges: Edge[],
): Node | null {
  for (const edge of edges) {
    if (edge.source !== loopNodeId && edge.target !== loopNodeId) continue;
    const otherId = edge.source === loopNodeId ? edge.target : edge.source;
    const other = nodes.find((n) => n.id === otherId);
    if (other?.type === "space") return other;
  }
  return null;
}

/** Coloca el portal a la derecha del nodo Loop, centrado verticalmente. */
export function computeSpacePortalPositionBeside(loopNode: Node): { x: number; y: number } {
  const pop = nodeCanvasDimensions(loopNode);
  const spaceFrame = getNodeGridFrameForType("space") ?? foldderGridFrame(3, 2);
  return snapPositionToGrid({
    x: loopNode.position.x + pop.width + FOLDDER_GRID_GAP,
    y: loopNode.position.y + Math.max(0, (pop.height - spaceFrame.height) / 2),
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

export function buildLoopSpacePortalNode(args: {
  portalNodeId: string;
  spaceId: string;
  spaceName: string;
  loopNode: Node;
  internalCategories: string[];
}): Node {
  return normalizeSpaceNodeForRuntime(
    applyNodeGridPreset({
      id: args.portalNodeId,
      type: "space",
      position: computeSpacePortalPositionBeside(args.loopNode),
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

export function buildLoopToSpaceEdge(loopNodeId: string, spacePortalNodeId: string): Edge {
  return {
    id: `edge_populate_space_${loopNodeId}_${spacePortalNodeId}`,
    source: loopNodeId,
    sourceHandle: "out",
    target: spacePortalNodeId,
    targetHandle: "in",
  };
}

export function resolveLoopCommitSpaceId(
  loopNodeId: string,
  existingPortal: Node | null,
): { spaceId: string; portalNodeId: string; isNewPortal: boolean } {
  if (existingPortal) {
    const spaceId = String(
      (existingPortal.data as { spaceId?: string })?.spaceId || `space_populate_${loopNodeId}`,
    );
    return { spaceId, portalNodeId: existingPortal.id, isNewPortal: false };
  }
  const stamp = Date.now();
  return {
    spaceId: `space_populate_${loopNodeId}_${stamp}`,
    portalNodeId: `node_space_pop_${loopNodeId}_${stamp}`,
    isNewPortal: true,
  };
}
