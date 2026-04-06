import type { Edge, Node } from '@xyflow/react';
import { NODE_REGISTRY } from './nodeRegistry';

/**
 * Same rules as the canvas `isValidConnection` in page.tsx — kept pure for library-drop preview.
 */
export function areNodesConnectable(
  sourceNode: Node,
  targetNode: Node,
  connection: { sourceHandle?: string | null; targetHandle?: string | null }
): boolean {
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

  if (targetNode.type === 'concatenator' && connection.targetHandle?.startsWith('p')) {
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
  enhancer: {
    prompt: [
      'p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11', 'p12', 'p13', 'p14', 'p15',
    ],
  },
  imageComposer: {
    image: ['layer_0', 'layer_1', 'layer_2', 'layer_3', 'layer_4', 'layer_5', 'layer_6', 'layer_7'],
  },
};

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
  space: 320,
  finalOutput: 1,
};

export function estimateNodeWidth(node: Node): number {
  const w = (node as { width?: number; measured?: { width?: number } }).width
    ?? (node as { measured?: { width?: number } }).measured?.width;
  if (w && w > 0) return w;
  return DEFAULT_W[node.type as string] ?? 300;
}

function estimateNodeHeight(node: Node): number {
  const h = (node as { height?: number; measured?: { height?: number } }).height
    ?? (node as { measured?: { height?: number } }).measured?.height;
  if (h && h > 0) return h;
  return 240;
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
