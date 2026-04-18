import type { Edge, Node } from '@xyflow/react';
import { NODE_REGISTRY } from './nodeRegistry';
import {
  parseCanvasGroupInHandle,
  parseCanvasGroupOutHandle,
} from './canvas-group-logic';

/**
 * Same rules as the canvas `isValidConnection` in page.tsx — kept pure for library-drop preview.
 */
export function areNodesConnectable(
  sourceNode: Node,
  targetNode: Node,
  connection: { sourceHandle?: string | null; targetHandle?: string | null },
  allNodes?: Node[]
): boolean {
  if (
    targetNode.type === 'canvasGroup' &&
    connection.targetHandle?.startsWith('g_in_') &&
    allNodes?.length
  ) {
    const p = parseCanvasGroupInHandle(connection.targetHandle);
    if (!p) return false;
    const inner = allNodes.find((n) => n.id === p.memberId);
    if (!inner) return false;
    return areNodesConnectable(
      sourceNode,
      inner,
      { ...connection, targetHandle: p.handleId },
      allNodes
    );
  }
  if (
    sourceNode.type === 'canvasGroup' &&
    connection.sourceHandle?.startsWith('g_out_') &&
    allNodes?.length
  ) {
    const p = parseCanvasGroupOutHandle(connection.sourceHandle);
    if (!p) return false;
    const inner = allNodes.find((n) => n.id === p.memberId);
    if (!inner) return false;
    return areNodesConnectable(
      inner,
      targetNode,
      { ...connection, sourceHandle: p.handleId },
      allNodes
    );
  }

  const sourceMetadata = NODE_REGISTRY[sourceNode.type as string];
  const targetMetadata = NODE_REGISTRY[targetNode.type as string];
  if (!sourceMetadata || !targetMetadata) return false;

  let sourceHandleType = sourceMetadata.outputs?.find((o) => o.id === connection.sourceHandle)?.type;

  if (sourceNode.type === 'space' && (sourceNode.data as { outputType?: string })?.outputType) {
    sourceHandleType = (sourceNode.data as { outputType?: string }).outputType as typeof sourceHandleType;
  }

  let targetHandleType = targetMetadata.inputs?.find((i) => i.id === connection.targetHandle)?.type;

  if (targetNode.type === 'space' && (targetNode.data as { inputType?: string })?.inputType) {
    targetHandleType = (targetNode.data as { inputType?: string }).inputType as typeof targetHandleType;
  }

  if (!sourceHandleType && sourceMetadata.outputs?.[0]) sourceHandleType = sourceMetadata.outputs[0].type;
  if (!targetHandleType && targetMetadata.inputs?.[0]) targetHandleType = targetMetadata.inputs[0].type;

  if (connection.targetHandle?.startsWith('layer-')) {
    targetHandleType = 'image';
  }

  if (
    (targetNode.type === 'concatenator' || targetNode.type === 'listado') &&
    connection.targetHandle?.startsWith('p')
  ) {
    targetHandleType = 'prompt';
  }

  if (sourceNode.type === 'mediaInput') {
    const actualType = (sourceNode.data as { type?: string })?.type;
    if (actualType === targetHandleType) return true;
  }

  if (connection.sourceHandle === 'rgba' && targetHandleType === 'image') return true;
  if (connection.sourceHandle === 'rgba' && targetHandleType === 'url') return true;

  if (sourceHandleType === 'url' || targetHandleType === 'url') return true;
  return sourceHandleType === targetHandleType;
}

const PHANTOM_ID = '__library_phantom__';

export type LibraryDropPlan = {
  direction: 'existing-to-new' | 'new-to-existing';
  sourceHandle: string;
  targetHandle: string;
};

/** Same keys as addNodeAtCenter in page.tsx — concrete handle ids for multi-input nodes. */
const MULTI_SLOT_NODES: Record<string, Record<string, string[]>> = {
  concatenator: { prompt: ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'] },
  listado: { prompt: ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'] },
  enhancer: {
    prompt: [
      'p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11', 'p12', 'p13', 'p14', 'p15',
    ],
  },
  imageComposer: {
    image: ['layer_0', 'layer_1', 'layer_2', 'layer_3', 'layer_4', 'layer_5', 'layer_6', 'layer_7'],
  },
  vfxGenerator: { prompt: ['prompt'] },
};

/** Orden de ranura en el nodo destino (p0 → 0, p1 → 1…). Desconocido → 0 y se desempata por posición. */
function targetHandleSlotIndex(nodeType: string, targetHandle: string | null | undefined): number {
  if (!targetHandle) return 999999;
  const multi = MULTI_SLOT_NODES[nodeType];
  if (multi) {
    for (const slots of Object.values(multi)) {
      const idx = slots.indexOf(targetHandle);
      if (idx !== -1) return idx;
    }
  }
  if (nodeType === 'nanoBanana') {
    const order = ['prompt', 'image', 'image2', 'image3', 'image4'];
    const idx = order.indexOf(targetHandle);
    if (idx !== -1) return idx;
  }
  return 0;
}

/**
 * Fuentes con arista hacia `targetId`, ordenadas por ranura en el destino (prompt 1 = p0, prompt 2 = p1, …)
 * y desempate por posición del nodo (y, luego x).
 */
export function orderedSourcesForSharedTarget(
  targetNodeType: string,
  targetId: string,
  edges: Pick<Edge, 'source' | 'target' | 'targetHandle'>[],
  nodes: Pick<Node, 'id' | 'position'>[]
): string[] {
  const list = edges.filter((e) => e.target === targetId);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  list.sort((a, b) => {
    const ka = targetHandleSlotIndex(targetNodeType, a.targetHandle);
    const kb = targetHandleSlotIndex(targetNodeType, b.targetHandle);
    if (ka !== kb) return ka - kb;
    const na = nodeById.get(a.source);
    const nb = nodeById.get(b.source);
    if (na && nb) {
      if (na.position.y !== nb.position.y) return na.position.y - nb.position.y;
      if (na.position.x !== nb.position.x) return na.position.x - nb.position.x;
    }
    return a.source.localeCompare(b.source);
  });
  const out: string[] = [];
  const seen = new Set<string>();
  for (const e of list) {
    if (seen.has(e.source)) continue;
    seen.add(e.source);
    out.push(e.source);
  }
  return out;
}

function concreteNewNodeInputHandle(newType: string, inpType: string, registryInpId: string): string {
  const slots = MULTI_SLOT_NODES[newType]?.[inpType];
  if (slots?.length) return slots[0];
  return registryInpId;
}

function firstFreeTargetHandleOnNode(
  nodeId: string,
  nodeType: string,
  inpType: string,
  registryInpId: string,
  edgeList: Pick<Edge, 'target' | 'targetHandle'>[]
): string | null {
  const slots = MULTI_SLOT_NODES[nodeType]?.[inpType];
  if (slots?.length) {
    for (const slotId of slots) {
      const taken = edgeList.some((e) => e.target === nodeId && e.targetHandle === slotId);
      if (!taken) return slotId;
    }
    return null;
  }
  const taken = edgeList.some((e) => e.target === nodeId && e.targetHandle === registryInpId);
  return taken ? null : registryInpId;
}

function sourceHandleIsFree(
  nodeId: string,
  sourceHandle: string,
  edgeList: Pick<Edge, 'source' | 'sourceHandle'>[]
): boolean {
  return !edgeList.some((e) => e.source === nodeId && e.sourceHandle === sourceHandle);
}

/** First compatible handle pair between an existing node and a node type being created from the library. */
export function findLibraryDropPlan(
  newType: string,
  existing: Node,
  edgeList?: Pick<Edge, 'source' | 'sourceHandle' | 'target' | 'targetHandle'>[]
): LibraryDropPlan | null {
  const newMeta = NODE_REGISTRY[newType];
  if (!newMeta) return null;

  const edges = edgeList ?? [];

  const existingOut = NODE_REGISTRY[existing.type as string]?.outputs ?? [];
  for (const out of existingOut) {
    for (const inp of newMeta.inputs) {
      const phantom: Node = {
        id: PHANTOM_ID,
        type: newType,
        position: { x: 0, y: 0 },
        data: newType === 'mediaInput' ? { type: out.type } : {},
      };
      if (
        areNodesConnectable(existing, phantom, {
          sourceHandle: out.id,
          targetHandle: inp.id,
        })
      ) {
        if (edges.length && !sourceHandleIsFree(existing.id, out.id, edges)) continue;

        const targetHandle = concreteNewNodeInputHandle(newType, inp.type, inp.id);
        return {
          direction: 'existing-to-new',
          sourceHandle: out.id,
          targetHandle,
        };
      }
    }
  }

  const phantomBase: Node = {
    id: PHANTOM_ID,
    type: newType,
    position: { x: 0, y: 0 },
    data: {},
  };

  const existingIn = NODE_REGISTRY[existing.type as string]?.inputs ?? [];
  for (const out of newMeta.outputs) {
    for (const inp of existingIn) {
      if (
        areNodesConnectable(phantomBase, existing, {
          sourceHandle: out.id,
          targetHandle: inp.id,
        })
      ) {
        const free = firstFreeTargetHandleOnNode(existing.id, existing.type as string, inp.type, inp.id, edges);
        if (!free) continue;

        return {
          direction: 'new-to-existing',
          sourceHandle: out.id,
          targetHandle: free,
        };
      }
    }
  }

  return null;
}

/** Approximate width for layout when React Flow has not measured the node yet. */
const DEFAULT_W: Record<string, number> = {
  mediaInput: 300,
  promptInput: 300,
  background: 320,
  urlImage: 340,
  imageComposer: 360,
  imageExport: 320,
  grokProcessor: 320,
  nanoBanana: 280,
  geminiVideo: 340,
  vfxGenerator: 340,
  space: 320,
  projectBrain: 260,
  projectAssets: 260,
};

export function estimateNodeWidth(node: Node): number {
  const w = (node as { width?: number; measured?: { width?: number } }).width
    ?? (node as { measured?: { width?: number } }).measured?.width;
  if (w && w > 0) return w;
  return DEFAULT_W[node.type as string] ?? 300;
}

export function estimateNodeHeight(node: Node): number {
  const h = (node as { height?: number; measured?: { height?: number } }).height
    ?? (node as { measured?: { height?: number } }).measured?.height;
  if (h && h > 0) return h;
  return 240;
}

function multiSlotInputTypeForHandle(
  nodeType: string,
  targetHandle: string | null | undefined
): string | null {
  if (!targetHandle) return null;
  const byType = MULTI_SLOT_NODES[nodeType];
  if (!byType) return null;
  for (const [inpType, ids] of Object.entries(byType)) {
    if (ids.includes(targetHandle)) return inpType;
  }
  return null;
}

/**
 * Duplicar un nodo cuya salida va a un target con varias ranuras del mismo tipo (concat, enhancer, composer):
 * coloca el clon justo debajo y enlaza a la siguiente ranura libre en el mismo target.
 */
export function planDuplicateBelowMultiInput(
  sourceNode: Node,
  allEdges: Pick<Edge, 'source' | 'sourceHandle' | 'target' | 'targetHandle'>[],
  allNodes: Node[]
): {
  targetId: string;
  sourceHandle: string;
  targetHandle: string;
  position: { x: number; y: number };
} | null {
  const outEdges = allEdges.filter((e) => e.source === sourceNode.id);
  const gap = 28;
  const h = estimateNodeHeight(sourceNode);
  const srcMeta = NODE_REGISTRY[sourceNode.type as string];

  for (const e of outEdges) {
    const targetNode = allNodes.find((n) => n.id === e.target);
    if (!targetNode?.type) continue;

    const tgtType = targetNode.type as string;
    const inpType = multiSlotInputTypeForHandle(tgtType, e.targetHandle);
    if (!inpType) continue;

    const slots = MULTI_SLOT_NODES[tgtType]?.[inpType];
    if (!slots?.length) continue;

    const meta = NODE_REGISTRY[tgtType];
    const regIn = meta?.inputs?.find((i) => i.type === inpType);
    const registryInpId = regIn?.id ?? inpType;

    const free = firstFreeTargetHandleOnNode(
      targetNode.id,
      tgtType,
      inpType,
      registryInpId,
      allEdges
    );
    if (!free) continue;

    const sourceHandle = e.sourceHandle ?? srcMeta?.outputs?.[0]?.id ?? 'prompt';

    return {
      targetId: targetNode.id,
      sourceHandle,
      targetHandle: free,
      position: { x: sourceNode.position.x, y: sourceNode.position.y + h + gap },
    };
  }

  return null;
}

/**
 * Busca posición top-left para un nodo nuevo sin solapar cajas aproximadas de los existentes.
 * Parte del mismo anclaje que addNodeAtCenter (centro − offset). Si el hueco preferido está ocupado,
 * explora primero hacia la derecha (misma fila), luego izquierda, luego filas arriba/abajo, y al final espiral.
 */
export function findEmptyPositionForNewNode(
  newType: string,
  nodeList: Node[],
  preferredCenter: { x: number; y: number }
): { x: number; y: number } {
  const nw = DEFAULT_W[newType] ?? 300;
  const nh = estimateNodeHeight({ type: newType } as Node);
  const margin = 36;

  function overlapsPlacement(px: number, py: number): boolean {
    for (const n of nodeList) {
      const w = estimateNodeWidth(n);
      const h = estimateNodeHeight(n);
      const nx = n.position.x;
      const ny = n.position.y;
      const noOverlap =
        px + nw + margin < nx ||
        px > nx + w + margin ||
        py + nh + margin < ny ||
        py > ny + h + margin;
      if (!noOverlap) return true;
    }
    return false;
  }

  const cx = preferredCenter.x;
  const cy = preferredCenter.y;
  const baseX = cx - 160;
  const baseY = cy - 120;

  if (!overlapsPlacement(baseX, baseY)) {
    return { x: baseX, y: baseY };
  }

  const stride = Math.max(40, Math.min(72, Math.round(nw * 0.22)));
  const maxHorizontalSteps = 220;

  for (let k = 1; k <= maxHorizontalSteps; k++) {
    const xr = baseX + k * stride;
    if (!overlapsPlacement(xr, baseY)) return { x: xr, y: baseY };
  }
  for (let k = 1; k <= maxHorizontalSteps; k++) {
    const xl = baseX - k * stride;
    if (!overlapsPlacement(xl, baseY)) return { x: xl, y: baseY };
  }

  const rowStride = Math.max(stride, Math.round(nh * 0.45));
  for (let row = 1; row <= 80; row++) {
    for (const sign of [1, -1] as const) {
      const yRow = baseY + sign * row * rowStride;
      if (!overlapsPlacement(baseX, yRow)) return { x: baseX, y: yRow };
      for (let k = 1; k <= maxHorizontalSteps; k++) {
        const xr = baseX + k * stride;
        if (!overlapsPlacement(xr, yRow)) return { x: xr, y: yRow };
      }
      for (let k = 1; k <= maxHorizontalSteps; k++) {
        const xl = baseX - k * stride;
        if (!overlapsPlacement(xl, yRow)) return { x: xl, y: yRow };
      }
    }
  }

  for (let i = 1; i < 6000; i++) {
    const angle = i * 0.3;
    const radius = Math.sqrt(i) * 38;
    const x = baseX + Math.cos(angle) * radius;
    const y = baseY + Math.sin(angle) * radius;
    if (!overlapsPlacement(x, y)) {
      return { x, y };
    }
  }

  return { x: baseX + 500, y: baseY + 500 };
}

/**
 * Centro preferido (misma convención que `findEmptyPositionForNewNode`: baseX = cx − 160, baseY = cy − 120)
 * para intentar colocar el nodo nuevo justo a la derecha del nodo más a la derecha del lienzo.
 * Si no hay nodos, devuelve null (usar centro del viewport en flujo).
 */
export function preferredCenterRightOfRightmostNode(
  nodeList: Node[],
  newType: string
): { x: number; y: number } | null {
  if (nodeList.length === 0) return null;
  const gap = 120;
  const nh = estimateNodeHeight({ type: newType } as Node);
  let bestRight = -Infinity;
  let anchor: Node | null = null;
  for (const n of nodeList) {
    const w = estimateNodeWidth(n);
    const r = n.position.x + w;
    if (r > bestRight) {
      bestRight = r;
      anchor = n;
    }
  }
  if (!anchor) return null;
  const ah = estimateNodeHeight(anchor);
  const baseX = bestRight + gap;
  const baseY = anchor.position.y + ah / 2 - nh / 2;
  return { x: baseX + 160, y: baseY + 120 };
}

/** Top-most node whose bounding box contains the flow point (last in array wins = drawn on top in RF). */
export function findTopNodeUnderFlowPoint(
  flowPoint: { x: number; y: number },
  nodeList: Node[],
  opts?: { excludeIds?: Set<string> }
): Node | null {
  for (let i = nodeList.length - 1; i >= 0; i--) {
    const n = nodeList[i];
    if (opts?.excludeIds?.has(n.id)) continue;
    const w = estimateNodeWidth(n);
    const h = estimateNodeHeight(n);
    const { x, y } = n.position;
    if (
      flowPoint.x >= x &&
      flowPoint.x <= x + w &&
      flowPoint.y >= y &&
      flowPoint.y <= y + h
    ) {
      return n;
    }
  }
  return null;
}

export function computeLibraryDropPosition(
  existing: Node,
  newType: string,
  plan: LibraryDropPlan
): { x: number; y: number } {
  // Space between the snapped new node and the node it connects to (flow units)
  const gap = 120;
  const ew = estimateNodeWidth(existing);
  const nw = DEFAULT_W[newType] ?? 300;

  if (plan.direction === 'existing-to-new') {
    return {
      x: existing.position.x + ew + gap,
      y: existing.position.y,
    };
  }

  return {
    x: existing.position.x - nw - gap,
    y: existing.position.y,
  };
}

/**
 * Coloca un nodo nuevo a la derecha del bloque formado por varias fuentes (mismo gap que library drop).
 * Centrado en vertical respecto al bounding box de las fuentes.
 */
export function positionNewNodeRightOfSources(
  sources: Node[],
  newType: string
): { x: number; y: number } {
  const gap = 120;
  const nh = estimateNodeHeight({ type: newType } as Node);
  if (sources.length === 0) {
    return { x: 0, y: 0 };
  }
  let maxRight = -Infinity;
  let minTop = Infinity;
  let maxBottom = -Infinity;
  for (const n of sources) {
    const w = estimateNodeWidth(n);
    const h = estimateNodeHeight(n);
    maxRight = Math.max(maxRight, n.position.x + w);
    minTop = Math.min(minTop, n.position.y);
    maxBottom = Math.max(maxBottom, n.position.y + h);
  }
  return {
    x: maxRight + gap,
    y: (minTop + maxBottom) / 2 - nh / 2,
  };
}
