import type { FoldderSubtitleDocument, RenderSubtitleMode, SubtitleStyle } from "./subtitles-types";
import type { VideoEditorComposition, VideoEditorOverlayClip } from "./video-editor-composition-types";

export type VideoEditorRenderSettings = {
  width: number;
  height: number;
  fps: 24 | 25 | 30;
  format: "mp4";
  videoCodec: "h264";
  audioCodec: "aac";
  quality: "preview" | "high";
  backgroundColor: "black";
};

export type VideoEditorRenderClip = {
  id: string;
  assetId: string;
  url?: string;
  s3Key?: string;
  mediaType: "image" | "video" | "audio";
  track: string;
  startTime: number;
  durationSeconds: number;
  sourceDurationSeconds?: number;
  extendMode?: "trim" | "freeze" | "loop";
  trimStart?: number;
  trimEnd?: number;
  volume?: number;
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
  audioRole?: "original" | "music" | "sfx" | "ambience" | "voiceover";
  fitMode?: "fit" | "fill" | "crop_center";
  motion?: "none" | "slow_zoom_in" | "slow_zoom_out" | "pan_left" | "pan_right";
  /** Composición WYSIWYG (transform + keyframes). */
  composition?: VideoEditorComposition;
  compositionCropPreset?: "fit" | "fill" | "custom";
  title?: string;
  metadata?: unknown;
};

export type VideoEditorRenderOverlayClip = {
  id: string;
  startTime: number;
  durationSeconds: number;
  title: string;
  object: VideoEditorOverlayClip["object"];
  composition: VideoEditorComposition;
  layerOrder?: number;
};

export type VideoEditorRenderManifest = {
  editorNodeId: string;
  settings: VideoEditorRenderSettings;
  durationSeconds: number;
  tracks: Record<string, VideoEditorRenderClip[]>;
  layers?: Array<{
    id: string;
    kind: "visual" | "audio";
    label: string;
    order: number;
    hidden?: boolean;
    muted?: boolean;
  }>;
  subtitleTracks?: Array<{
    id: string;
    enabled: boolean;
    mode: RenderSubtitleMode;
    burnIn: boolean;
    documentKey?: string;
    document?: FoldderSubtitleDocument;
    exportSrt?: boolean;
    exportVtt?: boolean;
    exportAss?: boolean;
    style: SubtitleStyle;
  }>;
  overlayClips?: VideoEditorRenderOverlayClip[];
  metadata?: {
    sourceMediaListId?: string;
    projectTitle?: string;
    createdAt: string;
  };
};

export type VideoEditorRenderManifestResult = {
  ok: boolean;
  manifest?: VideoEditorRenderManifest;
  errors: string[];
  warnings: string[];
  includedClips: number;
  ignoredClips: number;
};
