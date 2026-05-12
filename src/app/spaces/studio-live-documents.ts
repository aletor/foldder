"use client";

import type { Node } from "@xyflow/react";

type LiveStudioNodeData = Record<string, unknown>;

const liveStudioNodeData = new Map<string, LiveStudioNodeData>();

export function setLiveStudioNodeData(nodeId: string, patch: LiveStudioNodeData) {
  const prev = liveStudioNodeData.get(nodeId) ?? {};
  liveStudioNodeData.set(nodeId, { ...prev, ...patch });
}

export function clearLiveStudioNodeData(nodeId: string) {
  liveStudioNodeData.delete(nodeId);
}

export function mergeLiveStudioNodeDataIntoNodes<T extends Node>(nodes: T[]): T[] {
  if (liveStudioNodeData.size === 0) return nodes;
  let changed = false;
  const next = nodes.map((node) => {
    const patch = liveStudioNodeData.get(node.id);
    if (!patch) return node;
    changed = true;
    return {
      ...node,
      data: {
        ...(node.data ?? {}),
        ...patch,
      },
    };
  });
  return changed ? next : nodes;
}
