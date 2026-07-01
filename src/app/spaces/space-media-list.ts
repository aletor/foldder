/**
 * Nested Space — detección de salida colección (media_list) y agregación de sinks multimedia.
 */

import type { Edge, Node } from "@xyflow/react";
import { NODE_REGISTRY, type HandleType } from "./nodeRegistry";
import { inferMediaListImageMimeType } from "./media-list-download";
import type { MediaListItem, MediaListOutput } from "./media-list-output";
import { isMediaListOutput } from "./media-list-output";
import {
  resolveSpacePortalInnerTemplate,
  spacePortalTemplateDataPatch,
  type SpaceMapEntryLike,
} from "./space-portal-loop-link";
import { findDesignerNodesFeedingSpaceOutput } from "./populate/populate-space-template";

const PORTAL_NODE_TYPES = new Set(["spaceInput", "spaceOutput"]);

/** Tipos de nodo que pueden aportar imagen o vídeo al spaceOutput. */
const MEDIA_SINK_NODE_TYPES = new Set([
  "nanoBanana",
  "imageCreationAdvanced",
  "geminiVideo",
  "grokProcessor",
  "vfxGenerator",
  "mediaInput",
  "urlImage",
  "inspiration",
  "imageExport",
  "crop",
  "layerizer",
  "painter",
  "backgroundRemover",
]);

export type SpaceOutputMode = "scalar" | "collection";

export type SpaceStructureAnalysis = {
  type: string;
  label: string;
  value: string | null;
  hasInput: boolean;
  hasOutput: boolean;
  internalCategories: string[];
  outputMode: SpaceOutputMode;
  mediaListOutput: MediaListOutput | null;
  /** Sinks multimedia para cableado automático al spaceOutput. */
  mediaSinks: Array<{ nodeId: string; sourceHandle: string }>;
};

export type MediaSinkInfo = {
  node: Node;
  sourceHandle: string;
  mediaType: "image" | "video";
  url?: string;
  s3Key?: string;
  label: string;
};

function isInternalNode(node: Node): boolean {
  return !PORTAL_NODE_TYPES.has(String(node.type));
}

/** Nodos internos sin salida hacia otro nodo interno (sinks del subgrafo). */
export function collectInternalSinkNodes(nodes: Node[], edges: Edge[]): Node[] {
  const internal = nodes.filter(isInternalNode);
  const internalIds = new Set(internal.map((n) => n.id));
  return internal.filter(
    (n) => !edges.some((e) => e.source === n.id && internalIds.has(e.target)),
  );
}

function resolvePrimaryMediaOutputHandle(nodeType: string): { id: string; type: HandleType } | null {
  const meta = NODE_REGISTRY[nodeType];
  if (!meta?.outputs?.length) return null;
  const video = meta.outputs.find((o) => o.type === "video");
  if (video) return video;
  const image = meta.outputs.find((o) => o.type === "image");
  if (image) return image;
  const mediaList = meta.outputs.find((o) => o.type === "media_list");
  if (mediaList) return mediaList;
  return meta.outputs[0] ?? null;
}

function resolveImageSinkUrl(nodeType: string, data: Record<string, unknown>): string | undefined {
  const candidates: unknown[] =
    nodeType === "backgroundRemover"
      ? [data.value, data.result_rgba, data.rgba, data.output]
      : [data.value, data.output, data.result_rgba];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return undefined;
}

/** Extrae media de un nodo si es un sink multimedia reconocible. */
export function getMediaSinkInfo(node: Node): MediaSinkInfo | null {
  const nodeType = String(node.type ?? "");
  if (!MEDIA_SINK_NODE_TYPES.has(nodeType)) return null;

  const data = (node.data ?? {}) as Record<string, unknown>;
  const out = resolvePrimaryMediaOutputHandle(nodeType);
  if (!out) return null;

  if (out.type === "media_list") {
    const ml = data.mediaListOutput ?? data.media_list;
    if (isMediaListOutput(ml) && ml.items.length > 0) {
      const first = ml.items.find((i) => i.url || i.s3Key) ?? ml.items[0];
      if (!first) return null;
      return {
        node,
        sourceHandle: out.id,
        mediaType: first.mediaType === "video" ? "video" : "image",
        url: first.url,
        s3Key: first.s3Key,
        label: typeof data.label === "string" && data.label.trim() ? data.label.trim() : ml.title,
      };
    }
  }

  const propagatedType = String(data.type ?? data.outputType ?? "").toLowerCase();
  let mediaType: "image" | "video" | null = null;
  if (out.type === "video" || propagatedType === "video") mediaType = "video";
  else if (out.type === "image" || propagatedType === "image") mediaType = "image";
  else if (nodeType === "mediaInput") {
    if (propagatedType === "video") mediaType = "video";
    else if (propagatedType === "image") mediaType = "image";
  }
  if (!mediaType) return null;

  const url = resolveImageSinkUrl(nodeType, data);
  const s3Key = typeof data.s3Key === "string" && data.s3Key.trim() ? data.s3Key.trim() : undefined;
  const label =
    typeof data.label === "string" && data.label.trim()
      ? data.label.trim()
      : nodeType === "nanoBanana"
        ? "Image Creation"
        : nodeType;

  return {
    node,
    sourceHandle: out.id,
    mediaType,
    url,
    s3Key,
    label,
    // Incluir sinks aunque aún no tengan URL (Loop pendiente).
  };
}

export function collectMediaSinkInfos(nodes: Node[], edges: Edge[]): MediaSinkInfo[] {
  const sinks = collectInternalSinkNodes(nodes, edges);
  const infos: MediaSinkInfo[] = [];
  for (const node of sinks) {
    const info = getMediaSinkInfo(node);
    if (info) infos.push(info);
  }
  return sortNodesByCanvasPosition(infos.map((i) => i.node)).map((node) => {
    const found = infos.find((i) => i.node.id === node.id);
    return found!;
  });
}

function sortNodesByCanvasPosition(nodes: Node[]): Node[] {
  return [...nodes].sort((a, b) => {
    if (a.position.y !== b.position.y) return a.position.y - b.position.y;
    if (a.position.x !== b.position.x) return a.position.x - b.position.x;
    return String(a.id).localeCompare(String(b.id));
  });
}

export function detectSpaceOutputMode(mediaSinks: MediaSinkInfo[]): SpaceOutputMode {
  return mediaSinks.length >= 2 ? "collection" : "scalar";
}

export function buildMediaListFromSinkInfos(
  sinks: MediaSinkInfo[],
  spaceId: string,
  title: string,
): MediaListOutput {
  const items: MediaListItem[] = sinks.map((sink, index) => {
    const hasMedia = Boolean(sink.url || sink.s3Key);
    const item: MediaListItem = {
      id: sink.node.id,
      order: index,
      title: sink.label || `Item ${index + 1}`,
      mediaType: sink.mediaType,
      url: sink.url,
      ...(sink.s3Key ? { s3Key: sink.s3Key } : {}),
      status: hasMedia ? "generated" : "pending",
      metadata: {
        sourceNodeId: sink.node.id,
        sourceNodeType: sink.node.type,
        spaceId,
      },
    };
    if (sink.mediaType === "image" && hasMedia) {
      const mime = inferMediaListImageMimeType({
        ...item,
        order: index,
        title: item.title,
        mediaType: "image",
        status: item.status,
      });
      if (mime) item.mimeType = mime;
    }
    return item;
  });

  const ready = items.filter((i) => i.status === "generated").length;
  return {
    kind: "media_list",
    sourceNodeId: spaceId,
    sourceNodeType: "space",
    title: title || "Nested Space",
    status:
      items.length === 0
        ? "empty"
        : ready === 0
          ? "frames_partial"
          : ready === items.length
            ? "frames_ready"
            : "frames_partial",
    items,
    metadata: {
      cineNodeId: spaceId,
      totalFrames: items.filter((i) => i.mediaType === "image").length,
      totalVideos: items.filter((i) => i.mediaType === "video").length,
      generatedAt: new Date().toISOString(),
    },
  };
}

function collectInternalCategories(nodes: Node[]): string[] {
  const categoriesSet = new Set<string>();
  nodes.forEach((n) => {
    const type = (n.type || "").toLowerCase();
    if (
      type.includes("grok") ||
      type.includes("runway") ||
      type.includes("assistant") ||
      type.includes("processor") ||
      type.includes("banana") ||
      type.includes("remover") ||
      type.includes("describer")
    ) {
      categoriesSet.add("ai");
    }
    if (
      type.includes("concatenator") ||
      type.includes("listado") ||
      type.includes("batch") ||
      (type === "space" && n.id !== "in" && n.id !== "out")
    ) {
      categoriesSet.add("logic");
    }
    if (type.includes("prompt") || type.includes("describer") || type.includes("enhancer")) {
      categoriesSet.add("prompt");
    }
    if (type.includes("image") || type.includes("media") || type.includes("matted")) {
      categoriesSet.add("image");
    }
    if (type.includes("video")) {
      categoriesSet.add("video");
    }
    if (
      type.includes("export") ||
      type.includes("paint") ||
      type.includes("crop") ||
      type.includes("photo") ||
      type.includes("design") ||
      type.includes("present") ||
      type.includes("textoverlay")
    ) {
      categoriesSet.add("canvas");
    }
    if (
      type.includes("mask") ||
      type.includes("tool") ||
      type.includes("scissors") ||
      type.includes("vision")
    ) {
      categoriesSet.add("tool");
    }
  });
  return Array.from(categoriesSet).slice(0, 5);
}

function mapHandleTypeToSpaceResult(
  sourceHandleType: HandleType | undefined,
  propagatedType: string,
): { type: string; label: string } {
  if (sourceHandleType === "brain" || propagatedType === "brain") {
    return { type: "brain", label: "Brain Space" };
  }
  if (
    sourceHandleType === "image" ||
    sourceHandleType === "image_layout" ||
    propagatedType === "image"
  ) {
    return { type: "image", label: "Image Space" };
  }
  if (sourceHandleType === "video" || propagatedType === "video") {
    return { type: "video", label: "Video Space" };
  }
  if (sourceHandleType === "prompt" || propagatedType === "prompt") {
    return { type: "prompt", label: "Prompt Space" };
  }
  if (sourceHandleType === "mask" || propagatedType === "mask") {
    return { type: "mask", label: "Mask Space" };
  }
  if (sourceHandleType === "media_list" || propagatedType === "media_list") {
    return { type: "media_list", label: "Media Space" };
  }
  if (sourceHandleType === "json" || propagatedType === "json") {
    return { type: "json", label: "Data Space" };
  }
  return { type: "url", label: "URL Space" };
}

/**
 * Analiza la estructura de un nested space: tipo escalar o colección media_list.
 */
export function analyzeNestedSpaceStructure(
  nodes: Node[],
  edges: Edge[],
  options?: { spaceId?: string; spaceName?: string },
): SpaceStructureAnalysis {
  const inputNode = nodes.find((n) => n.type === "spaceInput");
  const outputNode = nodes.find((n) => n.type === "spaceOutput");
  const mediaSinkInfos = collectMediaSinkInfos(nodes, edges);
  const designerTemplateSinks = findDesignerNodesFeedingSpaceOutput(nodes, edges);
  const outputMode =
    designerTemplateSinks.length >= 2
      ? "collection"
      : detectSpaceOutputMode(mediaSinkInfos);
  const spaceId = options?.spaceId ?? "space";
  const spaceName = options?.spaceName ?? "Space";

  const base: SpaceStructureAnalysis = {
    type: "url",
    label: "Space",
    value: null,
    hasInput: !!inputNode,
    hasOutput: !!outputNode,
    internalCategories: collectInternalCategories(nodes),
    outputMode,
    mediaListOutput: null,
    mediaSinks: mediaSinkInfos.map((s) => ({
      nodeId: s.node.id,
      sourceHandle: s.sourceHandle,
    })),
  };

  if (outputMode === "collection") {
    if (designerTemplateSinks.length >= 2) {
      return {
        ...base,
        type: "json",
        label: "Template Space",
        outputMode,
        mediaSinks: designerTemplateSinks.map((n) => ({
          nodeId: n.id,
          sourceHandle: "document",
        })),
      };
    }
    const mediaListOutput = buildMediaListFromSinkInfos(mediaSinkInfos, spaceId, spaceName);
    const firstItem = mediaListOutput.items.find((i) => i.url || i.s3Key);
    const firstUrl = firstItem?.url ?? null;
    return {
      ...base,
      type: "media_list",
      label: "Media Space",
      value: firstUrl,
      mediaListOutput,
    };
  }

  if (!outputNode) return base;

  const incomingEdge = edges.find((e) => e.target === outputNode.id);
  if (!incomingEdge) return base;

  const sourceNode = nodes.find((n) => n.id === incomingEdge.source);
  if (!sourceNode) return base;

  const sourceMetadata = NODE_REGISTRY[sourceNode.type as string];
  let sourceHandleType = sourceMetadata?.outputs.find((o) => o.id === incomingEdge.sourceHandle)?.type;
  if (!sourceHandleType && sourceMetadata?.outputs.length === 1) {
    sourceHandleType = sourceMetadata.outputs[0].type;
  }

  const propagatedType = String(
    (sourceNode.data as { outputType?: string; type?: string })?.outputType ||
      (sourceNode.data as { type?: string })?.type ||
      "",
  ).toLowerCase();

  const mapped = mapHandleTypeToSpaceResult(sourceHandleType, propagatedType);
  const value =
    typeof (sourceNode.data as { value?: unknown })?.value === "string"
      ? ((sourceNode.data as { value: string }).value as string)
      : null;

  return {
    ...base,
    type: mapped.type,
    label: mapped.label,
    value,
  };
}

/**
 * Reconstruye un nested space perdido del mapa usando el snapshot cacheado en el portal
 * (`_foldderSpaceInnerNodes` / `_foldderSpaceInnerEdges`). Sin esto, el portal puede seguir
 * mostrando templates en preview pero «Entrar» no hace nada si falta la entrada en spacesMap.
 */
export function rebuildSpaceMapEntryFromPortalCache(
  portalNode: Node,
  spaceId: string,
  fallbackName?: string,
): SpaceMapEntryLike | null {
  const data = (portalNode.data ?? {}) as Record<string, unknown>;
  const cachedNodes = data._foldderSpaceInnerNodes;
  if (!Array.isArray(cachedNodes) || cachedNodes.length === 0) return null;

  const cachedEdges = Array.isArray(data._foldderSpaceInnerEdges)
    ? (data._foldderSpaceInnerEdges as Edge[])
    : [];

  const rawInner = cachedNodes as Node[];
  const contentNodes = rawInner.filter(
    (n) => n.type !== "spaceInput" && n.type !== "spaceOutput" && n.id !== "in" && n.id !== "out",
  );
  if (contentNodes.length === 0) return null;

  const nodes: Node[] = [];
  const hasInput = data.hasInput !== false;
  const hasOutput = data.hasOutput !== false;

  if (hasInput) {
    nodes.push({
      id: "in",
      type: "spaceInput",
      position: { x: 100, y: 200 },
      data: {
        label: "Input",
        ...(typeof data.inputType === "string" ? { inputType: data.inputType } : {}),
      },
    });
  }

  nodes.push(...contentNodes);

  const existingOut = rawInner.find((n) => n.type === "spaceOutput" || n.id === "out");
  if (existingOut) {
    nodes.push(existingOut);
  } else if (hasOutput) {
    const maxX = Math.max(...contentNodes.map((n) => n.position?.x ?? 0), 0);
    const avgY =
      contentNodes.reduce((sum, n) => sum + (n.position?.y ?? 0), 0) / contentNodes.length;
    nodes.push({
      id: "out",
      type: "spaceOutput",
      position: { x: maxX + 320, y: avgY },
      data: {
        label: "Output",
        ...(typeof data.outputType === "string" ? { outputType: data.outputType } : {}),
      },
    });
  }

  const edges = [...cachedEdges];
  const spaceName =
    fallbackName ??
    (typeof data.label === "string" && data.label.trim() ? data.label.trim() : "Nested Space");

  const structure = analyzeNestedSpaceStructure(nodes, edges, {
    spaceId,
    spaceName,
  });

  return {
    name: spaceName,
    nodes,
    edges,
    outputType: structure.type,
    outputValue: structure.value,
    outputMode: structure.outputMode,
    mediaListOutput: structure.mediaListOutput ?? undefined,
    hasInput: structure.hasInput,
    hasOutput: structure.hasOutput,
    internalCategories: structure.internalCategories,
    updatedAt: new Date().toISOString(),
  } as SpaceMapEntryLike;
}

/**
 * Refresca un nodo portal Space en el lienzo padre a partir del subgrafo guardado en spacesMap.
 * Evita portales obsoletos (p. ej. outputType url cuando dentro hay media_list · 3).
 */
export function reconcileSpacePortalNode(
  portalNode: Node,
  spacesMap: Record<string, SpaceMapEntryLike | undefined>,
): Node {
  if (portalNode.type !== "space") return portalNode;
  const spaceId = (portalNode.data as { spaceId?: string } | undefined)?.spaceId;
  if (!spaceId) return portalNode;
  const entry = spacesMap[spaceId];
  if (!entry?.nodes?.length) return portalNode;

  const structure = analyzeNestedSpaceStructure(entry.nodes, entry.edges ?? [], {
    spaceId,
    spaceName: entry.name ?? "Space",
  });

  const prev = (portalNode.data ?? {}) as Record<string, unknown>;
  const keepLabel =
    prev.label != null && String(prev.label).trim() !== "" ? prev.label : structure.label;
  const innerTemplate = resolveSpacePortalInnerTemplate(
    { data: { ...prev, spaceId, outputType: structure.type } },
    spacesMap as Record<string, SpaceMapEntryLike | undefined>,
  );
  const innerNodes = (entry.nodes ?? []).filter(
    (n) => n.type !== "spaceInput" && n.type !== "spaceOutput",
  );
  const innerEdges = (entry.edges ?? []).filter((e) => e.source !== "in");

  return {
    ...portalNode,
    data: {
      ...prev,
      label: keepLabel,
      outputType: structure.type,
      outputMode: structure.outputMode,
      value: structure.value,
      mediaListOutput: structure.mediaListOutput ?? undefined,
      ...(structure.mediaListOutput
        ? { media_list: structure.mediaListOutput }
        : {}),
      hasInput: structure.hasInput,
      hasOutput: structure.hasOutput,
      internalCategories: structure.internalCategories,
      ...spacePortalTemplateDataPatch(innerTemplate),
      _foldderSpaceInnerNodes: innerNodes,
      _foldderSpaceInnerEdges: innerEdges,
    },
  };
}

export function reconcileSpacePortalsInNodes(
  graphNodes: Node[],
  spacesMap: Record<string, SpaceMapEntryLike | undefined>,
): Node[] {
  return graphNodes.map((n) =>
    n.type === "space" ? reconcileSpacePortalNode(n, spacesMap) : n,
  );
}

/** Aristas de sinks multimedia → spaceOutput (varias en paralelo). */
export function buildMediaSinkToSpaceOutputEdges(
  sinks: Array<{ nodeId: string; sourceHandle: string }>,
  spaceOutputId = "out",
  idPrefix = "space_media_out",
): Edge[] {
  return sinks.map((sink, index) => ({
    id: `${idPrefix}_${sink.nodeId}_${index}`,
    source: sink.nodeId,
    sourceHandle: sink.sourceHandle,
    target: spaceOutputId,
    targetHandle: "in",
    type: "buttonEdge",
    animated: false,
  }));
}
