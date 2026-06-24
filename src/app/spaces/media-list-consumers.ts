import type { Node } from "@xyflow/react";

import { buildCineMediaListOutput } from "./cine-engine";
import { normalizeCineData } from "./cine-types";
import { isMediaListOutput, type MediaListItem, type MediaListOutput } from "./media-list-output";
import type { DesignerNodeData, DesignerPageState } from "./designer/DesignerNode";
import { getPageDimensions } from "./indesign/page-formats";

/** Salida media_list de un nodo Designer: una imagen por página, con raster en vivo (`pageThumbnails`). */
export function buildDesignerMediaListOutput(
  data: DesignerNodeData | undefined,
  nodeId: string,
): MediaListOutput {
  const pages: DesignerPageState[] = Array.isArray(data?.pages) ? data!.pages! : [];
  const thumbnails = data?.pageThumbnails ?? {};
  const items: MediaListItem[] = pages.map((page, index) => {
    const dims = getPageDimensions(page);
    const thumb = thumbnails[page.id];
    return {
      id: `${nodeId}:${page.id}`,
      order: index,
      title: `Página ${index + 1}`,
      mediaType: "image",
      role: "designer_page",
      url: thumb,
      width: Math.round(dims.width),
      height: Math.round(dims.height),
      status: thumb ? "generated" : "pending",
      metadata: {
        designerExport: { nodeId, pageId: page.id, pageIndex: index },
      },
    };
  });
  return {
    kind: "media_list",
    sourceNodeId: nodeId,
    sourceNodeType: "designer",
    title: typeof data?.label === "string" && data.label.trim() ? data.label.trim() : "Designer",
    status: items.length === 0 ? "empty" : "frames_ready",
    items,
    metadata: {
      cineNodeId: nodeId,
      totalFrames: items.length,
      generatedAt: new Date().toISOString(),
    },
  };
}

export type VideoEditorClip = {
  id: string;
  sourceItemId: string;
  assetId: string;
  mediaType: "image" | "video" | "audio";
  title: string;
  startTime: number;
  durationSeconds: number;
  sceneId?: string;
  metadata?: unknown;
};

type MediaListSourceNode = Pick<Node, "id" | "type" | "data">;

function parseMediaListValue(value: unknown): MediaListOutput | null {
  if (isMediaListOutput(value)) return value;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return isMediaListOutput(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function readMediaListFromNode(sourceNode: MediaListSourceNode | undefined): MediaListOutput | null {
  if (!sourceNode) return null;
  const data = sourceNode.data ?? {};
  const direct = parseMediaListValue((data as { mediaListOutput?: unknown }).mediaListOutput);
  if (direct) return direct;
  const alias = parseMediaListValue((data as { media_list?: unknown }).media_list);
  if (alias) return alias;
  const value = parseMediaListValue((data as { value?: unknown }).value);
  if (value) return value;
  if (sourceNode.type === "cine") {
    return buildCineMediaListOutput(normalizeCineData(data), sourceNode.id);
  }
  if (sourceNode.type === "designer") {
    return buildDesignerMediaListOutput(data as DesignerNodeData, sourceNode.id);
  }
  return null;
}

/** Ranuras de entrada media_list en Export Multimedia (ml0…ml7; `media_list` legacy = ml0). */
export const EXPORT_MULTIMEDIA_MEDIA_LIST_HANDLES = [
  "ml0",
  "ml1",
  "ml2",
  "ml3",
  "ml4",
  "ml5",
  "ml6",
  "ml7",
] as const;

export type ExportMultimediaMediaListHandle = (typeof EXPORT_MULTIMEDIA_MEDIA_LIST_HANDLES)[number];

export function normalizeExportMultimediaTargetHandle(
  handle: string | null | undefined,
): ExportMultimediaMediaListHandle | "media_list" | null {
  if (!handle || handle === "media_list") return handle === "media_list" ? "media_list" : null;
  return (EXPORT_MULTIMEDIA_MEDIA_LIST_HANDLES as readonly string[]).includes(handle)
    ? (handle as ExportMultimediaMediaListHandle)
    : null;
}

export function exportMultimediaTargetHandleSortKey(handle: string | null | undefined): number {
  if (!handle || handle === "media_list") return 0;
  const idx = EXPORT_MULTIMEDIA_MEDIA_LIST_HANDLES.indexOf(handle as ExportMultimediaMediaListHandle);
  return idx >= 0 ? idx : 999;
}

function mergeMediaListStatus(outputs: MediaListOutput[]): MediaListOutput["status"] {
  if (outputs.length === 0) return "empty";
  const items = outputs.flatMap((o) => o.items);
  if (items.length === 0) return "empty";
  const hasPending = items.some(
    (item) =>
      item.mediaType === "placeholder" ||
      item.status === "pending" ||
      item.status === "missing",
  );
  if (hasPending) return "frames_partial";
  const allReady = outputs.every((o) => o.status === "frames_ready" || o.status === "videos_ready" || o.status === "approved_ready");
  if (allReady) return outputs[0]!.status;
  return "frames_ready";
}

/** Combina varias salidas media_list en una sola lista (p. ej. varios Designer → Export Multimedia). */
export function mergeMediaListOutputs(outputs: MediaListOutput[]): MediaListOutput | null {
  const valid = outputs.filter(Boolean);
  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0]!;

  const items: MediaListItem[] = [];
  const seenItemIds = new Set<string>();
  let order = 0;
  for (const out of valid) {
    const sorted = [...out.items].sort((a, b) => a.order - b.order);
    for (const item of sorted) {
      let id = item.id;
      if (seenItemIds.has(id)) {
        id = `${out.sourceNodeId}:${id}`;
        let n = 2;
        while (seenItemIds.has(id)) {
          id = `${out.sourceNodeId}:${item.id}#${n++}`;
        }
      }
      seenItemIds.add(id);
      items.push({ ...item, id, order: order++ });
    }
  }

  const titles = valid.map((o) => o.title).filter((t) => t.trim());
  const primary = valid[0]!;

  return {
    kind: "media_list",
    sourceNodeId: valid.map((o) => o.sourceNodeId).join("+"),
    sourceNodeType: valid.map((o) => o.sourceNodeType).join("+"),
    title: titles.length > 1 ? titles.join(" + ") : titles[0] ?? "Export Multimedia",
    status: mergeMediaListStatus(valid),
    items,
    groups: valid.flatMap((o) => o.groups ?? []),
    metadata: {
      ...primary.metadata,
      generatedAt: new Date().toISOString(),
      mergedSourceNodeIds: valid.map((o) => o.sourceNodeId),
      mergedSourceCount: valid.length,
    } as MediaListOutput["metadata"] & { mergedSourceNodeIds?: string[]; mergedSourceCount?: number },
  };
}

/** Metadata que liga un item de media_list a una página de Designer (descarga full-res bajo demanda). */
export type DesignerExportItemMeta = { nodeId: string; pageId: string; pageIndex: number };

export function getDesignerExportMeta(item: MediaListItem): DesignerExportItemMeta | null {
  const meta = (item.metadata as { designerExport?: unknown } | undefined)?.designerExport;
  if (
    meta &&
    typeof meta === "object" &&
    typeof (meta as DesignerExportItemMeta).nodeId === "string" &&
    typeof (meta as DesignerExportItemMeta).pageId === "string"
  ) {
    return meta as DesignerExportItemMeta;
  }
  return null;
}

export function isMediaListItemDownloadable(item: MediaListItem): boolean {
  // Las páginas de Designer se descargan a full-res bajo demanda (no necesitan url precargada).
  if (getDesignerExportMeta(item)) return true;
  return item.mediaType !== "placeholder" && Boolean(item.url || item.assetId);
}

export function buildMediaListManifest(output: MediaListOutput) {
  return {
    sourceNodeId: output.sourceNodeId,
    sourceNodeType: output.sourceNodeType,
    title: output.title,
    status: output.status,
    exportedAt: new Date().toISOString(),
    items: output.items,
    groups: output.groups ?? [],
    metadata: output.metadata,
  };
}

export function buildVideoEditorClipsFromMediaList(output: MediaListOutput): VideoEditorClip[] {
  const ordered = [...output.items].sort((a, b) => {
    const sceneA = a.sceneOrder ?? Number.MAX_SAFE_INTEGER;
    const sceneB = b.sceneOrder ?? Number.MAX_SAFE_INTEGER;
    if (sceneA !== sceneB) return sceneA - sceneB;
    return a.order - b.order;
  });
  const sceneIdsWithVideo = new Set(
    ordered
      .filter((item) => item.mediaType === "video" && Boolean(item.assetId || item.url) && item.sceneId)
      .map((item) => item.sceneId as string),
  );
  let startTime = 0;
  const clips: VideoEditorClip[] = [];

  ordered.forEach((item) => {
    if (item.mediaType === "placeholder" || !item.assetId && !item.url) return;
    if (item.mediaType !== "image" && item.mediaType !== "video" && item.mediaType !== "audio") return;
    if (item.mediaType === "image" && item.sceneId && sceneIdsWithVideo.has(item.sceneId)) return;
    const durationSeconds = item.durationSeconds ?? (item.mediaType === "image" ? 4 : 5);
    clips.push({
      id: `clip_${item.id}`,
      sourceItemId: item.id,
      assetId: item.assetId || item.url || "",
      mediaType: item.mediaType,
      title: item.title,
      startTime,
      durationSeconds,
      sceneId: item.sceneId,
      metadata: item.metadata,
    });
    startTime += durationSeconds;
  });

  return clips;
}
