"use client";

import type { Edge, Node } from "@xyflow/react";

import {
  edgeTargetsMemberInput,
  resolvePromptValueFromEdgeSource,
  resolvePromptValueFromEdgeSourceMap,
} from "./canvas-group-logic";
import type { PhotoRoomNodeStudioData } from "./photo-room/photo-room-types";
import { mergeLiveStudioNodeDataIntoNodes, tryLiveStudioExportPng } from "./studio-live-documents";

const PHOTO_ROOM_SLOT_IDS = [
  "in_0",
  "in_1",
  "in_2",
  "in_3",
  "in_4",
  "in_5",
  "in_6",
  "in_7",
] as const;

function resolvePhotoRoomPreviewUrl(
  nodeId: string,
  edges: Edge[],
  nodesById: ReadonlyMap<string, Node>,
): string {
  for (const slotId of PHOTO_ROOM_SLOT_IDS) {
    const edge = edges.find((e) => edgeTargetsMemberInput(e, nodeId, slotId));
    if (!edge) continue;
    const src = resolvePromptValueFromEdgeSourceMap(edge, nodesById).trim();
    if (src) return src;
  }
  return "";
}

/** Misma prioridad que `displayUrl` en PhotoRoomNode (export → previewThumb en vivo → preview conectado). */
function resolvePhotoRoomDisplayUrl(node: Node, edges: Edge[], nodes: Node[]): string {
  const data = node.data as PhotoRoomNodeStudioData & { value?: string; previewThumb?: string };
  const studioObjects = data.studioObjects;
  const hasPersistedStudio = Array.isArray(studioObjects) && studioObjects.length > 0;
  const exportedThumb =
    typeof data.value === "string" && data.value.trim().length > 0 ? data.value.trim() : "";
  const livePreviewThumb =
    typeof data.previewThumb === "string" && data.previewThumb.trim().length > 0
      ? data.previewThumb.trim()
      : "";
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const previewUrl = resolvePhotoRoomPreviewUrl(node.id, edges, nodesById);

  if (livePreviewThumb) return livePreviewThumb;
  if (hasPersistedStudio) return exportedThumb || previewUrl;
  return previewUrl || exportedThumb;
}

/** Tamaño del documento PhotoRoom (artboard), no necesariamente la resolución del PNG exportado. */
export function resolvePhotoRoomDocumentSize(
  node: Node | null | undefined,
): { w: number; h: number } | null {
  if (!node || node.type !== "photoRoom") return null;
  const ab = (node.data as PhotoRoomNodeStudioData).studioArtboard;
  const w = Number(ab?.width);
  const h = Number(ab?.height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) return null;
  return { w: Math.round(w), h: Math.round(h) };
}

/**
 * URL de imagen/vídeo lista para APIs del servidor desde la arista de entrada.
 * Fusiona datos de studio en vivo y replica el fallback de PhotoRoom cuando `data.value` está vacío.
 */
export function resolveMediaUrlFromEdgeSource(
  edge: Pick<Edge, "source" | "sourceHandle">,
  nodes: Node[],
  edges: Edge[],
): string {
  const mergedNodes = mergeLiveStudioNodeDataIntoNodes(nodes);
  const primary = String(resolvePromptValueFromEdgeSource(edge, mergedNodes) ?? "").trim();
  const sourceNode = mergedNodes.find((n) => n.id === edge.source);
  if (!sourceNode) return primary;

  if (sourceNode.type === "photoRoom") {
    const displayUrl = resolvePhotoRoomDisplayUrl(sourceNode, edges, mergedNodes).trim();
    return displayUrl || primary;
  }

  if (sourceNode.type === "space") {
    const sd = sourceNode.data as { value?: string };
    return String(sd?.value ?? primary).trim();
  }

  return primary;
}

/** Convierte `blob:` a data URL; el resto pasa tal cual (http, data, rutas S3 estables). */
export async function ensureServerReadableMediaUrl(url: string): Promise<string> {
  const trimmed = url.trim();
  if (!trimmed) throw new Error("No media URL available to describe.");
  if (!trimmed.startsWith("blob:")) return trimmed;

  try {
    const res = await fetch(trimmed);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === "string" ? reader.result : "";
        if (result) resolve(result);
        else reject(new Error("Could not read local preview image."));
      };
      reader.onerror = () =>
        reject(new Error("Could not read local preview image."));
      reader.readAsDataURL(blob);
    });
  } catch {
    throw new Error(
      "Could not read the local preview image. Close PhotoRoom to export, or wait a moment and try again.",
    );
  }
}

/**
 * URL lista para Image Describer: prioriza export PNG del PhotoRoom abierto,
 * convierte blob: a data URL, y valida que haya contenido.
 */
export async function resolveMediaUrlForDescriber(
  edge: Pick<Edge, "source" | "sourceHandle">,
  nodes: Node[],
  edges: Edge[],
): Promise<string> {
  const mergedNodes = mergeLiveStudioNodeDataIntoNodes(nodes);
  const sourceNode = mergedNodes.find((n) => n.id === edge.source);
  let url = resolveMediaUrlFromEdgeSource(edge, nodes, edges);

  if (sourceNode?.type === "photoRoom") {
    const livePng = await tryLiveStudioExportPng(sourceNode.id, { maxSide: 1536 });
    if (livePng?.trim()) url = livePng.trim();
  }

  if (!url.trim()) {
    throw new Error(
      "No image to describe. Close PhotoRoom to export the canvas, or connect an image input.",
    );
  }

  return ensureServerReadableMediaUrl(url);
}
