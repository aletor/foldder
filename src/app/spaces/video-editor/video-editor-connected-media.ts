import type { Edge, Node, ReactFlowState } from "@xyflow/react";

import { resolvePromptValueFromEdgeSourceMap } from "../canvas-group-logic";
import type { MediaListItem, MediaListOutput } from "../media-list-output";

export const VIDEO_EDITOR_VIDEO_SLOT_IDS = [
  "video_0",
  "video_1",
  "video_2",
  "video_3",
  "video_4",
  "video_5",
  "video_6",
  "video_7",
] as const;

export type VideoEditorVideoSlotId = (typeof VIDEO_EDITOR_VIDEO_SLOT_IDS)[number];

export const VIDEO_EDITOR_VIDEO_SLOTS = VIDEO_EDITOR_VIDEO_SLOT_IDS.map((id, index) => ({
  id,
  label: `Video ${index + 1}`,
  top: `${12 + index * 10}%`,
}));

export type ConnectedVideoSlot = {
  slotId: VideoEditorVideoSlotId;
  sourceNodeId: string;
  sourceNodeType?: string;
  url: string;
};

function buildMediaListItemFromConnectedVideo(slot: ConnectedVideoSlot, order: number): MediaListItem {
  const index = VIDEO_EDITOR_VIDEO_SLOT_IDS.indexOf(slot.slotId);
  const title = slot.sourceNodeType ? `${slot.sourceNodeType} · Video ${index + 1}` : `Video ${index + 1}`;
  return {
    id: `ve_conn_${slot.sourceNodeId}_${slot.slotId}`,
    order,
    title,
    mediaType: "video",
    url: slot.url,
    assetId: slot.url,
    status: "generated",
    metadata: {
      connectedFromNodeId: slot.sourceNodeId,
      connectedSlot: slot.slotId,
    },
  };
}

export function buildMediaListFromConnectedVideos(slots: ConnectedVideoSlot[]): MediaListOutput | null {
  const valid = slots.filter((slot) => slot.url.trim());
  if (!valid.length) return null;
  return {
    kind: "media_list",
    sourceNodeId: "video_editor_connections",
    sourceNodeType: "connected_videos",
    title: `${valid.length} vídeo${valid.length === 1 ? "" : "s"} conectado${valid.length === 1 ? "" : "s"}`,
    status: "videos_ready",
    items: valid.map((slot, index) => buildMediaListItemFromConnectedVideo(slot, index)),
    groups: [],
    metadata: {
      cineNodeId: "video_editor_connections",
      totalVideos: valid.length,
      generatedAt: new Date().toISOString(),
    },
  };
}

export function mergeVideoEditorIncomingMedia(
  mediaList: MediaListOutput | null,
  connectedVideos: MediaListOutput | null,
): MediaListOutput | null {
  if (!mediaList && !connectedVideos) return null;
  if (!mediaList) return connectedVideos;
  if (!connectedVideos) return mediaList;
  const baseOrder = mediaList.items.length;
  return {
    ...mediaList,
    items: [
      ...mediaList.items,
      ...connectedVideos.items.map((item, index) => ({ ...item, order: baseOrder + index })),
    ],
    metadata: {
      ...mediaList.metadata,
      totalVideos: (mediaList.metadata.totalVideos ?? 0) + connectedVideos.items.length,
    },
  };
}

export function selectConnectedVideoSlots(state: ReactFlowState<Node, Edge>, nodeId: string): ConnectedVideoSlot[] {
  const edgesBySlot = new Map<string, Edge>();
  for (const edge of state.edges) {
    if (edge.target !== nodeId) continue;
    if (edge.targetHandle && VIDEO_EDITOR_VIDEO_SLOT_IDS.includes(edge.targetHandle as VideoEditorVideoSlotId)) {
      if (!edgesBySlot.has(edge.targetHandle)) edgesBySlot.set(edge.targetHandle, edge);
    }
  }
  const nodesById = state.nodeLookup as unknown as ReadonlyMap<string, Node>;
  const out: ConnectedVideoSlot[] = [];
  for (const slotId of VIDEO_EDITOR_VIDEO_SLOT_IDS) {
    const edge = edgesBySlot.get(slotId);
    if (!edge) continue;
    const url = resolvePromptValueFromEdgeSourceMap(edge, nodesById).trim();
    if (!url) continue;
    const source = state.nodeLookup.get(edge.source);
    out.push({
      slotId,
      sourceNodeId: edge.source,
      sourceNodeType: source?.type,
      url,
    });
  }
  return out;
}

export function getVisibleVideoEditorVideoSlots(connectedBySlot: Record<string, boolean>): VideoEditorVideoSlotId[] {
  const out: VideoEditorVideoSlotId[] = [];
  for (let index = 0; index < VIDEO_EDITOR_VIDEO_SLOT_IDS.length; index += 1) {
    const slotId = VIDEO_EDITOR_VIDEO_SLOT_IDS[index]!;
    if (index === 0 || connectedBySlot[VIDEO_EDITOR_VIDEO_SLOT_IDS[index - 1]!]) out.push(slotId);
  }
  return out;
}

export function selectVideoEditorVideoInputState(state: ReactFlowState<Node, Edge>, nodeId: string) {
  const connectedBySlot: Record<string, boolean> = {};
  for (const slotId of VIDEO_EDITOR_VIDEO_SLOT_IDS) {
    connectedBySlot[slotId] = state.edges.some((edge) => edge.target === nodeId && edge.targetHandle === slotId);
  }
  return {
    connectedBySlot,
    slots: selectConnectedVideoSlots(state, nodeId),
  };
}
