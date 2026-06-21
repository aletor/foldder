import type { MediaListOutput } from "../media-list-output";
import type { VideoEditorSubtitleTrack } from "./subtitles-types";
import type { VideoEditorComposition, VideoEditorOverlayClip } from "./video-editor-composition-types";

export type VideoEditorBaseTrackKind = "video" | "audio" | "music" | "sfx" | "ambience" | "voiceover";
export type VideoEditorTrackKind = VideoEditorBaseTrackKind | (string & {});
export type VideoEditorTimelineTrackKind = "visual" | "audio";
export type VideoEditorAudioRole = "original" | "music" | "sfx" | "ambience" | "voiceover";

export type VideoEditorTimelineTrack = {
  id: VideoEditorTrackKind;
  kind: VideoEditorTimelineTrackKind;
  label: string;
  locked?: boolean;
  muted?: boolean;
  hidden?: boolean;
  height?: number;
  role?: VideoEditorBaseTrackKind | "custom";
};

export type VideoEditorRenderSettings = {
  resolution: "720p" | "1080p";
  width: number;
  height: number;
  fps: 24 | 25 | 30;
  format: "mp4";
  videoCodec: "h264";
  audioCodec: "aac";
  quality: "preview" | "high";
};

export type VideoEditorRenderState = {
  status: "idle" | "preparing" | "rendering" | "uploading" | "ready" | "error";
  renderId?: string;
  outputAssetId?: string;
  outputUrl?: string;
  s3Key?: string;
  progress?: number;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  settings: VideoEditorRenderSettings;
};

export type VideoEditorClip = {
  id: string;
  sourceItemId?: string;
  assetId?: string;
  url?: string;
  s3Key?: string;
  mediaType: "image" | "video" | "audio";
  track: VideoEditorTrackKind;
  title: string;
  startTime: number;
  durationSeconds: number;
  sourceDurationSeconds?: number;
  extendMode?: "trim" | "freeze" | "loop";
  trimStart?: number;
  trimEnd?: number;
  volume?: number;
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
  audioRole?: VideoEditorAudioRole;
  locked?: boolean;
  mute?: boolean;
  framing?: "fit" | "fill" | "crop_center";
  motion?: "none" | "slow_zoom_in" | "slow_zoom_out" | "pan_left" | "pan_right";
  /** Composición: posición, escala, crop y keyframes en el frame de export. */
  composition?: VideoEditorComposition;
  sceneId?: string;
  sceneOrder?: number;
  metadata?: unknown;
  status?: "ready" | "pending" | "generated" | "approved" | "error";
};

export type TimelineAudioRequest = {
  id: string;
  type: "sfx" | "music" | "ambience" | "voiceover";
  startTime: number;
  durationSeconds: number;
  prompt: string;
  mood?: string;
  intensity?: "low" | "medium" | "high";
  energy?: "low" | "medium" | "high";
  variations: number;
  status: "draft" | "generating" | "generated" | "approved" | "error";
  generatedAssetIds?: string[];
  approvedAssetId?: string;
  selectedVariationIndex?: number;
  errorCode?: string;
  errorMessage?: string;
  metadata?: {
    generatedFrom: "video-editor";
    sourceNodeId?: string;
    sourceMediaListId?: string;
    createdAt?: string;
  };
};

export type VideoEditorNodeData = {
  label?: string;
  sourceMediaList?: MediaListOutput;
  sourceMediaListFingerprint?: string;
  layout?: {
    timelineHeight?: number;
  };
  timelineTracks?: VideoEditorTimelineTrack[];
  tracks: Record<string, VideoEditorClip[]>;
  selectedTrackId?: VideoEditorTrackKind;
  selectedClipId?: string;
  playheadTime: number;
  timelineZoom?: number;
  totalDurationSeconds: number;
  audioRequests: TimelineAudioRequest[];
  subtitleTracks?: VideoEditorSubtitleTrack[];
  selectedSubtitleSegmentId?: string;
  /** Capas de diseño (texto, formas) — objetos Freehand animables. */
  overlayClips?: VideoEditorOverlayClip[];
  selectedOverlayId?: string;
  status: "empty" | "media_loaded" | "editing" | "generating_audio" | "ready";
  render?: VideoEditorRenderState;
};

export const VIDEO_EDITOR_TRACK_LABELS: Record<VideoEditorBaseTrackKind, string> = {
  video: "V1",
  audio: "A1",
  music: "Música",
  sfx: "SFX / Ruidos",
  ambience: "Ambiente",
  voiceover: "Voz en off",
};

export const VIDEO_EDITOR_TRACK_ORDER: VideoEditorBaseTrackKind[] = [
  "video",
  "audio",
];

export const DEFAULT_VIDEO_EDITOR_TIMELINE_TRACKS: VideoEditorTimelineTrack[] = [
  { id: "video", kind: "visual", label: "V1", role: "video", height: 54 },
  { id: "design", kind: "visual", label: "D1", role: "custom", height: 40 },
  { id: "audio", kind: "audio", label: "A1", role: "audio", height: 46 },
];

export function createEmptyVideoEditorData(): VideoEditorNodeData {
  return {
    label: "Video Editor",
    timelineTracks: DEFAULT_VIDEO_EDITOR_TIMELINE_TRACKS,
    tracks: {
      video: [],
      design: [],
      audio: [],
    },
    selectedTrackId: "video",
    playheadTime: 0,
    timelineZoom: 18,
    totalDurationSeconds: 0,
    audioRequests: [],
    subtitleTracks: [],
    overlayClips: [],
    status: "empty",
    render: createDefaultVideoEditorRenderState(),
  };
}

export function createDefaultVideoEditorRenderState(): VideoEditorRenderState {
  return {
    status: "idle",
    settings: {
      resolution: "1080p",
      width: 1920,
      height: 1080,
      fps: 25,
      format: "mp4",
      videoCodec: "h264",
      audioCodec: "aac",
      quality: "high",
    },
  };
}
