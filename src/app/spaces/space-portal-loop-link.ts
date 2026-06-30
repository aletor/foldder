/**
 * Nested Space portal ↔ Loop — resolución de plantilla interna y reglas de cableado.
 */

import type { Edge, Node } from "@xyflow/react";
import { collectMediaSinkInfos } from "./space-media-list";
import {
  isValidLoopSinkEdge,
  LOOP_SINK_TARGET_HANDLE,
  primarySinkSourceHandle,
} from "./loop/pipeline/pipeline-bindings";
import { LOOP_PIPELINE_EXECUTABLE_TYPES } from "./loop/pipeline/loop-pipeline-sink-types";

export type SpaceMapEntryLike = {
  nodes?: Node[];
  edges?: Edge[];
  name?: string;
};

export type SpacePortalInnerTemplate = {
  innerNodeId: string;
  nodeType: string;
  sourceHandle: string;
  label: string;
  nodeData: Record<string, unknown>;
};

export const SPACE_PORTAL_TEMPLATE_DATA_KEYS = {
  innerNodeId: "_foldderSpaceTemplateInnerId",
  nodeType: "_foldderSpaceTemplateType",
  sourceHandle: "_foldderSpaceTemplateHandle",
  label: "_foldderSpaceTemplateLabel",
} as const;

/** Reconstruye un subgrafo {nodes, edges} desde el snapshot cacheado en `data` del portal. */
function entryFromInnerCache(
  data: Record<string, unknown>,
): SpaceMapEntryLike | null {
  const cachedNodes = data._foldderSpaceInnerNodes;
  if (!Array.isArray(cachedNodes) || cachedNodes.length === 0) return null;
  const cachedEdges = data._foldderSpaceInnerEdges;
  return {
    nodes: cachedNodes as Node[],
    edges: Array.isArray(cachedEdges) ? (cachedEdges as Edge[]) : [],
  };
}

export function resolveSpacePortalInnerTemplate(
  spaceNode: Pick<Node, "data">,
  spacesMap: Record<string, SpaceMapEntryLike | undefined>,
): SpacePortalInnerTemplate | null {
  const data = (spaceNode.data ?? {}) as Record<string, unknown>;
  const cachedType = data[SPACE_PORTAL_TEMPLATE_DATA_KEYS.nodeType];
  if (typeof cachedType === "string" && LOOP_PIPELINE_EXECUTABLE_TYPES.has(cachedType)) {
    const sourceHandle =
      typeof data[SPACE_PORTAL_TEMPLATE_DATA_KEYS.sourceHandle] === "string"
        ? (data[SPACE_PORTAL_TEMPLATE_DATA_KEYS.sourceHandle] as string)
        : primarySinkSourceHandle(cachedType) ?? "image";
    const innerNodeId =
      typeof data[SPACE_PORTAL_TEMPLATE_DATA_KEYS.innerNodeId] === "string"
        ? (data[SPACE_PORTAL_TEMPLATE_DATA_KEYS.innerNodeId] as string)
        : "";
    const nodeData = (data._foldderSpaceTemplateData as Record<string, unknown> | undefined) ?? {};
    const label =
      typeof data[SPACE_PORTAL_TEMPLATE_DATA_KEYS.label] === "string"
        ? (data[SPACE_PORTAL_TEMPLATE_DATA_KEYS.label] as string)
        : cachedType;
    if (
      innerNodeId &&
      isValidLoopSinkEdge({
        sourceNodeType: cachedType,
        sourceHandle,
        isPipelineExecutable: (t) => !!t && LOOP_PIPELINE_EXECUTABLE_TYPES.has(t),
      })
    ) {
      return {
        innerNodeId,
        nodeType: cachedType,
        sourceHandle,
        label,
        nodeData,
      };
    }
  }

  // Subgrafo: del spacesMap si está disponible, o del snapshot cacheado en el portal
  // (`_foldderSpaceInnerNodes`), para que la resolución funcione sin spacesMap (p. ej. en
  // `onGenerateBatch`, que solo tiene los nodos vivos del lienzo).
  const spaceId = (data.spaceId as string | undefined)?.trim();
  const entry =
    (spaceId ? spacesMap[spaceId] : undefined) ?? entryFromInnerCache(data);
  if (!entry?.nodes?.length) return null;

  const sinks = collectMediaSinkInfos(entry.nodes, entry.edges ?? []);
  const executable = sinks.find((s) =>
    LOOP_PIPELINE_EXECUTABLE_TYPES.has(String(s.node.type ?? "")),
  );
  if (!executable) return null;

  const nodeType = String(executable.node.type ?? "");
  const sourceHandle = executable.sourceHandle;
  if (
    !isValidLoopSinkEdge({
      sourceNodeType: nodeType,
      sourceHandle,
      isPipelineExecutable: (t) => !!t && LOOP_PIPELINE_EXECUTABLE_TYPES.has(t),
    })
  ) {
    return null;
  }

  const nodeData = (executable.node.data ?? {}) as Record<string, unknown>;
  const label =
    typeof nodeData.label === "string" && nodeData.label.trim()
      ? nodeData.label.trim()
      : nodeType;

  return {
    innerNodeId: executable.node.id,
    nodeType,
    sourceHandle,
    label,
    nodeData,
  };
}

export function spacePortalTemplateDataPatch(
  inner: SpacePortalInnerTemplate | null,
): Record<string, unknown> {
  if (!inner) {
    return {
      [SPACE_PORTAL_TEMPLATE_DATA_KEYS.innerNodeId]: undefined,
      [SPACE_PORTAL_TEMPLATE_DATA_KEYS.nodeType]: undefined,
      [SPACE_PORTAL_TEMPLATE_DATA_KEYS.sourceHandle]: undefined,
      [SPACE_PORTAL_TEMPLATE_DATA_KEYS.label]: undefined,
      _foldderSpaceTemplateData: undefined,
    };
  }
  return {
    [SPACE_PORTAL_TEMPLATE_DATA_KEYS.innerNodeId]: inner.innerNodeId,
    [SPACE_PORTAL_TEMPLATE_DATA_KEYS.nodeType]: inner.nodeType,
    [SPACE_PORTAL_TEMPLATE_DATA_KEYS.sourceHandle]: inner.sourceHandle,
    [SPACE_PORTAL_TEMPLATE_DATA_KEYS.label]: inner.label,
    _foldderSpaceTemplateData: inner.nodeData,
  };
}

/** Loop deposita resultados en un Space: `out|media_list → in` (ambas direcciones de cableado). */
export function isLoopSpacePortalConnection(
  sourceNode: Pick<Node, "id" | "type">,
  targetNode: Pick<Node, "id" | "type">,
  connection: {
    source?: string | null;
    target?: string | null;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  },
): boolean {
  const loop =
    sourceNode.type === "loop" || sourceNode.type === "populate"
      ? sourceNode
      : targetNode.type === "loop" || targetNode.type === "populate"
        ? targetNode
        : null;
  const space =
    sourceNode.type === "space" ? sourceNode : targetNode.type === "space" ? targetNode : null;
  if (!loop || !space) return false;

  const loopIsSource =
    connection.source != null
      ? connection.source === loop.id
      : sourceNode.id === loop.id;
  const loopHandle = loopIsSource ? connection.sourceHandle : connection.targetHandle;
  const spaceHandle = loopIsSource ? connection.targetHandle : connection.sourceHandle;

  if (spaceHandle !== "in") return false;
  return loopHandle === "out" || loopHandle === "media_list";
}

const INNER_PREFIX = "__space_inner__";

function readSpacePortalInnerGraph(
  portal: Pick<Node, "data">,
  spacesMap: Record<string, SpaceMapEntryLike | undefined>,
): { nodes: Node[]; edges: Edge[] } | null {
  const data = (portal.data ?? {}) as Record<string, unknown>;
  const cachedNodes = data._foldderSpaceInnerNodes;
  const cachedEdges = data._foldderSpaceInnerEdges;
  if (Array.isArray(cachedNodes) && cachedNodes.length > 0) {
    return {
      nodes: cachedNodes as Node[],
      edges: Array.isArray(cachedEdges) ? (cachedEdges as Edge[]) : [],
    };
  }

  const spaceId = (data.spaceId as string | undefined)?.trim();
  if (!spaceId) return null;
  const entry = spacesMap[spaceId];
  if (!entry?.nodes?.length) return null;
  return {
    nodes: entry.nodes.filter((n) => n.type !== "spaceInput" && n.type !== "spaceOutput"),
    edges: (entry.edges ?? []).filter((e) => e.target !== "out" && e.source !== "in"),
  };
}

export function expandSpacePortalTemplateForPipeline(
  nodes: Node[],
  edges: Edge[],
  spacesMap: Record<string, SpaceMapEntryLike | undefined> = {},
): { nodes: Node[]; edges: Edge[] } {
  let nextNodes = [...nodes];
  let nextEdges = [...edges];

  for (const edge of edges) {
    if (edge.targetHandle !== LOOP_SINK_TARGET_HANDLE) continue;
    const portal = nodes.find((n) => n.id === edge.source);
    if (portal?.type !== "space") continue;

    const innerTemplate = resolveSpacePortalInnerTemplate(portal, spacesMap);
    const innerGraph = readSpacePortalInnerGraph(portal, spacesMap);
    if (!innerTemplate || !innerGraph?.nodes.length) continue;

    const prefix = `${INNER_PREFIX}${portal.id}__`;
    const existingIds = new Set(nextNodes.map((n) => n.id));
    const innerNodes = innerGraph.nodes
      .map((n) => ({
        ...n,
        id: `${prefix}${n.id}`,
        parentId: undefined,
      }))
      .filter((n) => !existingIds.has(n.id));

    const innerEdges = innerGraph.edges.map((e) => ({
      ...e,
      id: `${prefix}${e.id}`,
      source: `${prefix}${e.source}`,
      target: `${prefix}${e.target}`,
    }));

    const sinkId = `${prefix}${innerTemplate.innerNodeId}`;
    nextNodes = [...nextNodes, ...innerNodes];
    nextEdges = [
      ...nextEdges.filter((e) => e.id !== edge.id),
      ...innerEdges,
      {
        ...edge,
        source: sinkId,
        sourceHandle: innerTemplate.sourceHandle,
      },
    ];
  }

  return { nodes: nextNodes, edges: nextEdges };
}
