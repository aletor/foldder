"use client";

import { useCallback, useMemo } from "react";
import { useStore, type Edge, type Node, type ReactFlowState } from "@xyflow/react";
import { shallow } from "zustand/shallow";
import { useDesignerConnectedDataset } from "@/app/spaces/designer/use-designer-connected-dataset";
import { readMediaListFromNode } from "@/app/spaces/media-list-consumers";
import type { PopulateNodeData } from "@/app/spaces/populate/populate-types";
import { getMediaSinkInfo } from "@/app/spaces/space-media-list";
import { isMediaListOutput, type MediaListOutput } from "@/app/spaces/media-list-output";
import { resolveFullQualityMediaUrl } from "@/lib/canvas-media-thumbnail";
import {
  buildSiteGraphConnectionStatus,
  type SiteGraphBindingSources,
  type SiteGraphConnectionStatus,
} from "@/lib/site/site-bindings";

type SiteContentSourceType = "populate" | "designer" | null;

type SiteContentSnapshot = {
  connected: boolean;
  missing: boolean;
  sourceNodeId: string | null;
  sourceType: SiteContentSourceType;
  label: string | null;
  mediaListOutput: MediaListOutput | null;
  templateBindings: PopulateNodeData["templateBindings"] | null;
  populateListId: string | null;
} | null;

type SiteMediaSnapshot = {
  connected: boolean;
  url: string | null;
  label: string | null;
} | null;

function selectSiteContentConnection(
  state: ReactFlowState<Node, Edge>,
  siteNodeId: string,
): SiteContentSnapshot {
  const edge = state.edges.find(
    (row) => row.target === siteNodeId && row.targetHandle === "content",
  );
  if (!edge) return null;

  const source = state.nodeLookup.get(edge.source) ?? state.nodes.find((node) => node.id === edge.source);
  if (!source) {
    return {
      connected: true,
      missing: true,
      sourceNodeId: null,
      sourceType: null,
      label: null,
      mediaListOutput: null,
      templateBindings: null,
      populateListId: null,
    };
  }

  if (source.type === "populate") {
    const data = (source.data ?? {}) as unknown as PopulateNodeData;
    const mediaListOutput = isMediaListOutput(data.mediaListOutput) ? data.mediaListOutput : null;

    return {
      connected: true,
      missing: false,
      sourceNodeId: source.id,
      sourceType: "populate",
      label: data.label?.trim() || "Populate",
      mediaListOutput,
      templateBindings: Array.isArray(data.templateBindings) ? data.templateBindings : null,
      populateListId: typeof data.listId === "string" ? data.listId : null,
    };
  }

  if (source.type === "designer") {
    const mediaListOutput = readMediaListFromNode(source);
    const label =
      typeof (source.data as { label?: string }).label === "string"
        ? (source.data as { label?: string }).label?.trim()
        : null;

    return {
      connected: true,
      missing: false,
      sourceNodeId: source.id,
      sourceType: "designer",
      label: label || "Designer",
      mediaListOutput,
      templateBindings: null,
      populateListId: null,
    };
  }

  return {
    connected: true,
    missing: true,
    sourceNodeId: source.id,
    sourceType: null,
    label: null,
    mediaListOutput: null,
    templateBindings: null,
    populateListId: null,
  };
}

function selectSiteMediaConnection(
  state: ReactFlowState<Node, Edge>,
  siteNodeId: string,
): SiteMediaSnapshot {
  const edge = state.edges.find(
    (row) => row.target === siteNodeId && row.targetHandle === "media",
  );
  if (!edge) return null;

  const source = state.nodeLookup.get(edge.source) ?? state.nodes.find((node) => node.id === edge.source);
  if (!source) {
    return { connected: true, url: null, label: null };
  }

  const sink = getMediaSinkInfo(source);
  const label =
    sink?.label ??
    (typeof (source.data as { label?: string }).label === "string"
      ? (source.data as { label?: string }).label?.trim()
      : null) ??
    String(source.type ?? "Media");

  return {
    connected: true,
    url: resolveFullQualityMediaUrl(sink?.url, sink?.s3Key) ?? null,
    label,
  };
}

export function useSiteConnections(siteNodeId: string): {
  bindings: SiteGraphBindingSources;
  status: SiteGraphConnectionStatus;
  datasetLoading: boolean;
} {
  const { connectedDataset, datasetConnected, datasetLoading } =
    useDesignerConnectedDataset(siteNodeId);

  const contentSnapshot = useStore(
    useCallback(
      (state: ReactFlowState<Node, Edge>) => selectSiteContentConnection(state, siteNodeId),
      [siteNodeId],
    ),
    shallow,
  );

  const populateNodeId =
    contentSnapshot?.sourceType === "populate" ? contentSnapshot.sourceNodeId : null;
  const { connectedDataset: populateDataset, datasetLoading: populateDatasetLoading } =
    useDesignerConnectedDataset(populateNodeId ?? "__site_no_populate__");

  const mediaSnapshot = useStore(
    useCallback(
      (state: ReactFlowState<Node, Edge>) => selectSiteMediaConnection(state, siteNodeId),
      [siteNodeId],
    ),
    shallow,
  );

  const bindings = useMemo<SiteGraphBindingSources>(
    () => ({
      dataset: connectedDataset,
      contentMediaList: contentSnapshot?.mediaListOutput ?? null,
      populateBindings: contentSnapshot?.templateBindings ?? null,
      populateNodeId: contentSnapshot?.sourceNodeId ?? null,
      populateDataset: populateNodeId ? populateDataset : null,
      populateListId: contentSnapshot?.populateListId ?? null,
      mediaUrl: mediaSnapshot?.url ?? null,
    }),
    [
      connectedDataset,
      contentSnapshot?.mediaListOutput,
      contentSnapshot?.populateListId,
      contentSnapshot?.sourceNodeId,
      contentSnapshot?.templateBindings,
      mediaSnapshot?.url,
      populateDataset,
      populateNodeId,
    ],
  );

  const status = useMemo(
    () =>
      buildSiteGraphConnectionStatus({
        dataset: connectedDataset,
        datasetConnected,
        datasetLabel: connectedDataset?.name ?? null,
        contentMediaList: contentSnapshot?.mediaListOutput ?? null,
        contentConnected: Boolean(contentSnapshot?.connected && !contentSnapshot.missing),
        contentLabel: contentSnapshot?.label ?? null,
        mediaUrl: mediaSnapshot?.url ?? null,
        mediaConnected: Boolean(mediaSnapshot?.connected),
        mediaLabel: mediaSnapshot?.label ?? null,
      }),
    [
      connectedDataset,
      contentSnapshot?.connected,
      contentSnapshot?.label,
      contentSnapshot?.mediaListOutput,
      contentSnapshot?.missing,
      datasetConnected,
      mediaSnapshot?.connected,
      mediaSnapshot?.label,
      mediaSnapshot?.url,
    ],
  );

  return { bindings, status, datasetLoading: datasetLoading || populateDatasetLoading };
}
