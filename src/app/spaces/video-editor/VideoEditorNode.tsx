"use client";

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NodeResizer, Position, useNodeId, useReactFlow, useStore, useUpdateNodeInternals, type Edge, type Node, type NodeProps, type ReactFlowState } from "@xyflow/react";
import { shallow } from "zustand/shallow";
import { AlertTriangle, Captions, CheckCircle2, Clock, Copy, Download, Eye, EyeOff, File, Film, ImageIcon, Layers, Lock, Music, Pause, Play, Plus, RefreshCw, Scissors, SkipBack, SkipForward, StepBack, StepForward, Trash2, Unlock, Video, Volume2, VolumeX, X } from "lucide-react";

import { downloadS3Object, forceDownloadUrl } from "@/lib/browser-download";
import { FOLDDER_FIT_VIEW_EASE } from "@/lib/fit-view-ease";
import { tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";
import { ScrubNumberInput } from "../ScrubNumberInput";
import { FoldderDataHandle } from "../FoldderDataHandle";
import { FoldderStudioHeader, foldderStudioHeaderActionClassName } from "../FoldderStudioHeader";
import { NodeLabel, FoldderStudioModeCenterButton } from "../foldder-node-ui";
import { hasVideoEditorStudioTouched, touchStudioNodeData } from "../studio-node/foldder-studio-touched";
import { FoldderStudioTouchedMark } from "../studio-node/foldder-studio-touched-mark";
import { readMediaListFromNode } from "../media-list-consumers";
import type { MediaListItem, MediaListOutput } from "../media-list-output";
import { generateTimelineAudio } from "./video-editor-audio-generation-service";
import {
  addMediaListItemToTimeline,
  approveTimelineAudioVariation,
  buildVideoEditorRenderManifest,
  calculateTimelineDuration,
  clampVideoEditorTime,
  createVideoEditorTimelineTrack,
  createAudioRequest,
  deleteVideoEditorTimelineTrack,
  duplicateVideoEditorClip,
  getAdjacentVisualClipsAtTime,
  getActiveAudioClipsAtTime,
  getActiveVisualClipAtTime,
  getVideoEditorClipMaxDuration,
  getVideoEditorTimelineTracks,
  getVideoEditorNodePreviewClip,
  ingestMediaListToVideoEditor,
  moveVideoEditorClip,
  normalizeVideoEditorData,
  patchVideoEditorClip,
  patchVideoEditorTimelineTrack,
  removeVideoEditorClip,
  resizeVideoEditorClip,
  setVideoEditorClipEndTrim,
  setVideoEditorClipStartTrim,
  splitVideoEditorClipAtTime,
  trimVideoEditorClipStart,
} from "./video-editor-engine";
import {
  buildMediaListFromConnectedVideos,
  getVisibleVideoEditorVideoSlots,
  mergeVideoEditorIncomingMedia,
  selectVideoEditorVideoInputState,
  VIDEO_EDITOR_VIDEO_SLOT_IDS,
  VIDEO_EDITOR_VIDEO_SLOTS,
} from "./video-editor-connected-media";
import {
  createDefaultVideoEditorRenderState,
  type TimelineAudioRequest,
  type VideoEditorClip,
  type VideoEditorNodeData,
  type VideoEditorRenderState,
} from "./video-editor-types";
import type { VideoEditorRenderManifestResult } from "./video-editor-render-types";
import { createDefaultSubtitleStyle, type FoldderSubtitleDocument, type RenderSubtitleMode, type SubtitleStyle, type VideoEditorSubtitleTrack } from "./subtitles-types";
import {
  createSubtitleDocumentFromText,
  exportSubtitleDocumentToAss,
  exportSubtitleDocumentToSrt,
  exportSubtitleDocumentToVtt,
} from "./subtitle-utils";
import { useFoldderRenderMetric } from "../use-performance-metrics";
import { useNodeViewportVisibility } from "../use-node-viewport-visibility";
import {
  foldderGridFrame,
  getStaticNodeGridAspectRatio,
  snapAspectDimensionsToGrid,
} from "../canvas-grid-layout";

const VIDEO_EDITOR_URL_TTL_MS = 50 * 60 * 1000;
const videoEditorPresignedUrlCache = new globalThis.Map<string, { url: string; expiresAt: number }>();
const videoEditorPresignInFlight = new globalThis.Map<string, Promise<string | null>>();

const VIDEO_EDITOR_EMPTY_BACKGROUND_SRC = "/assets/nodes/video-editor-empty.jpg";
const VIDEO_EDITOR_NODE_MAX_HEIGHT = 2200;
const VIDEO_EDITOR_ASPECT_RATIO = getStaticNodeGridAspectRatio("video_editor") ?? 524 / 308;
const VIDEO_EDITOR_MIN_WIDTH = 200;
const VIDEO_EDITOR_MIN_HEIGHT = Math.max(120, Math.round(VIDEO_EDITOR_MIN_WIDTH / VIDEO_EDITOR_ASPECT_RATIO));
const NODE_RESIZE_END_FIT_PADDING = 0.8;

function VideoEditorNodeResizer(props: React.ComponentProps<typeof NodeResizer>) {
  const nodeId = useNodeId();
  const { fitView } = useReactFlow();
  const { onResizeEnd, ...rest } = props;
  return (
    <NodeResizer
      {...rest}
      onResizeEnd={(event, params) => {
        onResizeEnd?.(event, params);
        if (nodeId) {
          requestAnimationFrame(() => {
            void fitView({
              nodes: [{ id: nodeId }],
              padding: NODE_RESIZE_END_FIT_PADDING,
              duration: 560,
              interpolate: "smooth",
              ...FOLDDER_FIT_VIEW_EASE,
            });
          });
        }
      }}
    />
  );
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const tenths = Math.floor((safe % 1) * 10);
  return `${minutes}:${String(secs).padStart(2, "0")}.${tenths}`;
}

type VideoEditorInspectorTab = "clip" | "audio" | "subtitles" | "render";

const TIMELINE_LABEL_WIDTH = 128;
const TIMELINE_SNAP_SECONDS = 0.18;
const MIN_TIMELINE_HEIGHT = 180;
const MAX_TIMELINE_HEIGHT = 560;
const MIN_SUBTITLE_SEGMENT_DURATION = 0.35;

function roundTimelineTime(seconds: number): number {
  return Math.max(0, Math.round(seconds * 10) / 10);
}

function clampTimelineHeight(height: number): number {
  return Math.max(MIN_TIMELINE_HEIGHT, Math.min(MAX_TIMELINE_HEIGHT, Math.round(height)));
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT" || target.isContentEditable;
}

function resolveS3Key(src?: string, s3Key?: string): string | undefined {
  if (s3Key?.trim()) return s3Key.trim();
  return src ? tryExtractKnowledgeFilesKeyFromUrl(src) || undefined : undefined;
}

async function presignVideoEditorS3Key(key: string): Promise<string | null> {
  const cached = videoEditorPresignedUrlCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  const pending = videoEditorPresignInFlight.get(key);
  if (pending) return pending;
  const promise = (async () => {
    try {
      const res = await fetch("/api/spaces/s3-presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys: [key] }),
      });
      if (!res.ok) return null;
      const payload = (await res.json()) as { urls?: Record<string, string> };
      const url = payload.urls?.[key];
      if (!url) return null;
      videoEditorPresignedUrlCache.set(key, { url, expiresAt: Date.now() + VIDEO_EDITOR_URL_TTL_MS });
      return url;
    } catch {
      return null;
    } finally {
      videoEditorPresignInFlight.delete(key);
    }
  })();
  videoEditorPresignInFlight.set(key, promise);
  return promise;
}

function useVideoEditorAssetUrl(src?: string, s3Key?: string, enabled = true): string | undefined {
  const [resolved, setResolved] = useState<{ cacheKey: string; url: string } | null>(null);
  const key = resolveS3Key(src, s3Key);
  const cacheKey = `${src || ""}\u0001${key || ""}`;
  useEffect(() => {
    let cancelled = false;
    if (!enabled) return () => {
      cancelled = true;
    };
    if (!key) return () => {
      cancelled = true;
    };
    void (async () => {
      const fresh = await presignVideoEditorS3Key(key);
      if (!cancelled && fresh) setResolved({ cacheKey, url: fresh });
    })();
    return () => {
      cancelled = true;
    };
  }, [cacheKey, enabled, key]);
  if (!enabled) return undefined;
  return key ? (resolved?.cacheKey === cacheKey ? resolved.url : undefined) : src;
}

type ConnectedMediaListSourceSnapshot = {
  edgeId: string;
  sourceId: string;
  sourceType?: string;
  sourceData?: unknown;
} | null;

function selectConnectedMediaListSource(
  state: ReactFlowState<Node, Edge>,
  nodeId: string,
): ConnectedMediaListSourceSnapshot {
  const edge = state.edges.find((item) => item.target === nodeId && (!item.targetHandle || item.targetHandle === "media_list"));
  if (!edge) return null;
  const sourceNode = state.nodeLookup.get(edge.source);
  if (!sourceNode) return null;
  return {
    edgeId: edge.id,
    sourceId: sourceNode.id,
    sourceType: sourceNode.type,
    sourceData: sourceNode.data,
  };
}

function useConnectedMediaList(nodeId: string): MediaListOutput | null {
  const source = useStore(
    useCallback((state: ReactFlowState<Node, Edge>) => selectConnectedMediaListSource(state, nodeId), [nodeId]),
    shallow,
  );
  return useMemo(() => {
    if (!source) return null;
    return readMediaListFromNode({
      id: source.sourceId,
      type: source.sourceType,
      data: source.sourceData,
    } as Node);
  }, [source]);
}

function useVideoEditorIncomingMedia(nodeId: string) {
  const videoInputState = useStore(
    useCallback((state: ReactFlowState<Node, Edge>) => selectVideoEditorVideoInputState(state, nodeId), [nodeId]),
    shallow,
  );
  const sourceMediaList = useConnectedMediaList(nodeId);
  const connectedVideosMediaList = useMemo(
    () => buildMediaListFromConnectedVideos(videoInputState.slots),
    [videoInputState.slots],
  );
  const combinedSourceMediaList = useMemo(
    () => mergeVideoEditorIncomingMedia(sourceMediaList, connectedVideosMediaList),
    [connectedVideosMediaList, sourceMediaList],
  );
  const visibleVideoSlotIds = useMemo(
    () => getVisibleVideoEditorVideoSlots(videoInputState.connectedBySlot),
    [videoInputState.connectedBySlot],
  );
  return {
    sourceMediaList,
    connectedVideosMediaList,
    combinedSourceMediaList,
    connectedByVideoSlot: videoInputState.connectedBySlot,
    visibleVideoSlotIds,
    connectedVideoCount: connectedVideosMediaList?.items.length ?? 0,
  };
}

function clipStats(data: VideoEditorNodeData) {
  const clips = Object.values(data.tracks).flat();
  return {
    clips,
    videos: clips.filter((clip) => clip.mediaType === "video").length,
    images: clips.filter((clip) => clip.mediaType === "image").length,
    audio: clips.filter((clip) => clip.mediaType === "audio").length,
    duration: calculateTimelineDuration(data.tracks),
  };
}

function MediaPreview({ item, className, mediaVisible = true }: { item: MediaListItem; className?: string; mediaVisible?: boolean }) {
  const url = useVideoEditorAssetUrl(item.url || item.assetId, item.s3Key, mediaVisible);
  const baseClass = cx("flex h-full w-full items-center justify-center bg-slate-900 text-white/35", className);
  if (!mediaVisible && (item.mediaType === "video" || item.mediaType === "image")) {
    return <div className={baseClass}>{item.mediaType === "video" ? <Film size={28} /> : <ImageIcon size={28} />}</div>;
  }
  if (item.mediaType === "video" && url) return <video className={cx("h-full w-full object-cover", className)} src={url} muted playsInline preload="metadata" />;
  if (item.mediaType === "image" && url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={cx("h-full w-full object-cover", className)} src={url} alt={item.title} />;
  }
  if (item.mediaType === "audio") return <div className={baseClass}><Music size={28} /></div>;
  if (item.mediaType === "placeholder") return <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-300"><Layers size={28} /></div>;
  return <div className={baseClass}><File size={28} /></div>;
}

function ClipPreview({
  clip,
  playheadTime,
  isPlaying,
  mediaVisible,
  onDurationKnown,
}: {
  clip?: VideoEditorClip;
  playheadTime: number;
  isPlaying: boolean;
  mediaVisible: boolean;
  onDurationKnown?: (clipId: string, durationSeconds: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const url = useVideoEditorAssetUrl(clip?.url || clip?.assetId, clip?.s3Key, mediaVisible);
  const loadKey = `${clip?.id || "empty"}:${url || "pending"}`;
  const [loadState, setLoadState] = useState<{ key: string; status: "idle" | "loading" | "ready" | "error" }>({ key: "", status: "idle" });
  const effectiveLoadState = loadState.key === loadKey ? loadState.status : clip ? "loading" : "idle";
  const setCurrentLoadState = useCallback((status: "idle" | "loading" | "ready" | "error") => {
    setLoadState({ key: loadKey, status });
  }, [loadKey]);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !clip || clip.mediaType !== "video") return;
    if (!mediaVisible) {
      video.pause();
      return;
    }
    const targetTime = Math.max(0, (clip.trimStart ?? 0) + (playheadTime - clip.startTime));
    if (video.readyState > 0 && Math.abs(video.currentTime - targetTime) > 0.35) video.currentTime = targetTime;
    video.volume = clip.mute ? 0 : Math.max(0, Math.min(1, clip.volume ?? 1));
    if (isPlaying) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }, [clip, isPlaying, mediaVisible, playheadTime]);
  if (!clip) {
    return <div className="flex h-full items-center justify-center bg-black text-sm text-white/32">Sin clip visual en este punto.</div>;
  }
  if (!mediaVisible && (clip.mediaType === "video" || clip.mediaType === "image")) {
    return (
      <div className="flex h-full items-center justify-center bg-black text-xs font-black uppercase tracking-[0.12em] text-white/32">
        Preview pausada fuera de viewport
      </div>
    );
  }
  const loadingOverlay = effectiveLoadState === "loading" ? (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-none bg-black/45 text-xs font-black uppercase tracking-[0.12em] text-white/48">
      Cargando media
    </div>
  ) : effectiveLoadState === "error" ? (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-none bg-rose-950/55 text-xs font-black uppercase tracking-[0.12em] text-rose-100/75">
      Media no disponible
    </div>
  ) : null;
  if (clip.mediaType === "video" && url) return (
    <div className="relative h-full w-full">
      <video
        ref={videoRef}
        className="h-full w-full rounded-none object-contain"
        src={url}
        muted={clip.mute ?? true}
        playsInline
        preload="auto"
        onLoadedMetadata={(event) => {
          const duration = event.currentTarget.duration;
          if (Number.isFinite(duration) && duration > 0) onDurationKnown?.(clip.id, duration);
          setCurrentLoadState("ready");
        }}
        onCanPlay={() => setCurrentLoadState("ready")}
        onWaiting={() => setCurrentLoadState("loading")}
        onError={() => setCurrentLoadState("error")}
      />
      {loadingOverlay}
    </div>
  );
  if (clip.mediaType === "image" && url) {
    return (
      <div className="relative h-full w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={cx("h-full w-full rounded-none", clip.framing === "fit" ? "object-contain" : "object-cover")}
          src={url}
          alt={clip.title}
          onLoad={() => setCurrentLoadState("ready")}
          onError={() => setCurrentLoadState("error")}
        />
        {loadingOverlay}
      </div>
    );
  }
  if (clip.mediaType === "audio" && url) return <audio className="w-full" src={url} controls />;
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-none border border-white/10 bg-white/[0.04] text-white/36">
      {clip.mediaType === "audio" ? <Music size={34} /> : clip.mediaType === "video" ? <Video size={34} /> : <ImageIcon size={34} />}
      <div className="mt-3 text-sm">{clip.title}</div>
    </div>
  );
}

function TimelineAudioPlayer({ clip, playheadTime, isPlaying }: { clip: VideoEditorClip; playheadTime: number; isPlaying: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const url = useVideoEditorAssetUrl(clip.url || clip.assetId, clip.s3Key);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !url) return;
    const targetTime = Math.max(0, (clip.trimStart ?? 0) + (playheadTime - clip.startTime));
    if (Math.abs(audio.currentTime - targetTime) > 0.35) audio.currentTime = targetTime;
    audio.volume = clip.mute ? 0 : Math.max(0, Math.min(1, clip.volume ?? 1));
    if (isPlaying && !clip.mute) {
      void audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  }, [clip, isPlaying, playheadTime, url]);
  if (!url) return null;
  return <audio ref={audioRef} src={url} preload="auto" />;
}

function TimelineAssetPreloadItem({
  clip,
  onDurationKnown,
}: {
  clip: VideoEditorClip;
  onDurationKnown: (clipId: string, durationSeconds: number) => void;
}) {
  const url = useVideoEditorAssetUrl(clip.url || clip.assetId, clip.s3Key);
  if (!url) return null;
  if (clip.mediaType === "video") {
    return (
      <video
        src={url}
        muted
        playsInline
        preload="auto"
        onLoadedMetadata={(event) => {
          const duration = event.currentTarget.duration;
          if (Number.isFinite(duration) && duration > 0) onDurationKnown(clip.id, duration);
        }}
      />
    );
  }
  if (clip.mediaType === "audio") {
    return (
      <audio
        src={url}
        preload="auto"
        onLoadedMetadata={(event) => {
          const duration = event.currentTarget.duration;
          if (Number.isFinite(duration) && duration > 0) onDurationKnown(clip.id, duration);
        }}
      />
    );
  }
  return null;
}

function TimelineAssetPreloader({
  clips,
  onDurationKnown,
}: {
  clips: VideoEditorClip[];
  onDurationKnown: (clipId: string, durationSeconds: number) => void;
}) {
  return (
    <div aria-hidden className="hidden">
      {clips.map((clip) => (
        <TimelineAssetPreloadItem key={clip.id} clip={clip} onDurationKnown={onDurationKnown} />
      ))}
    </div>
  );
}

function waveformBarHeight(seed: string, index: number): number {
  let hash = 0;
  for (let charIndex = 0; charIndex < seed.length; charIndex++) {
    hash = (hash * 31 + seed.charCodeAt(charIndex) + index * 17) % 997;
  }
  return 22 + (hash % 66);
}

function TimelineClipFace({ clip, mediaVisible }: { clip: VideoEditorClip; mediaVisible: boolean }) {
  const url = useVideoEditorAssetUrl(clip.url || clip.assetId, clip.s3Key, mediaVisible);
  if (clip.mediaType === "audio") {
    return (
      <div className="pointer-events-none absolute inset-x-2 bottom-1 top-5 flex items-center gap-[2px] opacity-65">
        {Array.from({ length: 18 }).map((_, index) => (
          <span
            key={index}
            className="min-w-[2px] flex-1 rounded-full bg-emerald-100/45"
            style={{ height: `${waveformBarHeight(clip.id + clip.title, index)}%` }}
          />
        ))}
      </div>
    );
  }
  if (clip.mediaType === "image" && url) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-24 saturate-75" src={url} alt="" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-sky-950/70 via-transparent to-sky-950/60" />
      </>
    );
  }
  if (clip.mediaType === "video" && url) {
    return (
      <>
        <video className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-22 saturate-75" src={url} muted playsInline preload="metadata" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,.08)_0_1px,transparent_1px_18px)]" />
      </>
    );
  }
  return (
    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,.06)_0_1px,transparent_1px_16px)] opacity-50" />
  );
}

const VIDEO_EDITOR_INSPECTOR_INPUT =
  "w-full rounded-none border border-white/10 bg-white/[0.055] px-2 py-1 text-[11px] text-white outline-none";

function NumberInput({
  value,
  onChange,
  min = 0,
  step = 0.5,
}: {
  value: number | undefined;
  onChange: (value: number) => void;
  min?: number;
  step?: number;
}) {
  const clamp = useCallback((next: number) => Math.max(min, Number.isFinite(next) ? next : min), [min]);
  const round = useCallback((next: number) => {
    const stepText = String(step);
    const decimals = stepText.includes(".") ? stepText.split(".")[1]?.length ?? 0 : 0;
    return Number((Math.round(next / step) * step).toFixed(Math.min(4, decimals + 1)));
  }, [step]);
  const displayValue = Number.isFinite(value) ? round(value!) : 0;
  const commitValue = useCallback((next: number) => onChange(round(clamp(next))), [clamp, onChange, round]);
  return (
    <ScrubNumberInput
      min={min}
      step={step}
      value={displayValue}
      onKeyboardCommit={commitValue}
      onScrubLive={commitValue}
      onScrubEnd={() => undefined}
      roundFn={round}
      title="Arrastra horizontalmente para ajustar. Mayús = x10."
      className={`${VIDEO_EDITOR_INSPECTOR_INPUT} cursor-ew-resize`}
    />
  );
}

function InspectorSection({
  title,
  children,
  compact,
}: {
  title: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <section className={cx("grid", compact ? "gap-1" : "gap-2")}>
      <div className={cx("font-black uppercase tracking-[0.12em] text-white/36", compact ? "text-[9px]" : "text-[10px] tracking-[0.14em]")}>{title}</div>
      <div className={cx("grid", compact ? "gap-1.5" : "gap-2")}>{children}</div>
    </section>
  );
}

function TimelineClipActions({
  selectedClip,
  canSplitSelectedClip,
  onSplit,
  onDuplicate,
  onDelete,
}: {
  selectedClip: VideoEditorClip | null;
  canSplitSelectedClip: boolean;
  onSplit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5 border-r border-white/10 pr-2">
      <button
        type="button"
        disabled={!selectedClip || !canSplitSelectedClip}
        onClick={onSplit}
        title="Cortar clip en el playhead"
        className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-[0.06em] text-white/55 hover:bg-white/[0.06] hover:text-white/85 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <Scissors size={12} />
        Cortar
      </button>
      <button
        type="button"
        disabled={!selectedClip}
        onClick={onDuplicate}
        title="Duplicar clip seleccionado"
        className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-[0.06em] text-white/55 hover:bg-white/[0.06] hover:text-white/85 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <Copy size={12} />
        Duplicar
      </button>
      <button
        type="button"
        disabled={!selectedClip}
        onClick={onDelete}
        title="Borrar clip seleccionado"
        className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-[0.06em] text-rose-200/75 hover:bg-rose-500/10 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <Trash2 size={12} />
        Borrar
      </button>
    </div>
  );
}

function downloadTextFile(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function activeSubtitleSegment(document: FoldderSubtitleDocument | undefined, time: number) {
  return document?.segments.find((segment) => segment.start <= time && time < segment.end);
}

function subtitleWordsFromText(segmentId: string, text: string, start: number, end: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const duration = Math.max(MIN_SUBTITLE_SEGMENT_DURATION, end - start);
  return words.map((word, index) => {
    const step = duration / Math.max(1, words.length);
    return {
      id: `${segmentId}_w_${index}`,
      text: word,
      start: start + index * step,
      end: start + (index + 1) * step,
      emphasis: "none" as const,
    };
  });
}

function clampSubtitleSegmentTiming(start: number, end: number, maxDuration: number) {
  const timelineMax = Math.max(MIN_SUBTITLE_SEGMENT_DURATION, maxDuration || end || start + 2);
  const safeStart = Math.max(0, Math.min(Number.isFinite(start) ? start : 0, timelineMax - MIN_SUBTITLE_SEGMENT_DURATION));
  const safeEnd = Math.max(safeStart + MIN_SUBTITLE_SEGMENT_DURATION, Number.isFinite(end) ? end : safeStart + 2);
  const roundedStart = roundTimelineTime(safeStart);
  const roundedEnd = roundTimelineTime(Math.min(timelineMax, safeEnd));
  return {
    start: roundedStart,
    end: Math.min(roundTimelineTime(timelineMax), Math.max(roundTimelineTime(roundedStart + MIN_SUBTITLE_SEGMENT_DURATION), roundedEnd)),
  };
}

function subtitleStyleToCss(style: SubtitleStyle): React.CSSProperties {
  const background = style.background;
  return {
    left: `${style.position.x}%`,
    top: `${style.position.y}%`,
    transform: "translate(-50%, -100%)",
    fontFamily: style.fontFamily || "Arial",
    fontSize: `clamp(18px, ${(style.fontSize || 54) / 18}vw, ${style.fontSize || 54}px)`,
    fontWeight: style.fontWeight || 800,
    color: style.color || "#fff",
    backgroundColor: background?.enabled ? `rgba(0,0,0,${background.opacity ?? 0.55})` : "transparent",
    borderRadius: background?.enabled ? background.radius ?? 18 : 0,
    padding: background?.enabled ? `${Math.max(4, (background.padding ?? 18) / 2)}px ${background.padding ?? 18}px` : 0,
    textShadow: "0 2px 18px rgba(0,0,0,.7)",
  };
}

function SubtitlePreviewOverlay({
  track,
  currentTime,
}: {
  track?: VideoEditorSubtitleTrack;
  currentTime: number;
}) {
  if (!track?.enabled) return null;
  const segment = activeSubtitleSegment(track.document, currentTime);
  if (!segment) return null;
  const style = track.style || track.document.style || createDefaultSubtitleStyle("creator");
  const activeWord = segment.words.find((word) => word.start <= currentTime && currentTime < word.end);
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div className="absolute max-w-[82%] text-center leading-[1.08] tracking-[-0.02em]" style={subtitleStyleToCss(style)}>
        {track.mode === "lines" ? segment.text : segment.words.map((word) => (
          <span key={word.id} className={word.id === activeWord?.id ? "text-yellow-200" : undefined}>
            {word.text}{" "}
          </span>
        ))}
      </div>
    </div>
  );
}

function createSubtitleTrackFromText(args: {
  text: string;
  durationSeconds: number;
  mode: RenderSubtitleMode;
  preset: SubtitleStyle["preset"];
  timelineId: string;
}): VideoEditorSubtitleTrack {
  const style = createDefaultSubtitleStyle(args.preset);
  const document = createSubtitleDocumentFromText({
    text: args.text,
    durationSeconds: args.durationSeconds,
    timelineId: args.timelineId,
    mode: args.mode,
    style,
  });
  return {
    id: `subtitle_track_${Math.random().toString(36).slice(2, 10)}`,
    enabled: true,
    mode: args.mode,
    burnIn: true,
    exportSrt: true,
    exportVtt: true,
    exportAss: true,
    document,
    style,
  };
}

function AudioRequestModal({
  type,
  playheadTime,
  sourceNodeId,
  sourceMediaListId,
  onClose,
  onCreate,
}: {
  type: TimelineAudioRequest["type"];
  playheadTime: number;
  sourceNodeId?: string;
  sourceMediaListId?: string;
  onClose: () => void;
  onCreate: (request: TimelineAudioRequest) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(type === "sfx" ? 2 : 12);
  const [mood, setMood] = useState("");
  const [intensity, setIntensity] = useState<TimelineAudioRequest["intensity"]>("medium");
  const [energy, setEnergy] = useState<TimelineAudioRequest["energy"]>("medium");
  const [variations, setVariations] = useState(2);
  const title = type === "sfx" ? "Añadir ruido / SFX" : type === "music" ? "Añadir música" : type === "ambience" ? "Añadir ambiente" : "Añadir voz en off";
  return createPortal(
    <div className="fixed inset-0 z-[100120] flex items-center justify-center bg-black/70 p-5">
      <div className="w-full max-w-xl rounded-none border border-white/12 bg-[#111827] p-5 text-white shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100/42">Audio prompt · {playheadTime.toFixed(1)}s</div>
            <h3 className="mt-1 text-xl font-black tracking-[-0.04em]">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-none border border-white/10 p-2 text-white/55"><X size={18} /></button>
        </div>
        <div className="mt-5 grid gap-3">
          <label className="grid gap-1">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Descripción</span>
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={4} placeholder="Puffy ladra dos veces, eco suave en el bosque..." className="rounded-none border border-white/10 bg-white/[0.055] px-3 py-2 text-sm outline-none" />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1"><span className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Duración</span><NumberInput value={duration} onChange={setDuration} min={0.5} /></label>
            <label className="grid gap-1"><span className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Intensidad</span><select value={intensity} onChange={(event) => setIntensity(event.target.value as TimelineAudioRequest["intensity"])} className="rounded-none border border-white/10 bg-white/[0.055] px-3 py-2 text-sm outline-none"><option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option></select></label>
            <label className="grid gap-1"><span className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Variaciones</span><select value={variations} onChange={(event) => setVariations(Number(event.target.value))} className="rounded-none border border-white/10 bg-white/[0.055] px-3 py-2 text-sm outline-none"><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></label>
          </div>
          {type === "music" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1"><span className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Mood</span><input value={mood} onChange={(event) => setMood(event.target.value)} className="rounded-none border border-white/10 bg-white/[0.055] px-3 py-2 text-sm outline-none" /></label>
              <label className="grid gap-1"><span className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Energía</span><select value={energy} onChange={(event) => setEnergy(event.target.value as TimelineAudioRequest["energy"])} className="rounded-none border border-white/10 bg-white/[0.055] px-3 py-2 text-sm outline-none"><option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option></select></label>
            </div>
          ) : null}
          <button
            type="button"
            disabled={!prompt.trim()}
            onClick={() => {
              onCreate(createAudioRequest({
                type,
                playheadTime,
                durationSeconds: duration,
                prompt,
                mood,
                intensity,
                energy,
                variations,
                sourceNodeId,
                sourceMediaListId,
              }));
              onClose();
            }}
            className="rounded-none bg-cyan-300/18 px-4 py-3 text-sm font-black uppercase tracking-[0.12em] text-cyan-50 disabled:opacity-40"
          >
            Generar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function RenderConfirmModal({
  result,
  onClose,
  onConfirm,
}: {
  result: VideoEditorRenderManifestResult;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const manifest = result.manifest;
  const checklist = [
    {
      label: "Visual",
      ok: !result.errors.some((error) => error.toLowerCase().includes("visual")),
      detail: manifest ? `${manifest.layers?.filter((layer) => layer.kind === "visual" && !layer.hidden).length ?? 1} pista(s)` : "Sin manifiesto",
    },
    {
      label: "Medios",
      ok: result.ignoredClips === 0,
      detail: result.ignoredClips ? `${result.ignoredClips} ignorado(s)` : `${result.includedClips} incluido(s)`,
    },
    {
      label: "Timeline",
      ok: !result.warnings.some((warning) => warning.toLowerCase().includes("hueco")),
      detail: manifest ? formatTime(manifest.durationSeconds) : "0:00.0",
    },
    {
      label: "Subtítulos",
      ok: !result.warnings.some((warning) => warning.toLowerCase().includes("subtítulo")),
      detail: manifest?.subtitleTracks?.length ? `${manifest.subtitleTracks.length} pista(s)` : "Sin subtítulos",
    },
  ];
  return createPortal(
    <div className="fixed inset-0 z-[100140] flex items-center justify-center bg-black/70 p-5">
      <div className="w-full max-w-2xl rounded-none border border-white/12 bg-[#111827] p-5 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100/42">Render V1</div>
            <h3 className="mt-1 text-2xl font-black tracking-[-0.05em]">Renderizar vídeo</h3>
            <p className="mt-2 text-sm text-white/46">Se generará un MP4 H.264/AAC con FFmpeg en backend. Si hay subtítulos activos con burn-in, se quemarán en el vídeo final.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-none border border-white/10 p-2 text-white/55"><X size={18} /></button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-5">
          <div className="rounded-none border border-white/10 bg-white/[0.045] p-3">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-white/34">Duración</div>
            <div className="mt-1 text-lg font-black">{formatTime(manifest?.durationSeconds ?? 0)}</div>
          </div>
          <div className="rounded-none border border-white/10 bg-white/[0.045] p-3">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-white/34">Formato</div>
            <div className="mt-1 text-lg font-black">{manifest?.settings.width}×{manifest?.settings.height}</div>
          </div>
          <div className="rounded-none border border-white/10 bg-white/[0.045] p-3">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-white/34">FPS</div>
            <div className="mt-1 text-lg font-black">{manifest?.settings.fps ?? 25}</div>
          </div>
          <div className="rounded-none border border-white/10 bg-white/[0.045] p-3">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-white/34">Clips</div>
            <div className="mt-1 text-lg font-black">{result.includedClips}</div>
          </div>
          <div className="rounded-none border border-white/10 bg-white/[0.045] p-3">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-white/34">Subtítulos</div>
            <div className="mt-1 text-lg font-black">{manifest?.subtitleTracks?.length ?? 0}</div>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          {checklist.map((item) => {
            const Icon = item.ok ? CheckCircle2 : AlertTriangle;
            return (
              <div key={item.label} className={cx("rounded-none border p-3", item.ok ? "border-emerald-200/12 bg-emerald-300/[0.055]" : "border-amber-200/18 bg-amber-300/10")}>
                <div className={cx("flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em]", item.ok ? "text-emerald-100/62" : "text-amber-100/78")}>
                  <Icon size={13} />
                  {item.label}
                </div>
                <div className="mt-1 truncate text-xs font-bold text-white/58">{item.detail}</div>
              </div>
            );
          })}
        </div>
        {result.warnings.length ? (
          <div className="mt-4 rounded-none border border-amber-200/15 bg-amber-300/10 p-3 text-sm text-amber-50/78">
            {result.warnings.map((warning) => <div key={warning}>{warning}</div>)}
          </div>
        ) : null}
        {result.errors.length ? (
          <div className="mt-4 rounded-none border border-rose-200/15 bg-rose-300/10 p-3 text-sm text-rose-50/78">
            {result.errors.map((error) => <div key={error}>{error}</div>)}
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-none border border-white/10 px-4 py-2 text-sm font-black uppercase tracking-[0.12em] text-white/58">Cancelar</button>
          <button type="button" disabled={!result.ok} onClick={onConfirm} className="rounded-none bg-cyan-300/18 px-4 py-2 text-sm font-black uppercase tracking-[0.12em] text-cyan-50 disabled:opacity-40">Confirmar render</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function RenderReadyModal({
  url,
  s3Key,
  onClose,
}: {
  url: string;
  s3Key?: string;
  onClose: () => void;
}) {
  const downloadRender = useCallback(async () => {
    if (s3Key) {
      downloadS3Object(s3Key, "foldder-video-render.mp4");
      return;
    }
    await forceDownloadUrl(url, "foldder-video-render.mp4");
  }, [s3Key, url]);
  return createPortal(
    <div className="fixed inset-0 z-[100320] flex items-center justify-center bg-black/78 p-5 backdrop-blur-md">
      <div className="relative z-[1] flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-none border border-white/14 bg-[#070b12] text-white shadow-[0_30px_110px_rgba(0,0,0,0.72)]">
        <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/[0.04] px-5 py-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100/46">Render final</div>
            <h3 className="mt-1 text-2xl font-black tracking-[-0.05em]">MP4 listo</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-none border border-white/10 bg-white/[0.055] p-2 text-white/64 hover:bg-white/[0.09]">
            <X size={18} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-5">
          <video className="max-h-[62dvh] w-full rounded-none bg-black object-contain" src={url} controls playsInline preload="metadata" />
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            <a href={url} target="_blank" rel="noreferrer" className="rounded-none border border-white/10 bg-white/[0.055] px-4 py-2 text-xs font-black uppercase tracking-[0.1em] text-white/72 hover:bg-white/[0.09]">
              Ver render
            </a>
            <button type="button" onClick={() => void downloadRender()} className="rounded-none bg-cyan-300/18 px-4 py-2 text-xs font-black uppercase tracking-[0.1em] text-cyan-50 hover:bg-cyan-300/24">
              Descargar MP4
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function VideoEditorStudio({
  nodeId,
  data,
  sourceMediaList,
  onChange,
  onClose,
}: {
  nodeId: string;
  data: VideoEditorNodeData;
  sourceMediaList: MediaListOutput | null;
  onChange: (next: VideoEditorNodeData) => void;
  onClose: () => void;
}) {
  const studioRootRef = useRef<HTMLDivElement | null>(null);
  const timelineViewportRef = useRef<HTMLDivElement | null>(null);
  const [audioModalType, setAudioModalType] = useState<TimelineAudioRequest["type"] | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  const [livePlayhead, setLivePlayhead] = useState(data.playheadTime);
  const [mediaFilter, setMediaFilter] = useState<"all" | "video" | "image" | "audio" | "pending">("all");
  const [inspectorTab, setInspectorTab] = useState<VideoEditorInspectorTab>("clip");
  const [subtitleDraft, setSubtitleDraft] = useState("");
  const [subtitleMode, setSubtitleMode] = useState<RenderSubtitleMode>("lines");
  const [subtitlePreset, setSubtitlePreset] = useState<SubtitleStyle["preset"]>("creator");
  const [subtitleTranscribing, setSubtitleTranscribing] = useState(false);
  const [subtitleTranscriptionError, setSubtitleTranscriptionError] = useState<string | null>(null);
  const [renderConfirmation, setRenderConfirmation] = useState<VideoEditorRenderManifestResult | null>(null);
  const [showRenderReadyModal, setShowRenderReadyModal] = useState(false);
  const [dragState, setDragState] = useState<{
    clipId: string;
    mode: "move" | "resize-start" | "resize-end";
    startX: number;
    startTime: number;
    durationSeconds: number;
  } | null>(null);
  const [subtitleDragState, setSubtitleDragState] = useState<{
    segmentId: string;
    mode: "move" | "resize-start" | "resize-end";
    startX: number;
    start: number;
    end: number;
  } | null>(null);
  const [dragPreview, setDragPreview] = useState<{ x: number; y: number; label: string } | null>(null);
  const [dragTargetTrackId, setDragTargetTrackId] = useState<string | null>(null);
  const [layoutDrag, setLayoutDrag] = useState<{ startY: number; startHeight: number } | null>(null);
  const [timelineViewport, setTimelineViewport] = useState({ scrollLeft: 0, width: 1200 });
  const timelineTracks = useMemo(() => getVideoEditorTimelineTracks(data), [data]);
  const selectedTrack = timelineTracks.find((track) => track.id === data.selectedTrackId);
  const selectedClip = timelineTracks.flatMap((track) => data.tracks[track.id] ?? []).find((clip) => clip.id === data.selectedClipId);
  const selectedClipMaxDuration = selectedClip ? getVideoEditorClipMaxDuration(selectedClip) : Number.POSITIVE_INFINITY;
  const selectedClipCompatibleTracks = selectedClip
    ? timelineTracks.filter((track) => track.kind === (selectedClip.mediaType === "audio" ? "audio" : "visual"))
    : [];
  const timelineClips = useMemo(() => timelineTracks
    .flatMap((track) => data.tracks[track.id] ?? [])
    .sort((a, b) => a.startTime - b.startTime || a.durationSeconds - b.durationSeconds), [data.tracks, timelineTracks]);
  const activeVisualClip = getActiveVisualClipAtTime(data, livePlayhead);
  const activeAudioClips = getActiveAudioClipsAtTime(data, livePlayhead);
  const preloadClips = useMemo(() => {
    const adjacentVisuals = getAdjacentVisualClipsAtTime(data, livePlayhead);
    const nearbyAudio = timelineTracks
      .filter((track) => track.kind === "audio" && !track.hidden)
      .flatMap((track) => data.tracks[track.id] ?? [])
      .filter((clip) => clip.mediaType === "audio" && clip.startTime < livePlayhead + 8 && clip.startTime + clip.durationSeconds > livePlayhead - 2);
    return [...adjacentVisuals, ...nearbyAudio];
  }, [data, livePlayhead, timelineTracks]);
  const primarySubtitleTrack = (data.subtitleTracks ?? [])[0];
  const activeSubtitleTrack = primarySubtitleTrack?.enabled ? primarySubtitleTrack : undefined;
  const subtitleSegments = primarySubtitleTrack?.document.segments ?? [];
  const selectedSubtitleSegment = subtitleSegments.find((segment) => segment.id === data.selectedSubtitleSegmentId);
  const selectedSubtitleSegmentIndex = selectedSubtitleSegment ? subtitleSegments.findIndex((segment) => segment.id === selectedSubtitleSegment.id) : -1;
  const placeholders = sourceMediaList?.items.filter((item) => item.mediaType === "placeholder") ?? [];
  const timelineScale = data.timelineZoom ?? 18;
  const timelineDuration = Math.max(1, data.totalDurationSeconds);
  const timelineWidth = Math.max(900, timelineDuration * timelineScale + 80);
  const timelineHeight = clampTimelineHeight(data.layout?.timelineHeight ?? 300);
  const visibleTimelineStart = Math.max(0, (timelineViewport.scrollLeft - TIMELINE_LABEL_WIDTH) / Math.max(1, timelineScale) - 8);
  const visibleTimelineEnd = Math.min(
    timelineDuration + 8,
    (timelineViewport.scrollLeft + timelineViewport.width - TIMELINE_LABEL_WIDTH) / Math.max(1, timelineScale) + 8,
  );
  const renderState = data.render ?? createDefaultVideoEditorRenderState();
  const renderPreviewUrl = useVideoEditorAssetUrl(renderState.outputUrl || renderState.outputAssetId, renderState.s3Key);
  const renderReadyUrl = renderPreviewUrl || renderState.outputUrl;
  const renderReadyKey = renderState.outputAssetId || renderState.s3Key || renderState.outputUrl || "";
  const lastAnnouncedRenderKeyRef = useRef(renderState.status === "ready" ? renderReadyKey : "");
  const previousRenderStatusRef = useRef(renderState.status);
  const subtitleTranscriptionSource = useMemo(() => {
    const clipCandidates = [
      selectedClip?.mediaType === "video" || selectedClip?.mediaType === "audio" ? selectedClip : undefined,
      activeVisualClip?.mediaType === "video" ? activeVisualClip : undefined,
      ...timelineTracks.flatMap((track) => data.tracks[track.id] ?? []).filter((clip) => clip.mediaType === "audio" || clip.mediaType === "video"),
    ].filter((clip): clip is VideoEditorClip => Boolean(clip?.assetId || clip?.url || clip?.s3Key));
    const clip = clipCandidates[0];
    if (clip) {
      return {
        title: clip.title,
        sourceAssetId: clip.assetId,
        sourceUrl: clip.url,
        s3Key: clip.s3Key || (clip.url ? tryExtractKnowledgeFilesKeyFromUrl(clip.url) ?? undefined : undefined),
        durationSeconds: clip.durationSeconds,
      };
    }
    if (renderState.status === "ready" && (renderState.outputAssetId || renderReadyUrl || renderState.s3Key)) {
      return {
        title: "Render final",
        sourceAssetId: renderState.outputAssetId,
        sourceUrl: renderReadyUrl,
        s3Key: renderState.s3Key,
        durationSeconds: data.totalDurationSeconds,
      };
    }
    return null;
  }, [activeVisualClip, data.totalDurationSeconds, data.tracks, renderReadyUrl, renderState.outputAssetId, renderState.s3Key, renderState.status, selectedClip, timelineTracks]);
  const filteredMediaItems = (sourceMediaList?.items ?? []).filter((item) => {
    if (mediaFilter === "all") return true;
    if (mediaFilter === "pending") return item.mediaType === "placeholder" || item.status === "missing" || item.status === "pending";
    return item.mediaType === mediaFilter;
  });
  const canSplitSelectedClip = Boolean(
    selectedClip
    && !selectedClip.locked
    && livePlayhead > selectedClip.startTime + 0.1
    && livePlayhead < selectedClip.startTime + selectedClip.durationSeconds - 0.1,
  );

  const commit = useCallback((next: VideoEditorNodeData) => {
    onChange({ ...next, totalDurationSeconds: calculateTimelineDuration(next.tracks) });
  }, [onChange]);

  const patchClipSourceDuration = useCallback((clipId: string, durationSeconds: number) => {
    const clip = timelineClips.find((item) => item.id === clipId);
    if (!clip || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return;
    if (Math.abs((clip.sourceDurationSeconds ?? 0) - durationSeconds) < 0.05) return;
    commit(patchVideoEditorClip(data, clipId, { sourceDurationSeconds: durationSeconds }));
  }, [commit, data, timelineClips]);

  const deleteSelectedClip = useCallback(() => {
    if (!data.selectedClipId) return;
    commit(removeVideoEditorClip(data, data.selectedClipId));
  }, [commit, data]);

  const splitSelectedClip = useCallback(() => {
    if (!selectedClip || !canSplitSelectedClip) return;
    commit(splitVideoEditorClipAtTime(data, selectedClip.id, livePlayhead));
  }, [canSplitSelectedClip, commit, data, livePlayhead, selectedClip]);

  const setPlayhead = useCallback((time: number) => {
    const nextTime = clampVideoEditorTime(time, 0, Math.max(0, data.totalDurationSeconds));
    setLivePlayhead(nextTime);
    commit({ ...data, playheadTime: nextTime, status: "editing" });
  }, [commit, data]);

  const focusClip = useCallback((clip: VideoEditorClip) => {
    const nextTime = clampVideoEditorTime(clip.startTime, 0, Math.max(0, data.totalDurationSeconds));
    setLivePlayhead(nextTime);
    setInspectorTab("clip");
    commit({ ...data, selectedClipId: clip.id, selectedTrackId: clip.track, playheadTime: nextTime, status: "editing" });
  }, [commit, data]);

  const selectClipForEditing = useCallback((clip: VideoEditorClip) => {
    setInspectorTab("clip");
    commit({ ...data, selectedClipId: clip.id, selectedTrackId: clip.track, status: "editing" });
  }, [commit, data]);

  const moveToRelativeClip = useCallback((direction: -1 | 1) => {
    if (!timelineClips.length) return;
    const referenceTime = selectedClip?.startTime ?? livePlayhead;
    const nextClip = direction < 0
      ? [...timelineClips].reverse().find((clip) => clip.startTime < referenceTime - 0.01) ?? timelineClips[0]
      : timelineClips.find((clip) => clip.startTime > referenceTime + 0.01) ?? timelineClips[timelineClips.length - 1];
    focusClip(nextClip);
  }, [focusClip, livePlayhead, selectedClip?.startTime, timelineClips]);

  const fitTimelineZoom = useCallback(() => {
    const viewportWidth = timelineViewportRef.current?.clientWidth ?? 980;
    const usableWidth = Math.max(320, viewportWidth - TIMELINE_LABEL_WIDTH - 96);
    const nextZoom = Math.max(8, Math.min(80, usableWidth / Math.max(1, timelineDuration)));
    commit({ ...data, timelineZoom: Math.round(nextZoom * 10) / 10 });
  }, [commit, data, timelineDuration]);

  const snapTimelineTime = useCallback((time: number, clipId?: string) => {
    const snapPoints = [
      0,
      livePlayhead,
      data.totalDurationSeconds,
      ...timelineClips
        .filter((clip) => clip.id !== clipId)
        .flatMap((clip) => [clip.startTime, clip.startTime + clip.durationSeconds]),
      ...(primarySubtitleTrack?.document.segments ?? []).flatMap((segment) => [segment.start, segment.end]),
    ];
    let best = time;
    let bestDistance = Number.POSITIVE_INFINITY;
    snapPoints.forEach((point) => {
      const distance = Math.abs(point - time);
      if (distance < bestDistance && distance <= TIMELINE_SNAP_SECONDS) {
        best = point;
        bestDistance = distance;
      }
    });
    return roundTimelineTime(best);
  }, [data.totalDurationSeconds, livePlayhead, primarySubtitleTrack?.document.segments, timelineClips]);

  const compatibleTrackAtPointer = useCallback((x: number, y: number, clipId: string): string | undefined => {
    const clip = timelineClips.find((item) => item.id === clipId);
    if (!clip) return undefined;
    const element = document.elementFromPoint(x, y);
    const lane = element?.closest("[data-video-editor-track-id]") as HTMLElement | null;
    const trackId = lane?.dataset.videoEditorTrackId;
    if (!trackId) return clip.track;
    const track = timelineTracks.find((item) => item.id === trackId);
    if (!track || track.locked) return clip.track;
    const compatibleKind = clip.mediaType === "audio" ? "audio" : "visual";
    return track.kind === compatibleKind ? track.id : clip.track;
  }, [timelineClips, timelineTracks]);

  const closeStudio = useCallback(() => {
    setPreviewFullscreen(false);
    commit({ ...data, playheadTime: livePlayhead });
    onClose();
  }, [commit, data, livePlayhead, onClose]);

  useEffect(() => {
    studioRootRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!isPlaying) return undefined;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const deltaSeconds = (now - last) / 1000;
      last = now;
      setLivePlayhead((current) => {
        const next = clampVideoEditorTime(current + deltaSeconds, 0, timelineDuration);
        if (next >= timelineDuration) {
          setIsPlaying(false);
          return timelineDuration;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, timelineDuration]);

  useEffect(() => {
    if (!dragState) return undefined;
    const onMove = (event: PointerEvent) => {
      const delta = (event.clientX - dragState.startX) / timelineScale;
      const rawStartTime = dragState.startTime + delta;
      const rawDuration = dragState.durationSeconds + delta;
      const snappedStartTime = event.altKey ? roundTimelineTime(rawStartTime) : snapTimelineTime(rawStartTime, dragState.clipId);
      const snappedDuration = event.altKey ? roundTimelineTime(rawDuration) : snapTimelineTime(dragState.startTime + rawDuration, dragState.clipId) - dragState.startTime;
      const targetTrackId = dragState.mode === "move" ? compatibleTrackAtPointer(event.clientX, event.clientY, dragState.clipId) : undefined;
      const next = dragState.mode === "move"
        ? moveVideoEditorClip(data, dragState.clipId, snappedStartTime, targetTrackId)
        : dragState.mode === "resize-start"
          ? trimVideoEditorClipStart(data, dragState.clipId, snappedStartTime)
          : resizeVideoEditorClip(data, dragState.clipId, Math.max(0.1, snappedDuration));
      const previewSeconds = dragState.mode === "resize-end" ? Math.max(0.1, snappedDuration) : snappedStartTime;
      const targetTrackLabel = targetTrackId ? timelineTracks.find((track) => track.id === targetTrackId)?.label : undefined;
      setDragTargetTrackId(targetTrackId ?? null);
      setDragPreview({
        x: event.clientX,
        y: event.clientY,
        label: dragState.mode === "move" ? `${targetTrackLabel ? `${targetTrackLabel} · ` : ""}${formatTime(previewSeconds)}` : `${formatTime(previewSeconds)} ${dragState.mode === "resize-end" ? "dur" : "inicio"}`,
      });
      commit(next);
    };
    const onUp = () => {
      setDragState(null);
      setDragPreview(null);
      setDragTargetTrackId(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [commit, compatibleTrackAtPointer, data, dragState, snapTimelineTime, timelineScale, timelineTracks]);

  useEffect(() => {
    if (!layoutDrag) return undefined;
    const onMove = (event: PointerEvent) => {
      const nextHeight = clampTimelineHeight(layoutDrag.startHeight - (event.clientY - layoutDrag.startY));
      commit({ ...data, layout: { ...(data.layout ?? {}), timelineHeight: nextHeight }, status: "editing" });
    };
    const onUp = () => setLayoutDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [commit, data, layoutDrag]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) {
        return;
      }
      event.stopImmediatePropagation();
      if (event.code === "Space") {
        event.preventDefault();
        if (isPlaying) commit({ ...data, playheadTime: livePlayhead });
        setIsPlaying((current) => !current);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setPlayhead(livePlayhead - 0.5);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setPlayhead(livePlayhead + 0.5);
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelectedClip();
      }
      if (event.key.toLowerCase() === "x") {
        event.preventDefault();
        splitSelectedClip();
      }
      if (event.key.toLowerCase() === "p") {
        event.preventDefault();
        setPreviewFullscreen((current) => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [commit, data, deleteSelectedClip, isPlaying, livePlayhead, setPlayhead, splitSelectedClip]);

  const refreshMedia = useCallback(() => {
    if (!sourceMediaList) return;
    commit(ingestMediaListToVideoEditor(sourceMediaList, data));
  }, [commit, data, sourceMediaList]);

  const createSubtitles = useCallback(() => {
    if (!subtitleDraft.trim()) return;
    const track = createSubtitleTrackFromText({
      text: subtitleDraft,
      durationSeconds: data.totalDurationSeconds || 8,
      mode: subtitleMode,
      preset: subtitlePreset,
      timelineId: nodeId,
    });
    commit({
      ...data,
      subtitleTracks: [track, ...(data.subtitleTracks ?? []).filter((item) => item.id !== track.id)],
      selectedSubtitleSegmentId: track.document.segments[0]?.id,
      status: "editing",
    });
  }, [commit, data, nodeId, subtitleDraft, subtitleMode, subtitlePreset]);

  const generateSubtitlesFromMedia = useCallback(async () => {
    if (!subtitleTranscriptionSource) {
      setSubtitleTranscriptionError("No hay vídeo o audio disponible para transcribir.");
      return;
    }
    setSubtitleTranscribing(true);
    setSubtitleTranscriptionError(null);
    try {
      const response = await fetch("/api/video-editor/subtitles/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceAssetId: subtitleTranscriptionSource.sourceAssetId,
          sourceUrl: subtitleTranscriptionSource.sourceUrl,
          s3Key: subtitleTranscriptionSource.s3Key,
          durationSeconds: subtitleTranscriptionSource.durationSeconds || data.totalDurationSeconds || 8,
          mode: subtitleMode,
          timelineId: nodeId,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; document?: FoldderSubtitleDocument; documentKey?: string; error?: string };
      if (!response.ok || !payload.ok || !payload.document) {
        throw new Error(payload.error || "No se pudieron generar subtítulos.");
      }
      const style = createDefaultSubtitleStyle(subtitlePreset);
      const document: FoldderSubtitleDocument = {
        ...payload.document,
        mode: subtitleMode,
        style,
        updatedAt: new Date().toISOString(),
      };
      const track: VideoEditorSubtitleTrack = {
        id: primarySubtitleTrack?.id || `subtitle_track_${Date.now()}`,
        enabled: true,
        mode: subtitleMode,
        burnIn: true,
        exportSrt: true,
        exportVtt: true,
        exportAss: true,
        documentKey: payload.documentKey,
        document,
        style,
      };
      commit({
        ...data,
        subtitleTracks: [track, ...(data.subtitleTracks ?? []).filter((item) => item.id !== track.id)],
        selectedSubtitleSegmentId: document.segments[0]?.id,
        status: "editing",
      });
    } catch (error) {
      setSubtitleTranscriptionError(error instanceof Error ? error.message : "subtitle_transcription_failed");
    } finally {
      setSubtitleTranscribing(false);
    }
  }, [commit, data, nodeId, primarySubtitleTrack?.id, subtitleMode, subtitlePreset, subtitleTranscriptionSource]);

  const patchSubtitleTrack = useCallback((trackId: string, patch: Partial<VideoEditorSubtitleTrack>) => {
    commit({
      ...data,
      subtitleTracks: (data.subtitleTracks ?? []).map((track) => track.id === trackId ? { ...track, ...patch } : track),
      status: "editing",
    });
  }, [commit, data]);

  const patchSubtitleSegment = useCallback((trackId: string, segmentId: string, patch: Partial<FoldderSubtitleDocument["segments"][number]>) => {
    commit({
      ...data,
      subtitleTracks: (data.subtitleTracks ?? []).map((track) => {
        if (track.id !== trackId) return track;
        const now = new Date().toISOString();
        const document = {
          ...track.document,
          status: "edited" as const,
          updatedAt: now,
          segments: track.document.segments.map((segment) => {
            if (segment.id !== segmentId) return segment;
            const rawStart = Number.isFinite(Number(patch.start)) ? Number(patch.start) : segment.start;
            const rawEnd = Number.isFinite(Number(patch.end)) ? Number(patch.end) : segment.end;
            const timing = clampSubtitleSegmentTiming(rawStart, rawEnd, data.totalDurationSeconds || track.document.durationSeconds || rawEnd);
            const text = typeof patch.text === "string" ? patch.text : segment.text;
            return {
              ...segment,
              ...patch,
              ...timing,
              text,
              words: subtitleWordsFromText(segmentId, text, timing.start, timing.end),
            };
          }).sort((a, b) => a.start - b.start || a.end - b.end),
        };
        return { ...track, document };
      }),
      selectedSubtitleSegmentId: segmentId,
      status: "editing",
    });
  }, [commit, data]);

  const selectSubtitleSegment = useCallback((segmentId: string, start: number) => {
    setInspectorTab("subtitles");
    setLivePlayhead(start);
    commit({ ...data, selectedSubtitleSegmentId: segmentId, playheadTime: start, status: "editing" });
  }, [commit, data]);

  const addSubtitleSegmentAtTime = useCallback((time: number) => {
    if (!primarySubtitleTrack) return;
    const start = roundTimelineTime(time);
    const end = Math.min(Math.max(start + 1.6, start + MIN_SUBTITLE_SEGMENT_DURATION), Math.max(start + MIN_SUBTITLE_SEGMENT_DURATION, data.totalDurationSeconds || start + 1.6));
    const segmentId = `sub_${Date.now()}`;
    const text = "Nuevo subtítulo";
    const segment = {
      id: segmentId,
      start,
      end: roundTimelineTime(end),
      text,
      words: subtitleWordsFromText(segmentId, text, start, roundTimelineTime(end)),
    };
    const now = new Date().toISOString();
    setInspectorTab("subtitles");
    commit({
      ...data,
      selectedSubtitleSegmentId: segmentId,
      subtitleTracks: (data.subtitleTracks ?? []).map((track) => track.id === primarySubtitleTrack.id
        ? {
          ...track,
          document: {
            ...track.document,
            status: "edited" as const,
            updatedAt: now,
            segments: [...track.document.segments, segment].sort((a, b) => a.start - b.start || a.end - b.end),
          },
        }
        : track),
      status: "editing",
    });
  }, [commit, data, primarySubtitleTrack]);

  const addSubtitleSegmentAtPlayhead = useCallback(() => {
    addSubtitleSegmentAtTime(livePlayhead);
  }, [addSubtitleSegmentAtTime, livePlayhead]);

  const removeSubtitleSegment = useCallback((trackId: string, segmentId: string) => {
    const track = (data.subtitleTracks ?? []).find((item) => item.id === trackId);
    const remaining = track?.document.segments.filter((segment) => segment.id !== segmentId) ?? [];
    const nextSelection = remaining[Math.min(Math.max(0, selectedSubtitleSegmentIndex), Math.max(0, remaining.length - 1))]?.id;
    commit({
      ...data,
      selectedSubtitleSegmentId: nextSelection,
      subtitleTracks: (data.subtitleTracks ?? []).map((item) => item.id === trackId
        ? {
          ...item,
          document: {
            ...item.document,
            status: "edited" as const,
            updatedAt: new Date().toISOString(),
            segments: remaining,
          },
        }
        : item),
      status: "editing",
    });
  }, [commit, data, selectedSubtitleSegmentIndex]);

  useEffect(() => {
    if (!subtitleDragState || !primarySubtitleTrack) return undefined;
    const onMove = (event: PointerEvent) => {
      const delta = (event.clientX - subtitleDragState.startX) / timelineScale;
      const originalDuration = Math.max(MIN_SUBTITLE_SEGMENT_DURATION, subtitleDragState.end - subtitleDragState.start);
      const maxDuration = Math.max(MIN_SUBTITLE_SEGMENT_DURATION, data.totalDurationSeconds || subtitleDragState.end || originalDuration);
      let start = subtitleDragState.start;
      let end = subtitleDragState.end;
      if (subtitleDragState.mode === "move") {
        start = Math.max(0, Math.min(maxDuration - originalDuration, subtitleDragState.start + delta));
        end = start + originalDuration;
      } else if (subtitleDragState.mode === "resize-start") {
        start = Math.min(subtitleDragState.end - MIN_SUBTITLE_SEGMENT_DURATION, Math.max(0, subtitleDragState.start + delta));
      } else {
        end = Math.max(subtitleDragState.start + MIN_SUBTITLE_SEGMENT_DURATION, Math.min(maxDuration, subtitleDragState.end + delta));
      }
      const timing = clampSubtitleSegmentTiming(start, end, maxDuration);
      setDragPreview({
        x: event.clientX,
        y: event.clientY,
        label: subtitleDragState.mode === "move" ? `${formatTime(timing.start)} → ${formatTime(timing.end)}` : `${formatTime(timing.start)} / ${formatTime(timing.end)}`,
      });
      patchSubtitleSegment(primarySubtitleTrack.id, subtitleDragState.segmentId, timing);
    };
    const onUp = () => {
      setSubtitleDragState(null);
      setDragPreview(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [data.totalDurationSeconds, patchSubtitleSegment, primarySubtitleTrack, subtitleDragState, timelineScale]);

  const addAudioRequest = useCallback(async (request: TimelineAudioRequest) => {
    const generatingData = { ...data, status: "generating_audio" as const, audioRequests: [...data.audioRequests, { ...request, status: "generating" as const }] };
    commit(generatingData);
    const result = await generateTimelineAudio(request);
    if (result.ok) {
      commit({
        ...generatingData,
        status: "editing",
        audioRequests: generatingData.audioRequests.map((item) => item.id === request.id ? { ...item, status: "generated", generatedAssetIds: result.generatedAssetIds } : item),
      });
    } else {
      commit({
        ...generatingData,
        status: "editing",
        audioRequests: generatingData.audioRequests.map((item) => item.id === request.id ? { ...item, status: "error", errorCode: result.errorCode, errorMessage: result.errorMessage } : item),
      });
    }
  }, [commit, data]);

  const openRenderConfirmation = useCallback(() => {
    setRenderConfirmation(buildVideoEditorRenderManifest(data, nodeId));
  }, [data, nodeId]);

  const runRender = useCallback(async () => {
    const manifest = renderConfirmation?.manifest;
    if (!manifest) return;
    setRenderConfirmation(null);
    const startedAt = new Date().toISOString();
    commit({
      ...data,
      render: {
        ...renderState,
        status: "preparing",
        progress: 0,
        error: undefined,
        startedAt,
        finishedAt: undefined,
      },
    });
    try {
      const renderingState = {
        ...data,
        render: {
          ...renderState,
          status: "rendering" as const,
          progress: 35,
          error: undefined,
          startedAt,
        },
      };
      commit(renderingState);
      const response = await fetch("/api/video-editor/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manifest }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        renderId?: string;
        status?: string;
        outputAssetId?: string;
        outputUrl?: string;
        s3Key?: string;
        error?: string;
      };
      if (!response.ok || payload.status === "error") {
        throw new Error(payload.error || "No se pudo renderizar el vídeo.");
      }
      commit({
        ...renderingState,
        render: {
          ...renderState,
          status: payload.status === "ready" ? "ready" : "rendering",
          progress: payload.status === "ready" ? 100 : 10,
          renderId: payload.renderId,
          outputAssetId: payload.outputAssetId,
          outputUrl: payload.outputUrl,
          s3Key: payload.s3Key,
          startedAt,
          finishedAt: payload.status === "ready" ? new Date().toISOString() : undefined,
        },
      });
    } catch (error) {
      commit({
        ...data,
        render: {
          ...renderState,
          status: "error",
          progress: 0,
          error: error instanceof Error ? error.message : "render_failed",
          startedAt,
          finishedAt: new Date().toISOString(),
        },
      });
    }
  }, [commit, data, renderConfirmation?.manifest, renderState]);

  useEffect(() => {
    const renderId = renderState.renderId;
    if (!renderId || !["preparing", "rendering", "uploading"].includes(renderState.status)) return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/video-editor/render-status?renderId=${encodeURIComponent(renderId)}`);
        const payload = (await response.json().catch(() => ({}))) as {
          status?: VideoEditorRenderState["status"];
          progress?: number;
          outputAssetId?: string;
          outputUrl?: string;
          s3Key?: string;
          error?: string;
          finishedAt?: string;
        };
        if (cancelled || !payload.status) return;
        commit({
          ...data,
          render: {
            ...renderState,
            status: payload.status,
            progress: payload.progress ?? renderState.progress,
            outputAssetId: payload.outputAssetId ?? renderState.outputAssetId,
            outputUrl: payload.outputUrl ?? renderState.outputUrl,
            s3Key: payload.s3Key ?? renderState.s3Key,
            error: payload.error,
            finishedAt: payload.finishedAt ?? (payload.status === "ready" || payload.status === "error" ? new Date().toISOString() : renderState.finishedAt),
          },
        });
      } catch (error) {
        if (cancelled) return;
        commit({
          ...data,
          render: {
            ...renderState,
            status: "error",
            error: error instanceof Error ? error.message : "render_status_failed",
            finishedAt: new Date().toISOString(),
          },
        });
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [commit, data, renderState]);

  useEffect(() => {
    const viewport = timelineViewportRef.current;
    if (!viewport) return;
    let raf = 0;
    const measure = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        setTimelineViewport({
          scrollLeft: viewport.scrollLeft,
          width: viewport.clientWidth || 1200,
        });
      });
    };
    measure();
    viewport.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(raf);
      viewport.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [timelineHeight, timelineScale, timelineWidth]);

  useEffect(() => {
    const previousStatus = previousRenderStatusRef.current;
    previousRenderStatusRef.current = renderState.status;
    if (renderState.status !== "ready" || previousStatus === "ready" || !renderReadyKey) return;
    if (lastAnnouncedRenderKeyRef.current === renderReadyKey) return;
    lastAnnouncedRenderKeyRef.current = renderReadyKey;
    setShowRenderReadyModal(true);
  }, [renderReadyKey, renderState.status]);

  return createPortal(
    <div
      ref={studioRootRef}
      tabIndex={-1}
      data-foldder-studio-canvas="video-editor"
      data-foldder-video-editor-studio=""
      className="fixed inset-0 z-[100070] flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden overscroll-none bg-[#0b0f14] text-white outline-none"
      data-foldder-video-editor-preview-fullscreen={previewFullscreen ? "" : undefined}
    >
      <FoldderStudioHeader
        nodeType="video_editor"
        nodeLabel="Video Editor"
        subtitle={
          previewFullscreen
            ? "Pantalla completa · P para salir"
            : sourceMediaList
              ? `${sourceMediaList.items.length} medios · ${formatTime(data.totalDurationSeconds)} timeline`
              : "Conecta vídeos o una media list"
        }
        onClose={closeStudio}
        closeLabel="Cerrar Studio"
        actions={
          <>
            <button
              type="button"
              onClick={openRenderConfirmation}
              disabled={renderState.status === "preparing" || renderState.status === "rendering" || renderState.status === "uploading"}
              className={`${foldderStudioHeaderActionClassName()} bg-[#3a8f96]/25 hover:bg-[#3a8f96]/35 disabled:bg-black/30`}
            >
              <Film size={14} className="shrink-0" />
              {renderState.status === "ready" ? "Render de nuevo" : renderState.status === "error" ? "Reintentar" : renderState.status === "preparing" || renderState.status === "rendering" || renderState.status === "uploading" ? "Renderizando..." : "Render"}
            </button>
            <button
              type="button"
              onClick={refreshMedia}
              disabled={!sourceMediaList}
              className={`${foldderStudioHeaderActionClassName()} disabled:opacity-35`}
              title="Actualizar medios conectados"
            >
              <RefreshCw size={14} className="shrink-0" />
              Actualizar
            </button>
          </>
        }
      />

      {previewFullscreen ? (
        <div className="relative flex min-h-0 flex-1 flex-col bg-black">
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <ClipPreview clip={activeVisualClip} playheadTime={livePlayhead} isPlaying={isPlaying} mediaVisible onDurationKnown={patchClipSourceDuration} />
            <SubtitlePreviewOverlay track={activeSubtitleTrack} currentTime={livePlayhead} />
          </div>
          <div className="shrink-0 border-t border-white/10 px-4 py-2">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white/75">{activeVisualClip?.title ?? "Sin clip visual activo"}</div>
                <div className="text-[10px] font-black uppercase tracking-[0.1em] text-white/32">P · salir</div>
              </div>
              <div className="text-xs font-semibold tabular-nums text-white/50">{formatTime(livePlayhead)} / {formatTime(data.totalDurationSeconds)}</div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setPlayhead(0)} className="p-1.5 text-white/50 hover:text-white/80"><SkipBack size={14} /></button>
                <button type="button" onClick={() => setPlayhead(livePlayhead - 1)} className="p-1.5 text-white/50 hover:text-white/80"><StepBack size={14} /></button>
                <button type="button" onClick={() => moveToRelativeClip(-1)} className="px-2 py-1 text-[10px] font-black uppercase text-white/45">−</button>
                <button
                  type="button"
                  onClick={() => {
                    if (isPlaying) commit({ ...data, playheadTime: livePlayhead });
                    setIsPlaying(!isPlaying);
                  }}
                  className="bg-[#3a8f96]/25 p-2 text-white"
                >
                  {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <button type="button" onClick={() => moveToRelativeClip(1)} className="px-2 py-1 text-[10px] font-black uppercase text-white/45">+</button>
                <button type="button" onClick={() => setPlayhead(livePlayhead + 1)} className="p-1.5 text-white/50 hover:text-white/80"><StepForward size={14} /></button>
                <button type="button" onClick={() => setPlayhead(data.totalDurationSeconds)} className="p-1.5 text-white/50 hover:text-white/80"><SkipForward size={14} /></button>
              </div>
              <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.1em] text-white/30">
                <Volume2 size={12} />
                {activeAudioClips.length ? `${activeAudioClips.length} audio` : "—"}
              </div>
            </div>
          </div>
          {activeAudioClips.map((clip) => (
            <TimelineAudioPlayer key={clip.id} clip={clip} playheadTime={livePlayhead} isPlaying={isPlaying} />
          ))}
          <TimelineAssetPreloader clips={preloadClips} onDurationKnown={patchClipSourceDuration} />
        </div>
      ) : (
      <main
        className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)_220px]"
        style={{ gridTemplateRows: `minmax(0, 1fr) 8px ${timelineHeight}px` }}
      >
          <aside className="flex min-h-0 flex-col overflow-hidden border-r border-white/10">
            <div className="shrink-0 border-b border-white/10 px-3 py-2">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/36">Medios</div>
              <div className="mt-0.5 text-[11px] text-white/45">{sourceMediaList?.items.length ?? 0} items · {placeholders.length} pendientes</div>
              <div className="mt-2 flex flex-wrap gap-0.5">
                {[
                  ["all", "Todos"],
                  ["video", "Vídeos"],
                  ["image", "Imágenes"],
                  ["audio", "Audio"],
                  ["pending", "Pendientes"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMediaFilter(value as typeof mediaFilter)}
                    className={cx("px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] transition", mediaFilter === value ? "bg-[#3a8f96]/20 text-white" : "text-white/38 hover:text-white/65")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-1 overflow-auto px-3 py-2">
              {filteredMediaItems.map((item) => {
                const disabled = item.mediaType === "placeholder" || (!item.assetId && !item.url);
                const alreadyInTimeline = Object.values(data.tracks).some((clips) => clips.some((clip) => clip.sourceItemId === item.id));
                return (
                  <div key={item.id} className={cx("grid grid-cols-[52px_1fr] gap-2 py-1.5", disabled && "opacity-50")}>
                    <div className="h-12 overflow-hidden"><MediaPreview item={item} /></div>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold">{item.title}</div>
                      <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-white/32">{item.mediaType}{item.sceneOrder ? ` · E${item.sceneOrder}` : ""}</div>
                      <button type="button" disabled={disabled} onClick={() => commit(addMediaListItemToTimeline(data, item))} className="mt-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#3a8f96]/90 hover:text-[#3a8f96] disabled:text-white/20">{alreadyInTimeline ? "+ otra vez" : "+ añadir"}</button>
                    </div>
                  </div>
                );
              })}
              {!sourceMediaList ? <div className="py-4 text-xs text-white/35">Conecta vídeos o una media list.</div> : null}
            </div>
          </aside>

          <section className="flex min-h-0 flex-col border-r border-white/10 px-3 py-2">
            <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-white/70">{activeVisualClip?.title ?? "Sin visual activo"}</div>
              </div>
              <label className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums text-white/45">
                <Clock size={12} />
                <input type="number" step={0.1} value={livePlayhead.toFixed(1)} onChange={(event) => setPlayhead(Number(event.target.value))} className="w-16 bg-transparent outline-none" />
              </label>
            </div>
            <div className="relative min-h-[200px] flex-1 overflow-hidden bg-black">
              <ClipPreview clip={activeVisualClip} playheadTime={livePlayhead} isPlaying={isPlaying} mediaVisible onDurationKnown={patchClipSourceDuration} />
              <SubtitlePreviewOverlay track={activeSubtitleTrack} currentTime={livePlayhead} />
            </div>
            <div className="mt-2 flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2">
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setPlayhead(0)} className="p-1.5 text-white/50 hover:text-white/80"><SkipBack size={14} /></button>
                <button type="button" onClick={() => setPlayhead(livePlayhead - 1)} className="p-1.5 text-white/50 hover:text-white/80"><StepBack size={14} /></button>
                <button type="button" onClick={() => moveToRelativeClip(-1)} className="px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-white/45 hover:text-white/70">−</button>
                <button
                  type="button"
                  onClick={() => {
                    if (isPlaying) commit({ ...data, playheadTime: livePlayhead });
                    setIsPlaying(!isPlaying);
                  }}
                  className="bg-[#3a8f96]/25 p-2 text-white hover:bg-[#3a8f96]/35"
                >
                  {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <button type="button" onClick={() => moveToRelativeClip(1)} className="px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-white/45 hover:text-white/70">+</button>
                <button type="button" onClick={() => setPlayhead(livePlayhead + 1)} className="p-1.5 text-white/50 hover:text-white/80"><StepForward size={14} /></button>
                <button type="button" onClick={() => setPlayhead(data.totalDurationSeconds)} className="p-1.5 text-white/50 hover:text-white/80"><SkipForward size={14} /></button>
              </div>
              <div className="text-[11px] font-semibold tabular-nums text-white/45">{formatTime(livePlayhead)} / {formatTime(data.totalDurationSeconds)}</div>
              <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.1em] text-white/30">
                <Volume2 size={12} />
                {activeAudioClips.length ? `${activeAudioClips.length} audio` : "—"}
              </div>
            </div>
            {activeAudioClips.map((clip) => (
              <TimelineAudioPlayer key={clip.id} clip={clip} playheadTime={livePlayhead} isPlaying={isPlaying} />
            ))}
            <TimelineAssetPreloader clips={preloadClips} onDurationKnown={patchClipSourceDuration} />
          </section>

          <aside data-foldder-video-editor-inspector="" className="flex min-h-0 flex-col overflow-hidden border-l border-white/[0.06]">
            <div className="flex shrink-0 items-center border-b border-white/10">
              {[
                ["clip", "Clip", Film],
                ["audio", "Audio", Music],
                ["subtitles", "Subs", Captions],
                ["render", "Render", Download],
              ].map(([value, label, Icon]) => (
                <button
                  key={String(value)}
                  type="button"
                  title={label as string}
                  onClick={() => setInspectorTab(value as VideoEditorInspectorTab)}
                  className={cx("inline-flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 transition", inspectorTab === value ? "border-b-2 border-[#3a8f96] bg-white/[0.03] text-white" : "border-b-2 border-transparent text-white/35 hover:text-white/60")}
                >
                  {React.createElement(Icon as typeof Film, { size: 12 })}
                  <span className="text-[8px] font-black uppercase tracking-[0.04em]">{label as string}</span>
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-2 py-1.5">
            <div className="mb-1.5 flex items-center justify-between gap-1 border-b border-white/[0.06] pb-1">
              <div className="min-w-0 truncate text-[10px] font-semibold text-white/55">{selectedClip?.title ?? (inspectorTab === "render" ? "Render" : inspectorTab === "audio" ? "Audio" : inspectorTab === "subtitles" ? "Subtítulos" : "Timeline")}</div>
              <div className="shrink-0 text-[9px] font-semibold tabular-nums text-white/30">{formatTime(livePlayhead)}</div>
            </div>
            {inspectorTab === "subtitles" ? (
              <div className="grid gap-2">
                <InspectorSection title="Subtítulos" compact>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 text-xs text-white/45">{primarySubtitleTrack ? `${subtitleSegments.length} segmentos` : "Transcribe vídeo/audio o pega SRT/VTT."}</div>
                    {primarySubtitleTrack ? (
                      <label className="flex items-center gap-2 text-[10px] text-white/50">
                        <input type="checkbox" checked={primarySubtitleTrack.enabled} onChange={(event) => patchSubtitleTrack(primarySubtitleTrack.id, { enabled: event.target.checked })} />
                        ON
                      </label>
                    ) : null}
                  </div>
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[10px] font-black uppercase tracking-[0.1em] text-white/32">Fuente</div>
                        <div className="mt-0.5 truncate text-xs text-white/55">{subtitleTranscriptionSource?.title || "Selecciona un clip o renderiza el timeline"}</div>
                      </div>
                      <button
                        type="button"
                        disabled={subtitleTranscribing || !subtitleTranscriptionSource}
                        onClick={() => void generateSubtitlesFromMedia()}
                        className="shrink-0 bg-[#3a8f96]/20 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.08em] text-white disabled:opacity-35"
                      >
                        {subtitleTranscribing ? "Transcribiendo..." : primarySubtitleTrack ? "Regenerar" : "Generar"}
                      </button>
                    </div>
                    {subtitleTranscriptionError ? (
                      <p className="text-[11px] text-rose-200/80">{subtitleTranscriptionError}</p>
                    ) : null}
                  </div>
                </InspectorSection>

                {!primarySubtitleTrack ? (
                  <InspectorSection title="Crear pista" compact>
                    <textarea
                      value={subtitleDraft}
                      onChange={(event) => setSubtitleDraft(event.target.value)}
                      rows={4}
                      placeholder={"1\n00:00:00,000 --> 00:00:02,400\nHola, bienvenidos a Foldder.\n\nO pega texto normal, una frase por línea."}
                      className={`${VIDEO_EDITOR_INSPECTOR_INPUT} leading-relaxed`}
                    />
                    <div className="grid grid-cols-2 gap-1.5">
                      <select value={subtitleMode} onChange={(event) => setSubtitleMode(event.target.value as RenderSubtitleMode)} className={VIDEO_EDITOR_INSPECTOR_INPUT}>
                        <option value="lines">Lines</option>
                        <option value="word-by-word">Word by word</option>
                        <option value="karaoke">Karaoke</option>
                      </select>
                      <select value={subtitlePreset} onChange={(event) => setSubtitlePreset(event.target.value as SubtitleStyle["preset"])} className={VIDEO_EDITOR_INSPECTOR_INPUT}>
                        <option value="minimal">Minimal</option>
                        <option value="creator">Creator</option>
                        <option value="cinematic">Cinematic</option>
                        <option value="documentary">Documentary</option>
                        <option value="corporate">Corporate</option>
                        <option value="karaoke">Karaoke</option>
                      </select>
                    </div>
                    <button type="button" disabled={!subtitleDraft.trim()} onClick={createSubtitles} className="bg-[#3a8f96]/20 px-2 py-1.5 text-[10px] font-black uppercase tracking-[0.06em] text-white disabled:opacity-40">Crear subtítulos</button>
                  </InspectorSection>
                ) : (
                  <>
                    <InspectorSection title="Salida" compact>
                      <div className="grid grid-cols-2 gap-1.5">
                        <label className="flex items-center gap-1.5 text-[10px] text-white/50">
                          <input type="checkbox" checked={primarySubtitleTrack.burnIn} onChange={(event) => patchSubtitleTrack(primarySubtitleTrack.id, { burnIn: event.target.checked })} />
                          Quemar
                        </label>
                        <select
                          value={primarySubtitleTrack.mode}
                          onChange={(event) => patchSubtitleTrack(primarySubtitleTrack.id, { mode: event.target.value as RenderSubtitleMode, document: { ...primarySubtitleTrack.document, mode: event.target.value as RenderSubtitleMode } })}
                          className={VIDEO_EDITOR_INSPECTOR_INPUT}
                        >
                          <option value="lines">Lines</option>
                          <option value="word-by-word">Word by word</option>
                          <option value="karaoke">Karaoke</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        <button type="button" onClick={() => downloadTextFile("foldder-subtitles.srt", exportSubtitleDocumentToSrt(primarySubtitleTrack.document), "text/plain;charset=utf-8")} className="px-2 py-1 text-[10px] font-black text-white/50 hover:text-white/75"><Download size={11} className="inline" /> SRT</button>
                        <button type="button" onClick={() => downloadTextFile("foldder-subtitles.vtt", exportSubtitleDocumentToVtt(primarySubtitleTrack.document), "text/vtt;charset=utf-8")} className="px-2 py-1 text-[10px] font-black text-white/50 hover:text-white/75"><Download size={11} className="inline" /> VTT</button>
                        <button type="button" onClick={() => downloadTextFile("foldder-subtitles.ass", exportSubtitleDocumentToAss(primarySubtitleTrack.document), "text/plain;charset=utf-8")} className="px-2 py-1 text-[10px] font-black text-white/50 hover:text-white/75"><Download size={11} className="inline" /> ASS</button>
                      </div>
                    </InspectorSection>

                    <InspectorSection title="Segmentos" compact>
                      <button type="button" onClick={() => addSubtitleSegmentAtPlayhead()} className="inline-flex items-center justify-center gap-1 px-1.5 py-1 text-[10px] font-black uppercase tracking-[0.06em] text-white/55 hover:text-white/80">
                        <Plus size={12} />
                        + playhead
                      </button>
                      <div className="max-h-40 space-y-0.5 overflow-auto">
                        {subtitleSegments.map((segment) => (
                          <button
                            key={segment.id}
                            type="button"
                            onClick={() => selectSubtitleSegment(segment.id, segment.start)}
                            className={cx("w-full p-1.5 text-left text-xs transition", data.selectedSubtitleSegmentId === segment.id ? "bg-[#3a8f96]/15 text-white" : "text-white/55 hover:bg-white/[0.04]")}
                          >
                            <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-[0.1em] text-white/34">
                              <span>{formatTime(segment.start)} → {formatTime(segment.end)}</span>
                              <span>{segment.words.length} palabras</span>
                            </div>
                            <div className="line-clamp-2 text-white/68">{segment.text}</div>
                          </button>
                        ))}
                      </div>
                    </InspectorSection>

                    {selectedSubtitleSegment ? (
                      <InspectorSection title="Editar" compact>
                        <div className="grid grid-cols-2 gap-1.5">
                          <label className="grid gap-0.5"><span className="text-[10px] text-white/40">Inicio</span><NumberInput value={selectedSubtitleSegment.start} onChange={(value) => patchSubtitleSegment(primarySubtitleTrack.id, selectedSubtitleSegment.id, { start: value })} step={0.1} /></label>
                          <label className="grid gap-0.5"><span className="text-[10px] text-white/40">Final</span><NumberInput value={selectedSubtitleSegment.end} onChange={(value) => patchSubtitleSegment(primarySubtitleTrack.id, selectedSubtitleSegment.id, { end: value })} step={0.1} /></label>
                        </div>
                        <textarea value={selectedSubtitleSegment.text} onChange={(event) => patchSubtitleSegment(primarySubtitleTrack.id, selectedSubtitleSegment.id, { text: event.target.value })} rows={2} className={`${VIDEO_EDITOR_INSPECTOR_INPUT} leading-relaxed`} />
                        <div className="flex flex-wrap gap-2">
                          <button type="button" disabled={selectedSubtitleSegmentIndex <= 0} onClick={() => {
                            const previous = subtitleSegments[selectedSubtitleSegmentIndex - 1];
                            if (previous) selectSubtitleSegment(previous.id, previous.start);
                          }} className="text-[10px] font-black uppercase tracking-[0.08em] text-white/50 disabled:opacity-35">Anterior</button>
                          <button type="button" disabled={selectedSubtitleSegmentIndex < 0 || selectedSubtitleSegmentIndex >= subtitleSegments.length - 1} onClick={() => {
                            const next = subtitleSegments[selectedSubtitleSegmentIndex + 1];
                            if (next) selectSubtitleSegment(next.id, next.start);
                          }} className="text-[10px] font-black uppercase tracking-[0.08em] text-white/50 disabled:opacity-35">Siguiente</button>
                          <button type="button" onClick={() => removeSubtitleSegment(primarySubtitleTrack.id, selectedSubtitleSegment.id)} className="text-[10px] font-black uppercase tracking-[0.08em] text-rose-200/75"><Trash2 size={11} className="inline" /> Eliminar</button>
                        </div>
                      </InspectorSection>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
            {inspectorTab === "clip" ? (selectedClip ? (
              <div className="grid gap-2">
                <InspectorSection title="Clip" compact>
                  <label className="grid gap-0.5">
                    <span className="text-[10px] text-white/40">Título</span>
                    <input value={selectedClip.title} onChange={(event) => commit(patchVideoEditorClip(data, selectedClip.id, { title: event.target.value }))} className={VIDEO_EDITOR_INSPECTOR_INPUT} />
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <label className="grid gap-0.5">
                      <span className="text-[10px] text-white/40">Pista</span>
                      <select
                        value={selectedClip.track}
                        onChange={(event) => commit(moveVideoEditorClip(data, selectedClip.id, selectedClip.startTime, event.target.value as VideoEditorClip["track"]))}
                        className={VIDEO_EDITOR_INSPECTOR_INPUT}
                      >
                        {selectedClipCompatibleTracks.map((track) => <option key={track.id} value={track.id}>{track.label}</option>)}
                      </select>
                    </label>
                    <label className="flex items-end gap-1.5 pb-1 text-[10px] text-white/50">
                      <input type="checkbox" checked={Boolean(selectedClip.locked)} onChange={(event) => commit(patchVideoEditorClip(data, selectedClip.id, { locked: event.target.checked }))} />
                      Bloquear
                    </label>
                  </div>
                </InspectorSection>

                <InspectorSection title="Tiempo" compact>
                  <div className="grid grid-cols-2 gap-1.5">
                    <label className="grid gap-0.5"><span className="text-[10px] text-white/40">Inicio</span><NumberInput value={selectedClip.startTime} onChange={(value) => commit(moveVideoEditorClip(data, selectedClip.id, value))} step={0.1} /></label>
                    <label className="grid gap-0.5">
                      <span className="text-[10px] text-white/40">Duración{Number.isFinite(selectedClipMaxDuration) ? ` · máx ${selectedClipMaxDuration.toFixed(1)}s` : ""}</span>
                      <NumberInput value={selectedClip.durationSeconds} onChange={(value) => commit(resizeVideoEditorClip(data, selectedClip.id, value))} min={0.1} step={0.1} />
                    </label>
                  </div>
                  {selectedClip.mediaType !== "image" ? (
                    <div className="grid grid-cols-2 gap-1.5">
                      <label className="grid gap-0.5"><span className="text-[10px] text-white/40">Trim in</span><NumberInput value={selectedClip.trimStart ?? 0} onChange={(value) => commit(setVideoEditorClipStartTrim(data, selectedClip.id, value))} step={0.1} /></label>
                      <label className="grid gap-0.5"><span className="text-[10px] text-white/40">Trim out</span><NumberInput value={selectedClip.trimEnd ?? 0} onChange={(value) => commit(setVideoEditorClipEndTrim(data, selectedClip.id, value))} step={0.1} /></label>
                    </div>
                  ) : null}
                </InspectorSection>

                {selectedClip.mediaType === "video" ? (
                  <InspectorSection title="Audio vídeo" compact>
                    <div className="grid grid-cols-2 gap-1.5">
                      <label className="grid gap-0.5"><span className="text-[10px] text-white/40">Vol</span><NumberInput value={selectedClip.volume ?? 1} onChange={(value) => commit(patchVideoEditorClip(data, selectedClip.id, { volume: value }))} step={0.1} /></label>
                      <label className="flex items-end gap-1.5 pb-1 text-[10px] text-white/50"><input type="checkbox" checked={Boolean(selectedClip.mute)} onChange={(event) => commit(patchVideoEditorClip(data, selectedClip.id, { mute: event.target.checked }))} /> Mute</label>
                    </div>
                  </InspectorSection>
                ) : null}

                {selectedClip.mediaType === "image" ? (
                  <InspectorSection title="Imagen" compact>
                    <div className="grid grid-cols-2 gap-1.5">
                      <label className="grid gap-0.5">
                        <span className="text-[10px] text-white/40">Encuadre</span>
                        <select value={selectedClip.framing ?? "fill"} onChange={(event) => commit(patchVideoEditorClip(data, selectedClip.id, { framing: event.target.value as VideoEditorClip["framing"] }))} className={VIDEO_EDITOR_INSPECTOR_INPUT}>
                          <option value="fit">Fit</option>
                          <option value="fill">Fill</option>
                          <option value="crop_center">Crop center</option>
                        </select>
                      </label>
                      <label className="grid gap-0.5">
                        <span className="text-[10px] text-white/40">Movimiento</span>
                        <select value={selectedClip.motion ?? "none"} onChange={(event) => commit(patchVideoEditorClip(data, selectedClip.id, { motion: event.target.value as VideoEditorClip["motion"] }))} className={VIDEO_EDITOR_INSPECTOR_INPUT}>
                          <option value="none">Ninguno</option>
                          <option value="slow_zoom_in">Zoom in lento</option>
                          <option value="slow_zoom_out">Zoom out lento</option>
                          <option value="pan_left">Pan izquierda</option>
                          <option value="pan_right">Pan derecha</option>
                        </select>
                      </label>
                    </div>
                  </InspectorSection>
                ) : null}

                {selectedClip.mediaType === "audio" ? (
                  <InspectorSection title="Audio" compact>
                    <label className="grid gap-0.5"><span className="text-[10px] text-white/40">Vol</span><NumberInput value={selectedClip.volume ?? 1} onChange={(value) => commit(patchVideoEditorClip(data, selectedClip.id, { volume: value }))} step={0.1} /></label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <label className="grid gap-0.5"><span className="text-[10px] text-white/40">Fade in</span><NumberInput value={selectedClip.fadeInSeconds ?? 0} onChange={(value) => commit(patchVideoEditorClip(data, selectedClip.id, { fadeInSeconds: value }))} step={0.1} /></label>
                      <label className="grid gap-0.5"><span className="text-[10px] text-white/40">Fade out</span><NumberInput value={selectedClip.fadeOutSeconds ?? 0} onChange={(value) => commit(patchVideoEditorClip(data, selectedClip.id, { fadeOutSeconds: value }))} step={0.1} /></label>
                    </div>
                    <label className="flex items-center gap-1.5 text-[10px] text-white/50"><input type="checkbox" checked={Boolean(selectedClip.mute)} onChange={(event) => commit(patchVideoEditorClip(data, selectedClip.id, { mute: event.target.checked }))} /> Mute</label>
                  </InspectorSection>
                ) : null}

                <details className="pt-0.5">
                  <summary className="cursor-pointer text-[9px] font-black uppercase tracking-[0.08em] text-white/30">Metadata</summary>
                  <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-[10px] leading-relaxed text-white/45">{JSON.stringify(selectedClip.metadata ?? {}, null, 2)}</pre>
                </details>
              </div>
            ) : (
              <p className="text-[11px] leading-relaxed text-white/35">Sin clip seleccionado.</p>
            )) : null}
            {inspectorTab === "audio" ? (
              <div className="grid gap-2">
                <div>
                  <div className="text-[9px] font-black uppercase tracking-[0.1em] text-white/32"><Volume2 size={11} className="inline" /> Activo</div>
                  <div className="mt-0.5 text-[10px] leading-snug text-white/45">{activeAudioClips.length ? activeAudioClips.map((clip) => clip.title).join(", ") : "Sin audio bajo playhead."}</div>
                </div>
                <div className="grid grid-cols-2 gap-0.5">
                  <button type="button" onClick={() => setAudioModalType("sfx")} className="px-1.5 py-1 text-[10px] font-black uppercase tracking-[0.06em] text-white/55 hover:bg-white/[0.04]">+ SFX</button>
                  <button type="button" onClick={() => setAudioModalType("music")} className="px-1.5 py-1 text-[10px] font-black uppercase tracking-[0.06em] text-white/55 hover:bg-white/[0.04]">+ Música</button>
                  <button type="button" onClick={() => setAudioModalType("ambience")} className="px-1.5 py-1 text-[10px] font-black uppercase tracking-[0.06em] text-white/55 hover:bg-white/[0.04]">+ Ambiente</button>
                  <button type="button" onClick={() => setAudioModalType("voiceover")} className="px-1.5 py-1 text-[10px] font-black uppercase tracking-[0.06em] text-white/38">+ Voz</button>
                </div>
                <div className="grid gap-0.5">
                  {data.audioRequests.length ? data.audioRequests.map((request) => (
                    <div key={request.id} className="border-b border-white/[0.06] py-1.5 text-[10px] last:border-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-black uppercase tracking-[0.1em] text-white/45">{request.type} · {request.status}</div>
                        <span className="tabular-nums text-white/30">{formatTime(request.startTime)}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-white/50">{request.prompt}</p>
                      {request.errorMessage ? <p className="mt-1 text-amber-100/65">{request.errorCode}: {request.errorMessage}</p> : null}
                      {request.generatedAssetIds?.length ? (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {request.generatedAssetIds.map((assetId, index) => (
                            <button key={assetId} type="button" onClick={() => commit(approveTimelineAudioVariation(data, request.id, assetId, index))} className="text-[10px] text-[#3a8f96]/85 hover:text-[#3a8f96]">Usar {index + 1}</button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )) : (
                    <p className="py-2 text-[10px] text-white/35">Sin solicitudes.</p>
                  )}
                </div>
              </div>
            ) : null}
            {inspectorTab === "render" ? (
              <div className="grid gap-2">
                <div className="grid grid-cols-2 gap-1.5">
                  <label className="grid gap-0.5">
                    <span className="text-[10px] text-white/40">Calidad</span>
                    <select
                      value={renderState.settings.quality}
                      onChange={(event) => commit({ ...data, render: { ...renderState, settings: { ...renderState.settings, quality: event.target.value as VideoEditorRenderState["settings"]["quality"] } } })}
                      className={VIDEO_EDITOR_INSPECTOR_INPUT}
                    >
                      <option value="preview">Preview</option>
                      <option value="high">Alta</option>
                    </select>
                  </label>
                  <label className="grid gap-0.5">
                    <span className="text-[10px] text-white/40">FPS</span>
                    <select
                      value={renderState.settings.fps}
                      onChange={(event) => commit({ ...data, render: { ...renderState, settings: { ...renderState.settings, fps: Number(event.target.value) as VideoEditorRenderState["settings"]["fps"] } } })}
                      className={VIDEO_EDITOR_INSPECTOR_INPUT}
                    >
                      <option value={24}>24</option>
                      <option value={25}>25</option>
                      <option value={30}>30</option>
                    </select>
                  </label>
                </div>
                <div>
                  <div className="text-[9px] font-black uppercase tracking-[0.1em] text-white/32">Estado</div>
                  <div className={cx("mt-0.5 text-[11px] font-semibold", renderState.status === "error" ? "text-rose-200/80" : "text-white/60")}>
                    {renderState.status === "idle" ? "Sin render" : renderState.status === "ready" ? "MP4 listo" : renderState.status === "error" ? renderState.error || "Error" : `${renderState.progress ?? 0}%`}
                  </div>
                  {renderState.status !== "idle" && renderState.status !== "ready" && renderState.status !== "error" ? (
                    <div className="mt-1.5 h-1 overflow-hidden bg-white/10">
                      <div className="h-full bg-[#3a8f96]" style={{ width: `${Math.max(10, renderState.progress ?? 35)}%` }} />
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={openRenderConfirmation}
                  disabled={renderState.status === "preparing" || renderState.status === "rendering" || renderState.status === "uploading"}
                  className="inline-flex items-center justify-center gap-1.5 bg-[#3a8f96]/20 px-2 py-1.5 text-[10px] font-black uppercase tracking-[0.06em] text-white disabled:opacity-45"
                >
                  <Film size={12} />
                  {renderState.status === "ready" ? "De nuevo" : renderState.status === "error" ? "Reintentar" : renderState.status === "preparing" || renderState.status === "rendering" || renderState.status === "uploading" ? "Render..." : "Render MP4"}
                </button>
                {renderState.status === "ready" && (renderPreviewUrl || renderState.outputUrl) ? (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setShowRenderReadyModal(true)} className="text-[10px] font-black uppercase tracking-[0.06em] text-white/55 hover:text-white/80">Ver</button>
                    <button
                      type="button"
                      onClick={() => {
                        if (renderState.s3Key) {
                          downloadS3Object(renderState.s3Key, "foldder-video-render.mp4");
                          return;
                        }
                        void forceDownloadUrl(renderPreviewUrl || renderState.outputUrl || "", "foldder-video-render.mp4");
                      }}
                      className="text-[10px] font-black uppercase tracking-[0.06em] text-white/55 hover:text-white/80"
                    >
                      Descargar
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
            </div>
          </aside>

          <div
            role="separator"
            aria-label="Redimensionar timeline"
            className="col-span-3 -my-2 flex h-4 cursor-row-resize items-center justify-center"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              setLayoutDrag({ startY: event.clientY, startHeight: timelineHeight });
            }}
            onDoubleClick={() => commit({ ...data, layout: { ...(data.layout ?? {}), timelineHeight: 300 }, status: "editing" })}
          >
            <div className="h-1 w-20 rounded-full bg-white/12 hover:bg-cyan-200/35" />
          </div>

          <section className="col-span-3 min-h-0 border-t border-white/10 px-2 py-1.5">
            <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <TimelineClipActions
                selectedClip={selectedClip ?? null}
                canSplitSelectedClip={canSplitSelectedClip}
                onSplit={splitSelectedClip}
                onDuplicate={() => selectedClip && commit(duplicateVideoEditorClip(data, selectedClip.id))}
                onDelete={deleteSelectedClip}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[10px] font-black uppercase tracking-[0.1em] text-white/35">
                  Timeline · {formatTime(data.totalDurationSeconds)}
                </div>
                <div className="truncate text-[10px] text-white/40">
                  {selectedClip ? (
                    <>
                      <span className="font-semibold text-white/60">{selectedClip.title}</span>
                      <span className="ml-1.5 tabular-nums">{formatTime(selectedClip.startTime)} → {formatTime(selectedClip.startTime + selectedClip.durationSeconds)}</span>
                    </>
                  ) : (
                    selectedTrack?.label ?? "Sin clip seleccionado"
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-0.5">
                <button type="button" onClick={() => commit({ ...data, timelineZoom: Math.max(8, timelineScale - 4) })} className="px-1.5 py-0.5 text-[10px] font-semibold text-white/45 hover:text-white/70" title="Alejar">−</button>
                <button type="button" onClick={fitTimelineZoom} className="px-1.5 py-0.5 text-[10px] font-semibold text-white/45 hover:text-white/70" title="Ajustar zoom">Fit</button>
                <button type="button" onClick={() => commit({ ...data, timelineZoom: Math.min(80, timelineScale + 4) })} className="px-1.5 py-0.5 text-[10px] font-semibold text-white/45 hover:text-white/70" title="Acercar">+</button>
                <button type="button" onClick={() => commit(createVideoEditorTimelineTrack(data, "visual"))} className="px-1.5 py-0.5 text-[10px] font-semibold text-white/45 hover:text-white/70" title="Añadir pista de vídeo">+ Vid</button>
                <button type="button" onClick={() => commit(createVideoEditorTimelineTrack(data, "audio"))} className="px-1.5 py-0.5 text-[10px] font-semibold text-white/45 hover:text-white/70" title="Añadir pista de audio">+ Aud</button>
              </div>
            </div>
            <div ref={timelineViewportRef} className="relative h-[calc(100%-40px)] min-h-[88px] overflow-auto bg-[#0a0c10]">
              <div className="relative min-w-full" style={{ width: TIMELINE_LABEL_WIDTH + timelineWidth }}>
                <div className="sticky top-0 z-30 grid border-b border-white/10 bg-[#202329]" style={{ gridTemplateColumns: `${TIMELINE_LABEL_WIDTH}px ${timelineWidth}px` }}>
                  <div className="sticky left-0 z-30 flex h-9 items-center border-r border-black/45 bg-[#202329] px-3 text-[10px] font-black uppercase tracking-[0.12em] text-white/32">Timecode</div>
                  <div
                    className="relative h-9"
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      setPlayhead((event.clientX - rect.left) / timelineScale);
                    }}
                  >
                    {Array.from({ length: Math.ceil(timelineDuration) + 1 }).map((_, second) => (
                      <div key={second} className={cx("absolute top-0 h-full border-l", second % 5 === 0 ? "border-white/20" : "border-white/10")} style={{ left: second * timelineScale }}>
                        <span className="ml-1 text-[10px] tabular-nums text-white/32">{second}s</span>
                      </div>
                    ))}
                  </div>
                </div>
                {timelineTracks.map((track) => {
                  const canDeleteTrack = timelineTracks.filter((item) => item.kind === track.kind).length > 1;
                  return (
                  <div key={track.id} className="grid border-b border-black/35 last:border-b-0" style={{ gridTemplateColumns: `${TIMELINE_LABEL_WIDTH}px ${timelineWidth}px` }}>
                    <div
                      className={cx("sticky left-0 z-20 flex min-h-[46px] items-center justify-between gap-2 border-r border-black/45 bg-[#242831] px-3 text-[10px] font-black uppercase tracking-[0.1em]", data.selectedTrackId === track.id ? "text-amber-100/90" : "text-white/48")}
                      onClick={() => commit({ ...data, selectedTrackId: track.id, status: "editing" })}
                    >
                      <span className="truncate">{track.label}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            commit(patchVideoEditorTimelineTrack(data, track.id, { locked: !track.locked }));
                          }}
                          className={cx("rounded-none border border-black/30 bg-black/18 p-1", track.locked ? "text-amber-100/85" : "text-white/30")}
                          title="Bloquear capa"
                        >
                          {track.locked ? <Lock size={12} /> : <Unlock size={12} />}
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            commit(patchVideoEditorTimelineTrack(data, track.id, track.kind === "visual" ? { hidden: !track.hidden } : { muted: !track.muted }));
                          }}
                          className={cx("rounded-none border border-black/30 bg-black/18 p-1", track.hidden || track.muted ? "text-amber-100/85" : "text-white/30")}
                          title={track.kind === "visual" ? "Ocultar capa" : "Mutear capa"}
                        >
                          {track.kind === "visual" ? (track.hidden ? <EyeOff size={12} /> : <Eye size={12} />) : (track.muted ? <VolumeX size={12} /> : <Volume2 size={12} />)}
                        </button>
                        <button
                          type="button"
                          disabled={!canDeleteTrack}
                          onClick={(event) => {
                            event.stopPropagation();
                            commit(deleteVideoEditorTimelineTrack(data, track.id));
                          }}
                          className={cx("rounded-none border border-black/30 bg-black/18 p-1", canDeleteTrack ? "text-rose-100/65 hover:text-rose-100" : "cursor-not-allowed text-white/14")}
                          title={canDeleteTrack ? "Eliminar pista" : "Debe quedar al menos una pista de este tipo"}
                        >
                          <Trash2 size={12} />
                        </button>
                      </span>
                    </div>
                    <div
                      data-video-editor-track-id={track.id}
                      className={cx("relative min-h-[46px] bg-[#151820]", track.hidden ? "opacity-40" : undefined, dragTargetTrackId === track.id ? "bg-cyan-300/[0.08] outline outline-1 outline-cyan-200/35" : undefined)}
                      onClick={(event) => {
                        if (event.target !== event.currentTarget) return;
                        const rect = event.currentTarget.getBoundingClientRect();
                        setPlayhead((event.clientX - rect.left) / timelineScale);
                        commit({ ...data, selectedTrackId: track.id, status: "editing" });
                      }}
                    >
                      {(data.tracks[track.id] ?? []).map((clip) => {
                        const clipVisible =
                          clip.startTime + clip.durationSeconds >= visibleTimelineStart &&
                          clip.startTime <= visibleTimelineEnd;
                        return (
                        <button
                          key={clip.id}
                          type="button"
                          onPointerDown={(event) => {
                            if (event.button !== 0 || clip.locked || track.locked) return;
                            event.currentTarget.setPointerCapture(event.pointerId);
                            selectClipForEditing(clip);
                            setDragTargetTrackId(track.id);
                            setDragState({
                              clipId: clip.id,
                              mode: "move",
                              startX: event.clientX,
                              startTime: clip.startTime,
                              durationSeconds: clip.durationSeconds,
                            });
                          }}
                          onClick={() => selectClipForEditing(clip)}
                          className={cx("absolute top-1 flex h-10 items-center justify-between gap-2 overflow-hidden rounded-none border px-3 text-left text-xs font-bold shadow-[0_2px_6px_rgba(0,0,0,0.22)] transition", clip.locked || track.locked ? "cursor-not-allowed opacity-60" : "cursor-grab active:cursor-grabbing", clip.mediaType === "audio" ? "border-emerald-300/28 bg-emerald-500/18 text-emerald-50/82" : "border-sky-300/28 bg-sky-500/18 text-sky-50/82", data.selectedClipId === clip.id ? "ring-2 ring-amber-300/75" : undefined, clip.sourceDurationSeconds && clip.durationSeconds >= getVideoEditorClipMaxDuration(clip) - 0.01 ? "outline outline-1 outline-amber-200/35" : undefined)}
                          style={{ left: clip.startTime * timelineScale, width: Math.max(28, clip.durationSeconds * timelineScale) }}
                        >
                          <TimelineClipFace clip={clip} mediaVisible={clipVisible} />
                          <span className="relative z-[1] truncate drop-shadow">{clip.title}</span>
                          <span className="relative z-[1] text-[10px] opacity-65 drop-shadow">{clip.durationSeconds.toFixed(1)}s</span>
                          <span
                            role="presentation"
                            onPointerDown={(event) => {
                              if (clip.locked || track.locked) return;
                              event.stopPropagation();
                              event.currentTarget.setPointerCapture(event.pointerId);
                              selectClipForEditing(clip);
                              setDragState({
                                clipId: clip.id,
                                mode: "resize-start",
                                startX: event.clientX,
                                startTime: clip.startTime,
                                durationSeconds: clip.durationSeconds,
                              });
                            }}
                            className="absolute left-0 top-0 h-full w-2 cursor-ew-resize rounded-none bg-white/10 hover:bg-cyan-200/30"
                            title="Trim inicio"
                          />
                          <span
                            role="presentation"
                            onPointerDown={(event) => {
                              if (clip.locked || track.locked) return;
                              event.stopPropagation();
                              event.currentTarget.setPointerCapture(event.pointerId);
                              selectClipForEditing(clip);
                              setDragState({
                                clipId: clip.id,
                                mode: "resize-end",
                                startX: event.clientX,
                                startTime: clip.startTime,
                                durationSeconds: clip.durationSeconds,
                              });
                            }}
                            className="absolute right-0 top-0 h-full w-2 cursor-ew-resize rounded-none bg-white/10 hover:bg-cyan-200/30"
                            title="Trim final"
                          />
                        </button>
                        );
                      })}
                    </div>
                  </div>
                  );
                })}
                <div className="grid" style={{ gridTemplateColumns: `${TIMELINE_LABEL_WIDTH}px ${timelineWidth}px` }}>
                  <div className={cx("sticky left-0 z-20 flex min-h-[46px] items-center justify-between gap-2 border-r border-black/45 bg-[#242831] px-3 text-[10px] font-black uppercase tracking-[0.1em]", primarySubtitleTrack?.enabled ? "text-violet-50/72" : "text-white/28")}>
                    <span className="flex min-w-0 items-center gap-2">
                      <Captions size={13} />
                      <span className="truncate">Subs</span>
                      <span className="text-white/28">{subtitleSegments.length}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      {primarySubtitleTrack ? (
                        <button
                          type="button"
                          onClick={() => patchSubtitleTrack(primarySubtitleTrack.id, { enabled: !primarySubtitleTrack.enabled })}
                          className={cx("rounded-none border border-black/30 bg-black/18 p-1", primarySubtitleTrack.enabled ? "text-violet-100/80" : "text-white/22")}
                          title={primarySubtitleTrack.enabled ? "Ocultar subtítulos" : "Mostrar subtítulos"}
                        >
                          {primarySubtitleTrack.enabled ? <Eye size={12} /> : <EyeOff size={12} />}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={!primarySubtitleTrack}
                        onClick={() => addSubtitleSegmentAtPlayhead()}
                        className="rounded-none border border-black/30 bg-black/18 p-1 text-white/42 disabled:opacity-20"
                        title="Añadir segmento en el playhead"
                      >
                        <Plus size={12} />
                      </button>
                    </span>
                  </div>
                  <div
                    className="relative min-h-[46px] bg-[#151820]"
                    onClick={(event) => {
                      if (event.target !== event.currentTarget) return;
                      const rect = event.currentTarget.getBoundingClientRect();
                      setPlayhead((event.clientX - rect.left) / timelineScale);
                    }}
                    onDoubleClick={(event) => {
                      if (event.target !== event.currentTarget || !primarySubtitleTrack) return;
                      const rect = event.currentTarget.getBoundingClientRect();
                      const nextTime = (event.clientX - rect.left) / timelineScale;
                      setPlayhead(nextTime);
                      addSubtitleSegmentAtTime(nextTime);
                    }}
                  >
                    {subtitleSegments.map((segment) => (
                      <button
                        key={segment.id}
                        type="button"
                        onPointerDown={(event) => {
                          if (event.button !== 0 || segment.locked) return;
                          event.currentTarget.setPointerCapture(event.pointerId);
                          selectSubtitleSegment(segment.id, segment.start);
                          setSubtitleDragState({
                            segmentId: segment.id,
                            mode: "move",
                            startX: event.clientX,
                            start: segment.start,
                            end: segment.end,
                          });
                        }}
                        onClick={() => {
                          selectSubtitleSegment(segment.id, segment.start);
                        }}
                        className={cx("absolute top-1 flex h-10 items-center rounded-none border px-3 text-left text-xs font-bold shadow-[0_2px_6px_rgba(0,0,0,0.22)]", segment.locked ? "cursor-not-allowed opacity-60" : "cursor-grab active:cursor-grabbing", data.selectedSubtitleSegmentId === segment.id ? "border-yellow-200/70 bg-yellow-300/18 text-yellow-50 ring-2 ring-yellow-200/35" : "border-violet-200/18 bg-violet-400/12 text-violet-50/62")}
                        style={{ left: segment.start * timelineScale, width: Math.max(56, (segment.end - segment.start) * timelineScale) }}
                      >
                        <span className="truncate">{segment.text}</span>
                        <span
                          role="presentation"
                          onPointerDown={(event) => {
                            if (segment.locked) return;
                            event.stopPropagation();
                            event.currentTarget.setPointerCapture(event.pointerId);
                            selectSubtitleSegment(segment.id, segment.start);
                            setSubtitleDragState({
                              segmentId: segment.id,
                              mode: "resize-start",
                              startX: event.clientX,
                              start: segment.start,
                              end: segment.end,
                            });
                          }}
                          className="absolute left-0 top-0 h-full w-2 cursor-ew-resize rounded-none bg-white/10 hover:bg-violet-200/30"
                          title="Ajustar inicio"
                        />
                        <span
                          role="presentation"
                          onPointerDown={(event) => {
                            if (segment.locked) return;
                            event.stopPropagation();
                            event.currentTarget.setPointerCapture(event.pointerId);
                            selectSubtitleSegment(segment.id, segment.start);
                            setSubtitleDragState({
                              segmentId: segment.id,
                              mode: "resize-end",
                              startX: event.clientX,
                              start: segment.start,
                              end: segment.end,
                            });
                          }}
                          className="absolute right-0 top-0 h-full w-2 cursor-ew-resize rounded-none bg-white/10 hover:bg-violet-200/30"
                          title="Ajustar final"
                        />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="pointer-events-none absolute top-0 z-50 h-0 w-0 border-l-[6px] border-r-[6px] border-t-[9px] border-l-transparent border-r-transparent border-t-red-400" style={{ left: TIMELINE_LABEL_WIDTH + livePlayhead * timelineScale - 6 }} />
                <div className="pointer-events-none absolute bottom-0 top-0 z-40 w-px bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.9)]" style={{ left: TIMELINE_LABEL_WIDTH + livePlayhead * timelineScale }} />
              </div>
            </div>
            {dragPreview ? (
              <div className="pointer-events-none fixed z-[100180] rounded-full border border-cyan-200/30 bg-cyan-950/92 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-cyan-50 shadow-xl" style={{ left: dragPreview.x + 12, top: dragPreview.y - 34 }}>
                {dragPreview.label}
              </div>
            ) : null}
          </section>
        </main>
      )}
      {audioModalType ? (
        <AudioRequestModal
          type={audioModalType}
          playheadTime={livePlayhead}
          sourceNodeId={sourceMediaList?.sourceNodeId}
          sourceMediaListId={sourceMediaList?.sourceNodeId}
          onClose={() => setAudioModalType(null)}
          onCreate={(request) => void addAudioRequest(request)}
        />
      ) : null}
      {renderConfirmation ? (
        <RenderConfirmModal
          result={renderConfirmation}
          onClose={() => setRenderConfirmation(null)}
          onConfirm={() => void runRender()}
        />
      ) : null}
      {showRenderReadyModal && renderState.status === "ready" && renderReadyUrl ? (
        <RenderReadyModal url={renderReadyUrl} s3Key={renderState.s3Key} onClose={() => setShowRenderReadyModal(false)} />
      ) : null}
    </div>,
    document.body,
  );
}

function VideoEditorNodeExteriorPreview({
  clip,
  previewUrl,
  mediaVisible,
}: {
  clip: VideoEditorClip;
  previewUrl?: string;
  mediaVisible: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pauseAt = clip.trimStart ?? 0;
  useEffect(() => {
    const video = videoRef.current;
    if (!video || clip.mediaType !== "video") return;
    const seek = () => {
      if (video.readyState > 0 && Math.abs(video.currentTime - pauseAt) > 0.05) {
        video.currentTime = pauseAt;
      }
      video.pause();
    };
    seek();
    video.addEventListener("loadeddata", seek);
    return () => video.removeEventListener("loadeddata", seek);
  }, [clip.mediaType, pauseAt, previewUrl]);
  if (!mediaVisible) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[#0a0a0a] text-white/35">
        <Film size={28} />
        <span className="text-center text-[8px] font-black uppercase tracking-widest">Preview pausada</span>
      </div>
    );
  }
  if (clip.mediaType === "image" && previewUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={previewUrl} alt={clip.title} className="h-full w-full object-cover" draggable={false} />
    );
  }
  if (clip.mediaType === "video" && previewUrl) {
    return (
      <video
        ref={videoRef}
        src={previewUrl}
        className="h-full w-full object-cover"
        muted
        playsInline
        preload="metadata"
      />
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#0a0a0a] text-white/30">
      <Film size={28} />
    </div>
  );
}

export const VideoEditorNode = memo(function VideoEditorNode({ id, data, selected }: NodeProps) {
  useFoldderRenderMetric("VideoEditorNode", id);
  const {
    combinedSourceMediaList,
    connectedByVideoSlot,
    connectedVideoCount,
    visibleVideoSlotIds,
  } = useVideoEditorIncomingMedia(id);
  const updateNodeInternals = useUpdateNodeInternals();
  const { setNodes } = useReactFlow();
  const nodeData = normalizeVideoEditorData(data);
  const effectiveData = combinedSourceMediaList && !nodeData.tracks.video.length && !nodeData.tracks.audio.length && nodeData.status === "empty"
    ? ingestMediaListToVideoEditor(combinedSourceMediaList, nodeData)
    : nodeData;
  const stats = clipStats(effectiveData);
  const previewClip = useMemo(() => getVideoEditorNodePreviewClip(effectiveData), [effectiveData]);
  const nodeMediaVisible = useNodeViewportVisibility(id, 900);
  const previewUrl = useVideoEditorAssetUrl(
    previewClip?.url || previewClip?.assetId,
    previewClip?.s3Key,
    nodeMediaVisible && Boolean(previewClip),
  );
  const showPreview = Boolean(previewClip);
  const studioTouched = hasVideoEditorStudioTouched(data as Record<string, unknown>) || stats.clips.length > 0;
  const [studioOpen, setStudioOpen] = useState(false);

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, updateNodeInternals, visibleVideoSlotIds.join(",")]);

  useEffect(() => {
    const record = data as Record<string, unknown>;
    if (record._foldderAspectRatio === VIDEO_EDITOR_ASPECT_RATIO) return;
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id !== id) return node;
        const style = (node.style ?? {}) as React.CSSProperties;
        const parsedWidth = typeof style.width === "number" ? style.width : Number.parseFloat(String(style.width ?? ""));
        const parsedHeight = typeof style.height === "number" ? style.height : Number.parseFloat(String(style.height ?? ""));
        const nextFrame =
          Number.isFinite(parsedWidth) && parsedWidth > 0 && Number.isFinite(parsedHeight) && parsedHeight > 0
            ? snapAspectDimensionsToGrid({ width: parsedWidth, height: parsedHeight }, VIDEO_EDITOR_ASPECT_RATIO)
            : foldderGridFrame(5, 3);
        return {
          ...node,
          data: { ...(node.data as Record<string, unknown>), _foldderAspectRatio: VIDEO_EDITOR_ASPECT_RATIO },
          style: {
            ...style,
            width: nextFrame.width,
            height: nextFrame.height,
          },
        };
      }),
    );
  }, [data, id, setNodes]);

  const commit = useCallback((next: VideoEditorNodeData) => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              data: touchStudioNodeData(node.data as Record<string, unknown>, next as unknown as Record<string, unknown>),
            }
          : node,
      ),
    );
  }, [id, setNodes]);

  const label = String((data as { label?: unknown }).label || "Video Editor");
  return (
    <div
      className={cx(
        "custom-node video-editor-node foldder-node--frameless node--media relative text-white group/node",
        showPreview ? "video-editor-node--has-preview foldder-frameless-label-dark" : "video-editor-node--empty",
        studioTouched ? "foldder-node--studio-touched" : undefined,
        selected ? "video-editor-node--selected" : undefined,
      )}
      style={{ width: "100%", height: "100%", minWidth: VIDEO_EDITOR_MIN_WIDTH, minHeight: VIDEO_EDITOR_MIN_HEIGHT }}
    >
      <VideoEditorNodeResizer
        minWidth={VIDEO_EDITOR_MIN_WIDTH}
        minHeight={VIDEO_EDITOR_MIN_HEIGHT}
        maxWidth={960}
        maxHeight={VIDEO_EDITOR_NODE_MAX_HEIGHT}
        keepAspectRatio
        isVisible={selected}
      />
      {studioTouched ? <FoldderStudioTouchedMark nodeType="video_editor" /> : null}
      <NodeLabel id={id} label={typeof data.label === "string" ? data.label : undefined} defaultLabel="Video Editor" />
      {VIDEO_EDITOR_VIDEO_SLOTS.filter((slot) => visibleVideoSlotIds.includes(slot.id)).map((slot, index) => (
        <div
          key={slot.id}
          className="handle-wrapper handle-left"
          style={{
            top: slot.top,
            opacity: index === 0 || connectedByVideoSlot[VIDEO_EDITOR_VIDEO_SLOT_IDS[index - 1]!] ? 1 : 0.35,
          }}
        >
          <FoldderDataHandle type="target" position={Position.Left} id={slot.id} dataType="video" />
          <span
            className="handle-label"
            style={{ color: connectedByVideoSlot[slot.id] ? "#3a8f96" : undefined }}
          >
            {connectedByVideoSlot[slot.id] ? `✓ ${slot.label}` : slot.label}
          </span>
        </div>
      ))}
      <div className="handle-wrapper handle-left" style={{ top: "92%" }}>
        <FoldderDataHandle type="target" position={Position.Left} id="media_list" dataType="generic" />
        <span className="handle-label">Media list</span>
      </div>

      <div className="foldder-frameless-main relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {showPreview && previewClip ? (
          <>
            <VideoEditorNodeExteriorPreview
              clip={previewClip}
              previewUrl={previewUrl}
              mediaVisible={nodeMediaVisible}
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[11] bg-gradient-to-t from-black/75 via-black/25 to-transparent px-3 pb-2 pt-8">
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-white/55">
                {stats.clips.length} clips · {stats.duration.toFixed(0)}s
              </div>
            </div>
            <span className="video-editor-status rounded-none bg-black/35 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-white/80">
              {effectiveData.status}
            </span>
            <FoldderStudioModeCenterButton onClick={() => setStudioOpen(true)} />
          </>
        ) : (
          <>
        <div className="video-editor-empty-background absolute inset-0 overflow-hidden" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={VIDEO_EDITOR_EMPTY_BACKGROUND_SRC}
            alt=""
            className="h-full w-full object-cover object-center"
            draggable={false}
          />
        </div>

        <div className="node-content video-editor-node-content relative z-10 flex min-h-0 flex-1 flex-col px-3 pb-3 pt-2">
          <div className="video-editor-heading flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/70">Video Editor</div>
              <h3 className="mt-1 text-lg font-black tracking-[-0.04em] text-white">{label}</h3>
            </div>
            <div className="video-editor-icon flex h-10 w-10 items-center justify-center rounded-none bg-white/15 text-white">
              <Film size={18} />
            </div>
          </div>
          <div className="video-editor-summary mt-4 rounded-none border-none bg-white/10 p-4 backdrop-blur-sm">
            {combinedSourceMediaList ? (
              <>
                <div className="text-3xl font-black tracking-[-0.06em] text-white">{stats.clips.length} clips</div>
                <div className="mt-2 text-sm font-semibold text-white/75">
                  {stats.duration.toFixed(0)}s · {stats.videos} vídeos · {stats.images} imágenes · {stats.audio} audios
                  {connectedVideoCount > 0 ? ` · ${connectedVideoCount} conectado${connectedVideoCount === 1 ? "" : "s"}` : ""}
                </div>
              </>
            ) : (
              <>
                <div className="text-lg font-black tracking-[-0.04em] text-white">Sin medios conectados</div>
                <div className="mt-1 text-sm text-white/70">Conecta vídeos o una media list</div>
              </>
            )}
          </div>
          <div className="video-editor-actions mt-auto flex items-center justify-between gap-3 pt-3">
            <span className="video-editor-status rounded-none bg-black/35 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-white/80">
              {effectiveData.status}
            </span>
            <button
              type="button"
              onClick={() => setStudioOpen(true)}
              className="video-editor-open-button rounded-none bg-white px-3 py-1.5 text-[11px] font-semibold text-black transition hover:scale-[1.02] hover:bg-[#f7f7f4]"
            >
              Abrir
            </button>
          </div>
        </div>
          </>
        )}
      </div>

      {studioOpen ? (
        <VideoEditorStudio
          nodeId={id}
          data={effectiveData}
          sourceMediaList={combinedSourceMediaList}
          onChange={commit}
          onClose={() => setStudioOpen(false)}
        />
      ) : null}
    </div>
  );
});
