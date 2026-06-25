import type { Edge, Node } from "@xyflow/react";
import { NODE_REGISTRY } from "./nodeRegistry";
import type { SpaceMapEntry } from "./dissolve-space";
import {
  analyzeNestedSpaceStructure,
  buildMediaSinkToSpaceOutputEdges,
  collectMediaSinkInfos,
  detectSpaceOutputMode,
} from "./space-media-list";

export type GroupNodesIntoSpaceInput = {
  selectedNodes: Node[];
  edges: Edge[];
  allNodes: Node[];
  spaceId: string;
  spaceNodeId: string;
  /** Posición del nodo Space en el lienzo padre */
  spacePosition: { x: number; y: number };
};

export type GroupNodesIntoSpaceResult = {
  spaceEntry: SpaceMapEntry;
  spaceNode: Node;
  parentNodes: Node[];
  parentEdges: Edge[];
};

const reg = (t: string) => NODE_REGISTRY[t];

function pickRightmost(nodes: Node[]): Node {
  return nodes.reduce((prev, cur) =>
    cur.position.x > prev.position.x ||
    (cur.position.x === prev.position.x && cur.position.y > prev.position.y)
      ? cur
      : prev,
  );
}

function isSubgraphConnected(selectedIds: Set<string>, selectedNodes: Node[], internalEdges: Edge[]): boolean {
  if (selectedIds.size <= 1) return true;
  const adj = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a)!.push(b);
    adj.get(b)!.push(a);
  };
  internalEdges.forEach((e) => link(e.source, e.target));
  const start = selectedNodes[0].id;
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const nb of adj.get(id) || []) {
      if (selectedIds.has(nb) && !seen.has(nb)) stack.push(nb);
    }
  }
  return seen.size === selectedIds.size;
}

function resolveOutputHandle(
  nodeId: string,
  nodeType: string,
  edges: Edge[],
  selectedIds: Set<string>,
  internalEdges: Edge[],
): string | undefined {
  const extOut = edges.find((e) => e.source === nodeId && !selectedIds.has(e.target));
  if (extOut?.sourceHandle) return extOut.sourceHandle;

  const intOut = internalEdges.find((e) => e.source === nodeId);
  if (intOut?.sourceHandle) return intOut.sourceHandle;

  return reg(nodeType)?.outputs?.[0]?.id;
}

function resolveInputHandle(
  nodeId: string,
  nodeType: string,
  edges: Edge[],
  selectedIds: Set<string>,
): string | undefined {
  const extIn = edges.find((e) => e.target === nodeId && !selectedIds.has(e.source));
  if (extIn?.targetHandle) return extIn.targetHandle;

  return reg(nodeType)?.inputs?.[0]?.id;
}

/**
 * Agrupa nodos seleccionados en un space: mueve el subgrafo al interior,
 * crea portales Input/Output, conecta el sink al spaceOutput y puentea
 * conexiones externas al nodo Space del lienzo padre.
 */
export function groupNodesIntoSpace(input: GroupNodesIntoSpaceInput): GroupNodesIntoSpaceResult | null {
  const { selectedNodes, edges, allNodes, spaceId, spaceNodeId, spacePosition } = input;
  if (selectedNodes.length === 0) return null;

  const selectedIds = new Set(selectedNodes.map((n) => n.id));
  const internalEdges = edges.filter(
    (e) => selectedIds.has(e.source) && selectedIds.has(e.target),
  );
  const outgoingExternal = edges.filter(
    (e) => selectedIds.has(e.source) && !selectedIds.has(e.target),
  );
  const incomingExternal = edges.filter(
    (e) => !selectedIds.has(e.source) && selectedIds.has(e.target),
  );

  const connected = isSubgraphConnected(selectedIds, selectedNodes, internalEdges);

  const sinks = selectedNodes.filter(
    (n) => !internalEdges.some((e) => e.source === n.id && selectedIds.has(e.target)),
  );
  const sources = selectedNodes.filter(
    (n) => !internalEdges.some((e) => e.target === n.id && selectedIds.has(e.source)),
  );

  let includeSpaceInput = true;
  if (sources.length === 1) {
    if ((reg(String(sources[0].type))?.inputs?.length ?? 0) === 0) includeSpaceInput = false;
  } else if (sources.length > 1) {
    if (sources.every((s) => (reg(String(s.type))?.inputs?.length ?? 0) === 0)) includeSpaceInput = false;
  }
  if (incomingExternal.length > 0) includeSpaceInput = true;

  const minX = Math.min(...selectedNodes.map((n) => n.position.x));
  const minY = Math.min(...selectedNodes.map((n) => n.position.y));

  const nestedNodes: Node[] = selectedNodes.map((n) => ({
    ...n,
    position: {
      x: n.position.x - minX + 200,
      y: n.position.y - minY + 200,
    },
    selected: false,
  }));

  const sinksWithExternal = sinks.filter((s) =>
    outgoingExternal.some((e) => e.source === s.id),
  );

  let lastNode: Node;
  if (sinksWithExternal.length > 0) {
    const nested = sinksWithExternal
      .map((s) => nestedNodes.find((nn) => nn.id === s.id))
      .filter((n): n is Node => n != null);
    lastNode = pickRightmost(nested);
  } else if (connected && sinks.length > 0) {
    const nested = sinks
      .map((s) => nestedNodes.find((nn) => nn.id === s.id))
      .filter((n): n is Node => n != null);
    lastNode = pickRightmost(nested);
  } else {
    lastNode = pickRightmost(nestedNodes);
  }

  const lastNodeOutputHandle = resolveOutputHandle(
    lastNode.id,
    String(lastNode.type),
    edges,
    selectedIds,
    internalEdges,
  );

  let edgeSeq = 0;
  const nextEdgeId = (prefix: string) => `group_${prefix}_${Date.now()}_${edgeSeq++}`;

  const nestedInternalEdges: Edge[] = internalEdges.map((e) => ({
    ...e,
    id: nextEdgeId("nested"),
  }));

  const mediaSinkInfos = collectMediaSinkInfos(nestedNodes, nestedInternalEdges);
  const collectionMode = detectSpaceOutputMode(mediaSinkInfos) === "collection";

  const autoOutEdges: Edge[] = collectionMode
    ? buildMediaSinkToSpaceOutputEdges(
        mediaSinkInfos.map((s) => ({ nodeId: s.node.id, sourceHandle: s.sourceHandle })),
        "out",
        `group_${spaceId}`,
      )
    : lastNodeOutputHandle
      ? [
          {
            id: nextEdgeId("auto_out"),
            source: lastNode.id,
            sourceHandle: lastNodeOutputHandle,
            target: "out",
            targetHandle: "in",
            type: "buttonEdge",
            animated: false,
          },
        ]
      : [];

  const autoInEdges: Edge[] = [];
  if (includeSpaceInput) {
    for (const ext of incomingExternal) {
      const targetHandle =
        ext.targetHandle ??
        resolveInputHandle(ext.target, String(selectedNodes.find((n) => n.id === ext.target)?.type ?? ""), edges, selectedIds) ??
        null;
      autoInEdges.push({
        id: nextEdgeId("auto_in"),
        source: "in",
        sourceHandle: "out",
        target: ext.target,
        targetHandle,
        type: "buttonEdge",
        animated: false,
      });
    }
  }

  const allInternalEdges = [...nestedInternalEdges, ...autoOutEdges, ...autoInEdges];

  const virtualOutNode: Node = { id: "out", type: "spaceOutput", position: { x: 0, y: 0 }, data: {} };
  const structure = analyzeNestedSpaceStructure(
    [...nestedNodes, virtualOutNode],
    allInternalEdges,
    { spaceId, spaceName: "Grouped Space" },
  );

  const autoOutputType = structure.type;
  const autoOutputValue = structure.value;

  const maxNestedX = Math.max(...nestedNodes.map((n) => n.position.x));

  const innerNodes: Node[] = [];
  if (includeSpaceInput) {
    innerNodes.push({
      id: "in",
      type: "spaceInput",
      position: { x: 50, y: 250 },
      data: { label: "Input" },
    });
  }
  innerNodes.push({
    id: "out",
    type: "spaceOutput",
    position: {
      x: maxNestedX + 320,
      y: lastNode.position.y,
    },
    data: { label: "Output", outputType: autoOutputType },
  });
  innerNodes.push(...nestedNodes);

  const spaceEntry: SpaceMapEntry = {
    id: spaceId,
    name: "Grouped Space",
    nodes: innerNodes,
    edges: allInternalEdges,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    outputType: autoOutputType,
    outputValue: autoOutputValue,
    mediaListOutput: structure.mediaListOutput ?? undefined,
    hasInput: includeSpaceInput,
    hasOutput: true,
    internalCategories: structure.internalCategories,
  };

  const spaceNode: Node = {
    id: spaceNodeId,
    type: "space",
    position: spacePosition,
    data: {
      spaceId,
      label: structure.label || "Nested Group",
      hasInput: includeSpaceInput,
      hasOutput: true,
      outputType: autoOutputType,
      value: autoOutputValue,
      mediaListOutput: structure.mediaListOutput ?? undefined,
      internalCategories: structure.internalCategories,
    },
  };

  const remainingNodes = allNodes.filter((n) => !selectedIds.has(n.id));
  const remainingEdges = edges.filter(
    (e) => !selectedIds.has(e.source) && !selectedIds.has(e.target),
  );

  const bridgedEdges: Edge[] = [];
  const bridgeSourceHandle = collectionMode ? "media_list" : "out";
  for (const ext of outgoingExternal) {
    if (!collectionMode && ext.source !== lastNode.id) continue;
    bridgedEdges.push({
      ...ext,
      id: nextEdgeId("bridge_out"),
      source: spaceNodeId,
      sourceHandle: bridgeSourceHandle,
    });
  }
  for (const ext of incomingExternal) {
    bridgedEdges.push({
      ...ext,
      id: nextEdgeId("bridge_in"),
      target: spaceNodeId,
      targetHandle: "in",
    });
  }

  return {
    spaceEntry,
    spaceNode,
    parentNodes: [...remainingNodes, spaceNode],
    parentEdges: [...remainingEdges, ...bridgedEdges],
  };
}
