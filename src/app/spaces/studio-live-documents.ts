"use client";

import type { Node } from "@xyflow/react";
import type { VectorPdfExportOptions } from "./freehand/text-outline";

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

export type LiveStudioExportOptions = {
  fullResolution?: boolean;
  maxSide?: number;
};

type LiveStudioExportFn = (opts?: LiveStudioExportOptions) => Promise<string | null>;

const liveStudioExportByNodeId = new Map<string, LiveStudioExportFn>();

/** Registra export PNG del studio abierto (PhotoRoom) para APIs downstream (Describer). */
export function registerLiveStudioExport(nodeId: string, fn: LiveStudioExportFn) {
  liveStudioExportByNodeId.set(nodeId, fn);
}

export function unregisterLiveStudioExport(nodeId: string) {
  liveStudioExportByNodeId.delete(nodeId);
}

export async function tryLiveStudioExportPng(
  nodeId: string,
  opts?: LiveStudioExportOptions,
): Promise<string | null> {
  const fn = liveStudioExportByNodeId.get(nodeId);
  if (!fn) return null;
  try {
    return await fn(opts);
  } catch {
    return null;
  }
}

type LiveDesignerMultipagePdfExportFn = (opts?: VectorPdfExportOptions) => Promise<boolean>;

const liveDesignerMultipagePdfExportByNodeId = new Map<string, LiveDesignerMultipagePdfExportFn>();

/** Registra export PDF multipágina del Designer studio abierto (o headless) para Image Export. */
export function registerLiveDesignerMultipagePdfExport(nodeId: string, fn: LiveDesignerMultipagePdfExportFn) {
  liveDesignerMultipagePdfExportByNodeId.set(nodeId, fn);
}

export function unregisterLiveDesignerMultipagePdfExport(nodeId: string) {
  liveDesignerMultipagePdfExportByNodeId.delete(nodeId);
}

export async function tryLiveDesignerMultipagePdfExport(
  nodeId: string,
  opts?: VectorPdfExportOptions,
): Promise<boolean> {
  const fn = liveDesignerMultipagePdfExportByNodeId.get(nodeId);
  if (!fn) return false;
  try {
    return await fn(opts);
  } catch {
    return false;
  }
}
