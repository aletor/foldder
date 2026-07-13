"use client";

import { useCallback, useMemo } from "react";
import {
  useNodeConnections,
  useNodesData,
  useStore,
  type Edge,
  type Node,
  type ReactFlowState,
} from "@xyflow/react";
import { shallow } from "zustand/shallow";
import { normalizeBrandKitDocument } from "@/lib/brandkit/brand-kit-defaults";
import { extractDesignerPaletteColors } from "@/lib/brandkit/designer-brand-palette";
import type { BrandKitNodeData } from "@/lib/brandkit/brand-kit-types";
import { getLiveStudioNodePatch } from "../studio-live-documents";

export type DesignerBrandKitConnection = {
  brainConnected: boolean;
  brandKitMissing: boolean;
  brandKitNodeId: string | null;
  paletteColors: string[];
};

const DISABLED_CONNECTION_NODE_ID = "__disabled_designer_brandkit_connection__";

/** FreehandStudio usa `designer-fh-{id}`; el canvas de React Flow usa el id del nodo. */
export function resolveDesignerFlowNodeId(nodeId: string | null | undefined): string | null {
  const trimmed = nodeId?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("designer-fh-")) return trimmed.slice("designer-fh-".length);
  return trimmed;
}

function coerceBrandKitRaw(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function resolveSourceNode(
  state: ReactFlowState<Node, Edge>,
  nodeId: string,
): Node | undefined {
  return state.nodeLookup.get(nodeId) ?? state.nodes.find((node) => node.id === nodeId);
}

export function findBrandKitBrainEdge(
  state: ReactFlowState<Node, Edge>,
  designerNodeId: string,
): Edge | undefined {
  for (const edge of state.edges) {
    if (edge.target !== designerNodeId) continue;
    if (edge.targetHandle && edge.targetHandle !== "brain") continue;

    const source = resolveSourceNode(state, edge.source);
    if (source?.type === "brandKit" && (!edge.sourceHandle || edge.sourceHandle === "brand")) {
      return edge;
    }
  }

  for (const edge of state.edges) {
    if (edge.target !== designerNodeId) continue;
    if (edge.targetHandle && edge.targetHandle !== "brain") continue;
    return edge;
  }

  return undefined;
}

export function resolveDesignerBrandKitFromSourceNode(
  source:
    | {
        id: string;
        type?: string;
        data?: unknown;
      }
    | null
    | undefined,
): DesignerBrandKitConnection {
  if (!source) {
    return {
      brainConnected: true,
      brandKitMissing: true,
      brandKitNodeId: null,
      paletteColors: [],
    };
  }

  if (source.type !== "brandKit") {
    return {
      brainConnected: true,
      brandKitMissing: true,
      brandKitNodeId: null,
      paletteColors: [],
    };
  }

  const livePatch = getLiveStudioNodePatch(source.id);
  const data = {
    ...((source.data ?? {}) as Record<string, unknown>),
    ...(livePatch ?? {}),
  } as BrandKitNodeData;
  const doc = normalizeBrandKitDocument(coerceBrandKitRaw(data.brandKit));

  return {
    brainConnected: true,
    brandKitMissing: false,
    brandKitNodeId: source.id,
    paletteColors: extractDesignerPaletteColors(doc),
  };
}

export function pickDesignerBrandKitConnection(
  connections: ReadonlyArray<{ source: string; sourceHandle?: string | null; targetHandle?: string | null }>,
  sourceNode:
    | {
        id: string;
        type?: string;
        data?: unknown;
      }
    | null
    | undefined,
): DesignerBrandKitConnection {
  const brandEdge =
    connections.find(
      (edge) =>
        (!edge.targetHandle || edge.targetHandle === "brain") &&
        (!edge.sourceHandle || edge.sourceHandle === "brand"),
    ) ?? connections.find((edge) => !edge.targetHandle || edge.targetHandle === "brain");

  if (!brandEdge) {
    return {
      brainConnected: false,
      brandKitMissing: false,
      brandKitNodeId: null,
      paletteColors: [],
    };
  }

  return resolveDesignerBrandKitFromSourceNode(sourceNode);
}

type ConnectionLite = {
  source: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

function toConnectionLite(edge: Edge): ConnectionLite {
  return {
    source: edge.source,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
  };
}

export function useDesignerBrandKitConnection(designerNodeId: string | null | undefined): DesignerBrandKitConnection {
  const flowNodeId = resolveDesignerFlowNodeId(designerNodeId);
  const connectionNodeId = flowNodeId ?? DISABLED_CONNECTION_NODE_ID;

  const strictConnections = useNodeConnections({
    id: connectionNodeId,
    handleType: "target",
    handleId: "brain",
  });
  const looseConnections = useNodeConnections({
    id: connectionNodeId,
    handleType: "target",
  });

  const fallbackEdge = useStore(
    useCallback(
      (state: ReactFlowState<Node, Edge>) =>
        flowNodeId ? findBrandKitBrainEdge(state, flowNodeId) : undefined,
      [flowNodeId],
    ),
    shallow,
  );

  const connections = useMemo<ConnectionLite[]>(() => {
    if (strictConnections.length > 0) return strictConnections;
    if (looseConnections.length > 0) return looseConnections;
    return fallbackEdge ? [toConnectionLite(fallbackEdge)] : [];
  }, [strictConnections, looseConnections, fallbackEdge]);

  const activeEdge = useMemo(
    () =>
      connections.find(
        (edge) =>
          (!edge.targetHandle || edge.targetHandle === "brain") &&
          (!edge.sourceHandle || edge.sourceHandle === "brand"),
      ) ?? connections.find((edge) => !edge.targetHandle || edge.targetHandle === "brain"),
    [connections],
  );

  const sourceNode = useNodesData(activeEdge?.source ?? DISABLED_CONNECTION_NODE_ID);

  return useMemo(
    () => pickDesignerBrandKitConnection(connections, sourceNode),
    [connections, sourceNode],
  );
}
