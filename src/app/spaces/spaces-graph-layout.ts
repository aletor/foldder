import type { Edge, Node } from "@xyflow/react";
import { nodeBoundsForLayout } from "./canvas-group-logic";

/** Ancho/alto efectivos para layout (medido, style, defaults; alineado con marcos de grupo). */
export function getNodeLayoutDimensions(n: Node): { w: number; h: number } {
  return nodeBoundsForLayout(n);
}

/** Componentes conexos (grafo no dirigido) restringidos a `nodeIds`. */
export function undirectedLayoutComponents(nodeIds: string[], edges: Edge[]): string[][] {
  const idSet = new Set(nodeIds);
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) adj.set(id, []);
  for (const e of edges) {
    if (!idSet.has(e.source) || !idSet.has(e.target)) continue;
    adj.get(e.source)!.push(e.target);
    adj.get(e.target)!.push(e.source);
  }
  const visited = new Set<string>();
  const out: string[][] = [];
  for (const id of nodeIds) {
    if (visited.has(id)) continue;
    const comp: string[] = [];
    const stack = [id];
    visited.add(id);
    while (stack.length) {
      const u = stack.pop()!;
      comp.push(u);
      for (const v of adj.get(u) || []) {
        if (!visited.has(v)) {
          visited.add(v);
          stack.push(v);
        }
      }
    }
    out.push(comp);
  }
  return out;
}

/**
 * Columnas por orden topológico (Kahn) dentro de un subconjunto de nodos.
 * Los nodos sueltos no deben mezclarse aquí: van en otra columna al margen.
 */
export function runKahnColumnLayout(
  toArrange: Node[],
  edges: Edge[],
  getDim: (n: Node) => { w: number; h: number },
  gap: number,
): Record<string, { x: number; y: number }> {
  const ids = new Set(toArrange.map((n) => n.id));
  const inCount: Record<string, number> = {};
  const children: Record<string, string[]> = {};
  for (const n of toArrange) {
    inCount[n.id] = 0;
    children[n.id] = [];
  }
  for (const e of edges) {
    if (ids.has(e.source) && ids.has(e.target)) {
      inCount[e.target] = (inCount[e.target] || 0) + 1;
      children[e.source].push(e.target);
    }
  }
  const col: Record<string, number> = {};
  let queue = toArrange.filter((n) => inCount[n.id] === 0).map((n) => n.id);
  queue.forEach((id) => {
    col[id] = 0;
  });
  while (queue.length) {
    const next: string[] = [];
    for (const nodeId of queue) {
      for (const childId of children[nodeId]) {
        col[childId] = Math.max(col[childId] ?? 0, (col[nodeId] ?? 0) + 1);
        inCount[childId]--;
        if (inCount[childId] === 0) next.push(childId);
      }
    }
    queue = next;
  }
  const maxCol = Math.max(0, ...Object.values(col));
  for (const n of toArrange) {
    if (col[n.id] === undefined) col[n.id] = maxCol + 1;
  }
  const maxColIndex = Math.max(0, ...toArrange.map((n) => col[n.id] ?? 0));
  const nodesByColumn: Record<number, Node[]> = {};
  for (let c = 0; c <= maxColIndex; c++) nodesByColumn[c] = [];
  for (const n of toArrange) {
    const c = col[n.id] ?? 0;
    nodesByColumn[c].push(n);
  }
  for (let c = 0; c <= maxColIndex; c++) {
    nodesByColumn[c].sort(
      (a, b) => a.position.y - b.position.y || String(a.id).localeCompare(String(b.id)),
    );
  }
  const positioned: Record<string, { x: number; y: number }> = {};
  let xCursor = 0;
  for (let c = 0; c <= maxColIndex; c++) {
    const list = nodesByColumn[c];
    if (!list.length) continue;
    const colMaxW = Math.max(...list.map((n) => getDim(n).w));
    const heights = list.map((n) => getDim(n).h);
    const totalH =
      heights.reduce((acc, h) => acc + h, 0) + (list.length > 1 ? (list.length - 1) * gap : 0);
    let yCursor = -totalH / 2;
    for (const n of list) {
      const { h } = getDim(n);
      positioned[n.id] = { x: xCursor, y: yCursor };
      yCursor += h + gap;
    }
    xCursor += colMaxW + gap;
  }
  return positioned;
}

/**
 * Tras centrar destinos multi-entrada (`alignMultiInputTargetsToSources`), empuja nodos hacia abajo
 * dentro de cada columna para eliminar solapes verticales.
 */
export function resolveVerticalOverlapsInColumns(
  positioned: Record<string, { x: number; y: number }>,
  nodes: Node[],
  getDim: (n: Node) => { w: number; h: number },
  gap: number,
): void {
  const buckets = new Map<number, Node[]>();
  for (const n of nodes) {
    const p = positioned[n.id];
    if (!p) continue;
    const key = Math.round(p.x);
    const list = buckets.get(key) ?? [];
    list.push(n);
    buckets.set(key, list);
  }
  for (const list of buckets.values()) {
    list.sort((a, b) => positioned[a.id]!.y - positioned[b.id]!.y);
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const cur = list[i];
      const prevBottom = positioned[prev.id]!.y + getDim(prev).h;
      const minY = prevBottom + gap;
      if (positioned[cur.id]!.y < minY) {
        positioned[cur.id] = { x: positioned[cur.id]!.x, y: minY };
      }
    }
  }
}

/**
 * Si un nodo tiene **varias** entradas desde el mismo subconjunto (p. ej. prompts → concatenador / listado),
 * desplaza su `y` para que su centro vertical coincida con el centro del bloque formado por los orígenes.
 */
export function alignMultiInputTargetsToSources(
  positioned: Record<string, { x: number; y: number }>,
  nodes: Node[],
  edges: Edge[],
  getDim: (n: Node) => { w: number; h: number },
): void {
  const idSet = new Set(nodes.map((n) => n.id));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const incoming = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!idSet.has(e.source) || !idSet.has(e.target)) continue;
    if (!incoming.has(e.target)) incoming.set(e.target, new Set());
    incoming.get(e.target)!.add(e.source);
  }
  for (const [targetId, srcSet] of incoming) {
    if (srcSet.size < 2) continue;
    let minTop = Infinity;
    let maxBottom = -Infinity;
    for (const sid of srcSet) {
      const p = positioned[sid];
      if (!p) continue;
      const sn = byId.get(sid);
      if (!sn) continue;
      const { h } = getDim(sn);
      minTop = Math.min(minTop, p.y);
      maxBottom = Math.max(maxBottom, p.y + h);
    }
    if (!Number.isFinite(minTop)) continue;
    const midY = (minTop + maxBottom) / 2;
    const tn = byId.get(targetId);
    if (!tn) continue;
    const { h: ht } = getDim(tn);
    const cur = positioned[targetId];
    if (!cur) continue;
    positioned[targetId] = { x: cur.x, y: midY - ht / 2 };
  }
}
