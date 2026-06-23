import type { Edge, Node } from "@xyflow/react";

export type SpaceMapEntry = {
  id?: string;
  name?: string;
  nodes?: Node[];
  edges?: Edge[];
  [key: string]: unknown;
};

export type DissolveSpaceInput = {
  spaceId: string;
  parentSpaceId: string;
  spacesMap: Record<string, SpaceMapEntry>;
  innerNodes: Node[];
  innerEdges: Edge[];
};

export type DissolveSpaceResult = {
  spacesMap: Record<string, SpaceMapEntry>;
  parentNodes: Node[];
  parentEdges: Edge[];
  liftedNodeCount: number;
};

const PORTAL_TYPES = new Set(["spaceInput", "spaceOutput"]);

/** Asigna ids estables para nodos internos; renombra solo si chocan con el lienzo padre. */
function buildIdRemap(contentNodes: Node[], parentIds: Set<string>): Map<string, string> {
  const remap = new Map<string, string>();
  for (const n of contentNodes) {
    if (remap.has(n.id)) continue;
    if (parentIds.has(n.id)) {
      remap.set(n.id, `${n.id}_lift_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
    } else {
      remap.set(n.id, n.id);
    }
  }
  return remap;
}

function cloneEdge(
  edge: Edge,
  patch: Partial<Edge> & { id: string },
): Edge {
  return { ...edge, ...patch };
}

/**
 * Disuelve un space: saca los nodos internos al lienzo padre, elimina el nodo Space
 * y los portales spaceInput/spaceOutput, y puentea las conexiones externas.
 */
export function dissolveSpaceIntoParent(input: DissolveSpaceInput): DissolveSpaceResult | null {
  const { spaceId, parentSpaceId, spacesMap, innerNodes, innerEdges } = input;
  const parentSpace = spacesMap[parentSpaceId];
  if (!parentSpace?.nodes) return null;

  const parentNodes = [...parentSpace.nodes];
  const parentEdges = [...(parentSpace.edges || [])];
  const spaceNode = parentNodes.find(
    (n) => n.type === "space" && (n.data as { spaceId?: string })?.spaceId === spaceId,
  );
  if (!spaceNode) return null;

  const spaceInputNode = innerNodes.find((n) => n.type === "spaceInput");
  const spaceOutputNode = innerNodes.find((n) => n.type === "spaceOutput");
  const spaceInputId = spaceInputNode?.id;
  const spaceOutputId = spaceOutputNode?.id;
  const portalIds = new Set([spaceInputId, spaceOutputId].filter(Boolean) as string[]);

  const contentNodes = innerNodes.filter((n) => !PORTAL_TYPES.has(String(n.type)));
  if (contentNodes.length === 0) return null;

  const parentIds = new Set(parentNodes.map((n) => n.id));
  const idRemap = buildIdRemap(contentNodes, parentIds);
  const mapId = (id: string) => idRemap.get(id) ?? id;

  const minX = Math.min(...contentNodes.map((n) => n.position.x));
  const minY = Math.min(...contentNodes.map((n) => n.position.y));
  const offsetX = spaceNode.position.x - minX + 40;
  const offsetY = spaceNode.position.y - minY + 40;

  const liftedNodes: Node[] = contentNodes.map((n) => ({
    ...n,
    id: mapId(n.id),
    position: {
      x: n.position.x + offsetX,
      y: n.position.y + offsetY,
    },
    selected: false,
  }));

  const bridgedEdges: Edge[] = [];
  let edgeSeq = 0;
  const nextEdgeId = (prefix: string) => `dissolve_${prefix}_${Date.now()}_${edgeSeq++}`;

  if (spaceInputId) {
    const parentIncoming = parentEdges.filter(
      (e) => e.target === spaceNode.id && (e.targetHandle === "in" || e.targetHandle == null),
    );
    const innerFromInput = innerEdges.filter((e) => e.source === spaceInputId);
    for (const pe of parentIncoming) {
      for (const ie of innerFromInput) {
        bridgedEdges.push(
          cloneEdge(pe, {
            id: nextEdgeId("in"),
            target: mapId(ie.target),
            targetHandle: ie.targetHandle ?? null,
          }),
        );
      }
    }
  }

  if (spaceOutputId) {
    const parentOutgoing = parentEdges.filter(
      (e) => e.source === spaceNode.id && (e.sourceHandle === "out" || e.sourceHandle == null),
    );
    const innerToOutput = innerEdges.filter((e) => e.target === spaceOutputId);
    for (const po of parentOutgoing) {
      for (const ie of innerToOutput) {
        bridgedEdges.push(
          cloneEdge(po, {
            id: nextEdgeId("out"),
            source: mapId(ie.source),
            sourceHandle: ie.sourceHandle ?? null,
          }),
        );
      }
    }
  }

  const keptInnerEdges: Edge[] = innerEdges
    .filter((e) => !portalIds.has(e.source) && !portalIds.has(e.target))
    .map((e) =>
      cloneEdge(e, {
        id: nextEdgeId("keep"),
        source: mapId(e.source),
        target: mapId(e.target),
      }),
    );

  const parentEdgesWithoutSpace = parentEdges.filter(
    (e) => e.source !== spaceNode.id && e.target !== spaceNode.id,
  );

  const newParentNodes = parentNodes.filter((n) => n.id !== spaceNode.id).concat(liftedNodes);
  const newParentEdges = [...parentEdgesWithoutSpace, ...bridgedEdges, ...keptInnerEdges];

  const nextMap = { ...spacesMap };
  delete nextMap[spaceId];
  nextMap[parentSpaceId] = {
    ...parentSpace,
    nodes: newParentNodes,
    edges: newParentEdges,
    updatedAt: new Date().toISOString(),
  };

  return {
    spacesMap: nextMap,
    parentNodes: newParentNodes,
    parentEdges: newParentEdges,
    liftedNodeCount: liftedNodes.length,
  };
}

export function countDissolveLiftNodes(innerNodes: Node[]): number {
  return innerNodes.filter((n) => !PORTAL_TYPES.has(String(n.type))).length;
}
