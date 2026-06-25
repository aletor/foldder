/**
 * Lógica pura para trabajar con "flujos" del canvas: el conjunto de nodos conectados
 * consecutivamente (componente conexo, aristas tratadas como NO dirigidas) a un nodo dado.
 *
 * Se usa para:
 *  - "Seleccionar flujo completo" (menú contextual del nodo).
 *  - "Guardar flujo en Inspiración" (serializa el subgrafo).
 *  - Insertar un flujo guardado en el canvas (re-mapea ids).
 *
 * Sin dependencias de React/React Flow para poder testearlo de forma aislada.
 */

type EdgeLike = { source: string; target: string };
type NodeLike = { id: string };

/**
 * IDs de todos los nodos conectados (componente conexo) al nodo `startId`.
 * Las aristas se recorren en ambos sentidos: el flujo es "del primero al último".
 */
export function collectConnectedFlowNodeIds(
  startId: string,
  edges: readonly EdgeLike[],
): Set<string> {
  const adjacency = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    let set = adjacency.get(a);
    if (!set) {
      set = new Set<string>();
      adjacency.set(a, set);
    }
    set.add(b);
  };
  for (const edge of edges) {
    if (!edge || !edge.source || !edge.target) continue;
    link(edge.source, edge.target);
    link(edge.target, edge.source);
  }

  const visited = new Set<string>([startId]);
  const stack: string[] = [startId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    const neighbors = adjacency.get(id);
    if (!neighbors) continue;
    for (const next of neighbors) {
      if (!visited.has(next)) {
        visited.add(next);
        stack.push(next);
      }
    }
  }
  return visited;
}

/**
 * Extrae el subgrafo (nodos existentes + aristas internas) del flujo que contiene `startId`.
 * Ignora ids de aristas que apunten a nodos inexistentes.
 */
export function extractFlowSubgraph<N extends NodeLike, E extends EdgeLike>(
  startId: string,
  nodes: readonly N[],
  edges: readonly E[],
): { nodeIds: string[]; nodes: N[]; edges: E[] } {
  const reachable = collectConnectedFlowNodeIds(startId, edges);
  const subNodes = nodes.filter((n) => reachable.has(n.id));
  const presentIds = new Set(subNodes.map((n) => n.id));
  const subEdges = edges.filter((e) => presentIds.has(e.source) && presentIds.has(e.target));
  return { nodeIds: [...presentIds], nodes: subNodes, edges: subEdges };
}

type PositionedNode = {
  id: string;
  type?: string;
  position?: { x: number; y: number };
  data?: unknown;
  parentId?: string;
  [key: string]: unknown;
};

type GraphEdge = {
  id: string;
  source: string;
  target: string;
  [key: string]: unknown;
};

/**
 * Normaliza un subgrafo para guardarlo: posiciones relativas a la esquina superior-izquierda
 * del bounding box (top-left = 0,0) y limpieza de campos efímeros de UI.
 */
export function normalizeFlowForSave<N extends PositionedNode, E extends GraphEdge>(
  nodes: readonly N[],
  edges: readonly E[],
): { nodes: N[]; edges: E[] } {
  const minX = Math.min(...nodes.map((n) => n.position?.x ?? 0));
  const minY = Math.min(...nodes.map((n) => n.position?.y ?? 0));
  const baseX = Number.isFinite(minX) ? minX : 0;
  const baseY = Number.isFinite(minY) ? minY : 0;

  const cleanedNodes = nodes.map((n) => {
    const next = { ...n } as N & Record<string, unknown>;
    next.position = {
      x: (n.position?.x ?? 0) - baseX,
      y: (n.position?.y ?? 0) - baseY,
    };
    delete next.selected;
    delete next.dragging;
    delete next.resizing;
    delete next.measured;
    delete next.positionAbsolute;
    return next as N;
  });

  const cleanedEdges = edges.map((e) => {
    const next = { ...e } as E & Record<string, unknown>;
    delete next.selected;
    return next as E;
  });

  return { nodes: cleanedNodes, edges: cleanedEdges };
}

/**
 * Re-mapea un flujo guardado para insertarlo en el canvas: ids nuevos y únicos para nodos
 * (y aristas), posiciones desplazadas por `offset`, y `parentId` re-apuntado si el padre
 * también forma parte del flujo. Marca los nodos como seleccionados.
 */
export function remapInsertedFlow<N extends PositionedNode, E extends GraphEdge>(
  nodes: readonly N[],
  edges: readonly E[],
  options: { offset: { x: number; y: number } },
): { nodes: N[]; edges: E[] } {
  const base = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const idMap = new Map<string, string>();
  nodes.forEach((n, i) => {
    idMap.set(n.id, `${n.type ?? "node"}_${base}_${i}`);
  });

  const newNodes = nodes.map((n) => {
    const next: Record<string, unknown> = { ...(n as Record<string, unknown>) };
    next.id = idMap.get(n.id)!;
    next.position = {
      x: (n.position?.x ?? 0) + options.offset.x,
      y: (n.position?.y ?? 0) + options.offset.y,
    };
    if (n.parentId && idMap.has(n.parentId)) {
      next.parentId = idMap.get(n.parentId)!;
    } else if (n.parentId) {
      delete next.parentId;
    }
    next.selected = true;
    next.data = n.data && typeof n.data === "object" ? { ...(n.data as object) } : n.data;
    return next as unknown as N;
  });

  const newEdges = edges.map((e, i) => {
    const next: Record<string, unknown> = { ...(e as Record<string, unknown>) };
    next.id = `flowins_${base}_${i}`;
    next.source = idMap.get(e.source) ?? e.source;
    next.target = idMap.get(e.target) ?? e.target;
    next.selected = false;
    return next as unknown as E;
  });

  return { nodes: newNodes, edges: newEdges };
}
