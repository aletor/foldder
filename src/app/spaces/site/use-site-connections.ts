"use client";

import { useCallback, useMemo } from "react";
import { useStore, type Edge, type Node, type ReactFlowState } from "@xyflow/react";
import { shallow } from "zustand/shallow";
import { useDesignerConnectedDataset } from "@/app/spaces/designer/use-designer-connected-dataset";
import type { PopulateNodeData } from "@/app/spaces/populate/populate-types";
import { getMediaSinkInfo } from "@/app/spaces/space-media-list";
import { isMediaListOutput, type MediaListOutput } from "@/app/spaces/media-list-output";
import {
  buildSiteGraphConnectionStatus,
  type SiteGraphBindingSources,
  type SiteGraphConnectionStatus,
} from "@/lib/site/site-bindings";

type SiteContentSnapshot = {
  connected: boolean;
  missing: boolean;
  sourceNodeId: string | null;
  label: string | null;
  mediaListOutput: MediaListOutput | null;
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
  if (!source || source.type !== "populate") {
    return { connected: true, missing: true, sourceNodeId: null, label: null, mediaListOutput: null };
  }

  const data = (source.data ?? {}) as unknown as PopulateNodeData;
  const mediaListOutput = isMediaListOutput(data.mediaListOutput) ? data.mediaListOutput : null;

  return {
    connected: true,
    missing: false,
    sourceNodeId: source.id,
    label: data.label?.trim() || "Populate",
    mediaListOutput,
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
    url: sink?.url?.trim() || null,
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
      mediaUrl: mediaSnapshot?.url ?? null,
    }),
    [connectedDataset, contentSnapshot?.mediaListOutput, mediaSnapshot?.url],
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

  return { bindings, status, datasetLoading };
}
