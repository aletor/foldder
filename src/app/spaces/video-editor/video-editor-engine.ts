import type { MediaListItem, MediaListOutput } from "../media-list-output";
import type { VideoEditorRenderManifest, VideoEditorRenderManifestResult } from "./video-editor-render-types";
import {
  createEmptyVideoEditorData,
  createDefaultVideoEditorRenderState,
  DEFAULT_VIDEO_EDITOR_TIMELINE_TRACKS,
  VIDEO_EDITOR_TRACK_ORDER,
  type VideoEditorAudioRole,
  type TimelineAudioRequest,
  type VideoEditorClip,
  type VideoEditorNodeData,
  type VideoEditorTimelineTrack,
  type VideoEditorTrackKind,
} from "./video-editor-types";

const LEGACY_SEMANTIC_AUDIO_TRACKS = new Set(["sfx", "music", "ambience", "voiceover"]);

export function mediaListFingerprint(mediaList: MediaListOutput | null | undefined): string {
  if (!mediaList) return "";
  return [
    mediaList.sourceNodeId,
    mediaList.status,
    mediaList.items.length,
    mediaList.items.map((item) => `${item.id}:${item.assetId || item.url || ""}:${item.status || ""}:${item.order}`).join("|"),
  ].join("::");
}

function normalizeTimelineTracks(input: unknown): VideoEditorTimelineTrack[] {
  const provided = Array.isArray(input) ? input : [];
  const normalized: VideoEditorTimelineTrack[] = [];
  const seenIds = new Set<string>();
  provided.forEach((track) => {
    if (!track || typeof track !== "object") return;
    const candidate = track as Partial<VideoEditorTimelineTrack>;
    if (!candidate.id || !candidate.kind || !candidate.label || seenIds.has(candidate.id)) return;
    if (LEGACY_SEMANTIC_AUDIO_TRACKS.has(candidate.id)) return;
    seenIds.add(candidate.id);
    normalized.push({
      id: candidate.id,
      kind: candidate.kind === "visual" ? "visual" : "audio",
      label: candidate.label,
      locked: Boolean(candidate.locked),
      muted: Boolean(candidate.muted),
      hidden: Boolean(candidate.hidden),
      height: Number.isFinite(Number(candidate.height)) ? Math.max(36, Number(candidate.height)) : undefined,
      role: candidate.role,
    });
  });
  DEFAULT_VIDEO_EDITOR_TIMELINE_TRACKS.forEach((track) => {
    if (seenIds.has(track.id)) return;
    normalized.push(track);
  });
  return normalized;
}

export function getVideoEditorTimelineTracks(data: VideoEditorNodeData): VideoEditorTimelineTrack[] {
  const normalized = normalizeTimelineTracks(data.timelineTracks);
  const knownIds = new Set(normalized.map((track) => track.id));
  Object.keys(data.tracks ?? {}).forEach((trackId) => {
    if (knownIds.has(trackId)) return;
    const hasClips = (data.tracks[trackId] ?? []).length > 0;
    if (!hasClips) return;
    normalized.push({
      id: trackId,
      kind: data.tracks[trackId]?.some((clip) => clip.mediaType === "image" || clip.mediaType === "video") ? "visual" : "audio",
      label: trackId,
      role: "custom",
      height: 46,
    });
  });
  return normalized;
}

function trackIdsForData(data: VideoEditorNodeData): string[] {
  return getVideoEditorTimelineTracks(data).map((track) => track.id);
}

export function normalizeVideoEditorData(raw: unknown): VideoEditorNodeData {
  const base = createEmptyVideoEditorData();
  if (!raw || typeof raw !== "object") return base;
  const input = raw as Partial<VideoEditorNodeData>;
  const tracksInput = input.tracks ?? base.tracks;
  const timelineTracks = normalizeTimelineTracks(input.timelineTracks);
  const trackIds = new Set([...timelineTracks.map((track) => track.id), ...Object.keys(tracksInput).filter((track) => !LEGACY_SEMANTIC_AUDIO_TRACKS.has(track))]);
  const tracks = Array.from(trackIds).reduce((acc, track) => ({ ...acc, [track]: [] as VideoEditorClip[] }), {} as Record<string, VideoEditorClip[]>);
  Object.entries(tracksInput).forEach(([sourceTrack, sourceClips]) => {
    if (!Array.isArray(sourceClips)) return;
    const destinationTrack = LEGACY_SEMANTIC_AUDIO_TRACKS.has(sourceTrack) ? "audio" : sourceTrack;
    tracks[destinationTrack] = [
      ...(tracks[destinationTrack] ?? []),
      ...(sourceClips as VideoEditorClip[]).map((clip) => ({
        ...clip,
        track: destinationTrack,
        audioRole: clip.mediaType === "audio"
          ? clip.audioRole ?? (LEGACY_SEMANTIC_AUDIO_TRACKS.has(sourceTrack) ? sourceTrack as VideoEditorAudioRole : "original")
          : clip.audioRole,
      })),
    ];
  });
  const data: VideoEditorNodeData = {
    ...base,
    ...input,
    timelineTracks,
    tracks,
    layout: {
      ...(input.layout ?? {}),
      timelineHeight: Number.isFinite(Number(input.layout?.timelineHeight)) ? Math.min(560, Math.max(180, Number(input.layout?.timelineHeight))) : input.layout?.timelineHeight,
    },
    selectedTrackId: typeof input.selectedTrackId === "string" && !LEGACY_SEMANTIC_AUDIO_TRACKS.has(input.selectedTrackId) ? input.selectedTrackId : base.selectedTrackId,
    playheadTime: Number.isFinite(Number(input.playheadTime)) ? Number(input.playheadTime) : 0,
    timelineZoom: Number.isFinite(Number(input.timelineZoom)) ? Math.min(80, Math.max(8, Number(input.timelineZoom))) : base.timelineZoom,
    totalDurationSeconds: Number.isFinite(Number(input.totalDurationSeconds)) ? Number(input.totalDurationSeconds) : calculateTimelineDuration(tracks),
    audioRequests: Array.isArray(input.audioRequests) ? input.audioRequests : [],
    subtitleTracks: Array.isArray(input.subtitleTracks) ? input.subtitleTracks : [],
    selectedSubtitleSegmentId: typeof input.selectedSubtitleSegmentId === "string" ? input.selectedSubtitleSegmentId : undefined,
    status: input.status ?? "empty",
    render: {
      ...createDefaultVideoEditorRenderState(),
      ...(input.render ?? {}),
      settings: {
        ...createDefaultVideoEditorRenderState().settings,
        ...(input.render?.settings ?? {}),
      },
    },
  };
  return {
    ...data,
    totalDurationSeconds: calculateTimelineDuration(data.tracks),
  };
}

export function buildVideoEditorRenderManifest(
  data: VideoEditorNodeData,
  editorNodeId: string,
): VideoEditorRenderManifestResult {
  const normalized = normalizeVideoEditorData(data);
  const renderState = normalized.render ?? createDefaultVideoEditorRenderState();
  const settings = renderState.settings ?? createDefaultVideoEditorRenderState().settings;
  const errors: string[] = [];
  const warnings: string[] = [];
  let ignoredClips = 0;
  const timelineTracks = getVideoEditorTimelineTracks(normalized);
  const tracks = timelineTracks.reduce((acc, layer) => {
    const track = layer.id;
    acc[track] = normalized.tracks[track]
      .filter((clip) => {
        const keep = !layer.hidden && Boolean(clip.assetId || clip.url) && (clip.mediaType === "image" || clip.mediaType === "video" || clip.mediaType === "audio");
        if (!keep) ignoredClips++;
        return keep;
      })
      .map((clip) => ({
        id: clip.id,
        assetId: clip.assetId || clip.url || "",
        url: clip.url,
        s3Key: clip.s3Key,
        mediaType: clip.mediaType,
        track,
        startTime: Math.max(0, clip.startTime),
        durationSeconds: Math.max(0.1, clip.durationSeconds),
        sourceDurationSeconds: clip.sourceDurationSeconds,
        extendMode: clip.extendMode,
        trimStart: clip.trimStart,
        trimEnd: clip.trimEnd,
        volume: clip.mute || layer.muted ? 0 : clip.volume,
        fadeInSeconds: clip.fadeInSeconds,
        fadeOutSeconds: clip.fadeOutSeconds,
        audioRole: clip.audioRole,
        fitMode: clip.framing ?? "fill",
        motion: clip.motion,
        title: clip.title,
        metadata: clip.metadata,
      }))
      .sort((a, b) => a.startTime - b.startTime);
    return acc;
  }, {} as VideoEditorRenderManifest["tracks"]);
  const visualTrackIds = timelineTracks.filter((track) => track.kind === "visual" && !track.hidden).map((track) => track.id);
  const visualClips = visualTrackIds.flatMap((track) => tracks[track] ?? []).filter((clip) => clip.mediaType === "image" || clip.mediaType === "video");
  if (!visualClips.length) errors.push("No hay clips visuales en la pista Video.");
  if (normalized.totalDurationSeconds <= 0) errors.push("La duración del timeline es 0.");
  const includedClips = timelineTracks.reduce((count, track) => count + (tracks[track.id]?.length ?? 0), 0);
  if (ignoredClips > 0) warnings.push(`${ignoredClips} clip(s) se ignorarán porque no tienen media resoluble o están en una pista oculta.`);
  const visualGaps = findVisualGaps(tracks, visualTrackIds, calculateTimelineDuration(normalized.tracks));
  if (visualGaps.length) {
    warnings.push(`Hay ${visualGaps.length} hueco(s) visuales; el render insertará negro en esos tramos.`);
  }
  const overExtendedClips = Object.values(tracks).flat().filter((clip) => {
    if (clip.mediaType === "image" || !Number.isFinite(Number(clip.sourceDurationSeconds))) return false;
    const available = Number(clip.sourceDurationSeconds) - Math.max(0, clip.trimStart ?? 0) - Math.max(0, clip.trimEnd ?? 0);
    return clip.durationSeconds > available + 0.05;
  });
  if (overExtendedClips.length) warnings.push(`${overExtendedClips.length} clip(s) superan la duración de su fuente.`);
  const subtitleTracks = (normalized.subtitleTracks ?? [])
    .filter((track) => track.enabled && track.document?.segments?.length)
    .map((track) => ({
      id: track.id,
      enabled: track.enabled,
      mode: track.mode,
      burnIn: track.burnIn,
      documentKey: track.documentKey,
      document: track.document,
      exportSrt: track.exportSrt,
      exportVtt: track.exportVtt,
      exportAss: track.exportAss,
      style: track.style,
    }));
  const invalidSubtitleSegments = subtitleTracks.flatMap((track) => track.document?.segments ?? []).filter((segment) => (
    segment.start < 0 || segment.end <= segment.start || segment.end > calculateTimelineDuration(normalized.tracks) + 0.05
  ));
  if (invalidSubtitleSegments.length) warnings.push(`${invalidSubtitleSegments.length} segmento(s) de subtítulos están fuera de rango.`);
  const manifest = {
    editorNodeId,
    settings: {
      width: settings.width,
      height: settings.height,
      fps: settings.fps,
      format: "mp4" as const,
      videoCodec: "h264" as const,
      audioCodec: "aac" as const,
      quality: settings.quality,
      backgroundColor: "black" as const,
    },
    durationSeconds: calculateTimelineDuration(normalized.tracks),
    tracks,
    layers: timelineTracks.map((track, index) => ({
      id: track.id,
      kind: track.kind,
      label: track.label,
      order: index,
      hidden: track.hidden,
      muted: track.muted,
    })),
    subtitleTracks,
    metadata: {
      sourceMediaListId: normalized.sourceMediaList?.sourceNodeId,
      projectTitle: normalized.sourceMediaList?.title,
      createdAt: new Date().toISOString(),
    },
  };
  return {
    ok: errors.length === 0,
    manifest,
    errors,
    warnings,
    includedClips,
    ignoredClips,
  };
}

function findVisualGaps(
  tracks: VideoEditorRenderManifest["tracks"],
  visualTrackIds: string[],
  durationSeconds: number,
): Array<{ start: number; end: number }> {
  if (!visualTrackIds.length || durationSeconds <= 0) return [];
  const visualClips = visualTrackIds
    .flatMap((trackId) => tracks[trackId] ?? [])
    .filter((clip) => clip.mediaType === "image" || clip.mediaType === "video");
  if (!visualClips.length) return [];
  const cutPoints = Array.from(new Set([
    0,
    durationSeconds,
    ...visualClips.flatMap((clip) => [
      Math.max(0, clip.startTime),
      Math.min(durationSeconds, clip.startTime + Math.max(0.1, clip.durationSeconds)),
    ]),
  ]))
    .filter((point) => point >= 0 && point <= durationSeconds)
    .sort((a, b) => a - b);
  const gaps: Array<{ start: number; end: number }> = [];
  for (let index = 0; index < cutPoints.length - 1; index++) {
    const start = cutPoints[index] ?? 0;
    const end = cutPoints[index + 1] ?? start;
    if (end - start <= 0.05) continue;
    const lookupTime = start + 0.001;
    const hasVisual = visualTrackIds.some((trackId) => (tracks[trackId] ?? []).some((clip) => (
      (clip.mediaType === "image" || clip.mediaType === "video")
      && clip.startTime <= lookupTime
      && lookupTime < clip.startTime + Math.max(0.01, clip.durationSeconds)
    )));
    if (!hasVisual) gaps.push({ start, end });
  }
  return gaps;
}

function itemSortValue(item: MediaListItem): number {
  return (item.sceneOrder ?? item.order ?? 0) * 100 + (item.frameRole === "end" ? 2 : item.frameRole === "start" ? 1 : 0);
}

function shouldSkipTimelineItem(item: MediaListItem, sceneIdsWithVideo: Set<string>): boolean {
  if (item.mediaType === "placeholder") return true;
  if (!item.assetId && !item.url) return true;
  if (item.mediaType !== "image" && item.mediaType !== "video" && item.mediaType !== "audio") return true;
  return item.mediaType === "image" && Boolean(item.sceneId && sceneIdsWithVideo.has(item.sceneId));
}

function trackForMediaItem(item: MediaListItem): VideoEditorTrackKind {
  if (item.mediaType === "audio") return "audio";
  return "video";
}

export function clipFromMediaListItem(item: MediaListItem, startTime: number): VideoEditorClip {
  const durationSeconds = item.durationSeconds ?? (item.mediaType === "image" ? 4 : 5);
  return {
    id: `clip_${item.id}`,
    sourceItemId: item.id,
    assetId: item.assetId || item.url,
    url: item.url,
    s3Key: item.s3Key,
    mediaType: item.mediaType === "audio" ? "audio" : item.mediaType === "video" ? "video" : "image",
    track: trackForMediaItem(item),
    title: item.title,
    startTime,
    durationSeconds,
    sourceDurationSeconds: item.mediaType === "video" || item.mediaType === "audio" ? item.durationSeconds : undefined,
    extendMode: "trim",
    volume: item.mediaType === "audio" ? 1 : undefined,
    fadeInSeconds: item.mediaType === "audio" ? 0 : undefined,
    fadeOutSeconds: item.mediaType === "audio" ? 0 : undefined,
    audioRole: item.mediaType === "audio" ? "original" : undefined,
    mute: false,
    framing: item.mediaType === "image" ? "fill" : undefined,
    motion: item.mediaType === "image" ? "none" : undefined,
    sceneId: item.sceneId,
    sceneOrder: item.sceneOrder,
    metadata: item.metadata,
    status: item.status === "error" ? "error" : item.status === "approved" ? "approved" : "ready",
  };
}

export function buildInitialVideoEditorTracks(mediaList: MediaListOutput): VideoEditorNodeData["tracks"] {
  const ordered = [...mediaList.items].sort((a, b) => itemSortValue(a) - itemSortValue(b));
  const sceneIdsWithVideo = new Set(
    ordered
      .filter((item) => item.mediaType === "video" && Boolean(item.assetId || item.url) && item.sceneId)
      .map((item) => item.sceneId as string),
  );
  const tracks = createEmptyVideoEditorData().tracks;
  let videoStart = 0;
  let audioStart = 0;
  ordered.forEach((item) => {
    if (shouldSkipTimelineItem(item, sceneIdsWithVideo)) return;
    const track = trackForMediaItem(item);
    const start = track === "video" ? videoStart : audioStart;
    const clip = clipFromMediaListItem(item, start);
    tracks[track] = [...tracks[track], clip];
    if (track === "video") videoStart += clip.durationSeconds;
    else audioStart += clip.durationSeconds;
  });
  return tracks;
}

export function calculateTimelineDuration(tracks: VideoEditorNodeData["tracks"]): number {
  return Object.values(tracks).reduce((max, clips) => {
    const trackMax = (clips ?? []).reduce((innerMax, clip) => Math.max(innerMax, clip.startTime + clip.durationSeconds), 0);
    return Math.max(max, trackMax);
  }, 0);
}

export function clampVideoEditorTime(value: number, min = 0, max = Number.POSITIVE_INFINITY): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function getActiveVisualClipAtTime(data: VideoEditorNodeData, time: number): VideoEditorClip | undefined {
  const currentTime = Math.max(0, time);
  const visualTracks = getVideoEditorTimelineTracks(data).filter((track) => track.kind === "visual" && !track.hidden);
  for (const track of visualTracks) {
    const clip = [...(data.tracks[track.id] ?? [])]
      .sort((a, b) => a.startTime - b.startTime)
      .find((item) => (
        (item.mediaType === "video" || item.mediaType === "image")
        && item.startTime <= currentTime
        && currentTime < item.startTime + Math.max(0.01, item.durationSeconds)
      ));
    if (clip) return clip;
  }
  return undefined;
}

export function getAdjacentVisualClipsAtTime(data: VideoEditorNodeData, time: number): VideoEditorClip[] {
  const visualClips = getVideoEditorTimelineTracks(data)
    .filter((track) => track.kind === "visual" && !track.hidden)
    .flatMap((track) => data.tracks[track.id] ?? [])
    .filter((clip) => clip.mediaType === "video" || clip.mediaType === "image")
    .sort((a, b) => a.startTime - b.startTime);
  const activeIndex = visualClips.findIndex((clip) => (
      (clip.mediaType === "video" || clip.mediaType === "image")
      && clip.startTime <= time
      && time < clip.startTime + Math.max(0.01, clip.durationSeconds)
    ));
  const anchor = activeIndex >= 0 ? activeIndex : visualClips.findIndex((clip) => clip.startTime > time);
  const start = Math.max(0, (anchor >= 0 ? anchor : visualClips.length - 1) - 1);
  return visualClips.slice(start, start + 4);
}

export function getActiveAudioClipsAtTime(data: VideoEditorNodeData, time: number): VideoEditorClip[] {
  const currentTime = Math.max(0, time);
  return getVideoEditorTimelineTracks(data)
    .filter((track) => track.kind === "audio" && !track.hidden && !track.muted)
    .flatMap((track) => data.tracks[track.id] ?? [])
    .filter((clip) => clip.mediaType === "audio" && clip.startTime <= currentTime && currentTime < clip.startTime + Math.max(0.01, clip.durationSeconds));
}

function avoidVideoOverlap(clips: VideoEditorClip[], movingClip: VideoEditorClip, desiredStart: number, desiredDuration = movingClip.durationSeconds): number {
  const ordered = clips
    .filter((clip) => clip.id !== movingClip.id)
    .sort((a, b) => a.startTime - b.startTime);
  let start = Math.max(0, desiredStart);
  for (const clip of ordered) {
    const overlaps = start < clip.startTime + clip.durationSeconds && start + desiredDuration > clip.startTime;
    if (!overlaps) continue;
    start = desiredStart < clip.startTime ? Math.max(0, clip.startTime - desiredDuration) : clip.startTime + clip.durationSeconds;
  }
  return Math.max(0, start);
}

export function getVideoEditorClipMaxDuration(clip: VideoEditorClip): number {
  if (clip.mediaType === "image") return Number.POSITIVE_INFINITY;
  if (clip.extendMode && clip.extendMode !== "trim") return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(Number(clip.sourceDurationSeconds))) return Number.POSITIVE_INFINITY;
  const sourceDuration = Math.max(0.1, Number(clip.sourceDurationSeconds));
  const trimStart = Math.max(0, clip.trimStart ?? 0);
  return Math.max(0.1, sourceDuration - trimStart);
}

function clampClipDurationToSource(clip: VideoEditorClip, durationSeconds: number): number {
  return Math.min(Math.max(0.1, durationSeconds), getVideoEditorClipMaxDuration(clip));
}

function durationFromSourceTrim(clip: VideoEditorClip, trimStart = clip.trimStart ?? 0, trimEnd = clip.trimEnd ?? 0): number {
  if (clip.mediaType === "image" || !Number.isFinite(Number(clip.sourceDurationSeconds))) {
    return Math.max(0.1, clip.durationSeconds);
  }
  return Math.max(0.1, Number(clip.sourceDurationSeconds) - Math.max(0, trimStart) - Math.max(0, trimEnd));
}

function trimEndForDuration(clip: VideoEditorClip, durationSeconds: number): number | undefined {
  if (clip.mediaType === "image" || !Number.isFinite(Number(clip.sourceDurationSeconds))) return clip.trimEnd;
  return Math.max(0, Number(clip.sourceDurationSeconds) - Math.max(0, clip.trimStart ?? 0) - Math.max(0.1, durationSeconds));
}

function availableVisualDurationAfterClip(data: VideoEditorNodeData, track: VideoEditorTrackKind, clip: VideoEditorClip): number {
  const layer = getVideoEditorTimelineTracks(data).find((item) => item.id === track);
  if (layer?.kind !== "visual") return Number.POSITIVE_INFINITY;
  const next = (data.tracks[track] ?? [])
    .filter((item) => item.id !== clip.id && item.startTime >= clip.startTime)
    .sort((a, b) => a.startTime - b.startTime)[0];
  return next ? Math.max(0.1, next.startTime - clip.startTime) : Number.POSITIVE_INFINITY;
}

function isTrackCompatibleWithClip(track: VideoEditorTimelineTrack | undefined, clip: VideoEditorClip): boolean {
  if (!track || track.locked) return false;
  return track.kind === (clip.mediaType === "audio" ? "audio" : "visual");
}

export function moveVideoEditorClip(data: VideoEditorNodeData, clipId: string, desiredStartTime: number, desiredTrackId?: VideoEditorTrackKind): VideoEditorNodeData {
  const tracks = { ...data.tracks };
  const timelineTracks = getVideoEditorTimelineTracks(data);
  const sourceTrackId = trackIdsForData(data).find((track) => tracks[track]?.some((clip) => clip.id === clipId));
  const clip = sourceTrackId ? tracks[sourceTrackId]?.find((item) => item.id === clipId) : undefined;
  if (!sourceTrackId || !clip || clip.locked) return data;
  const sourceTrack = timelineTracks.find((track) => track.id === sourceTrackId);
  const requestedTrack = desiredTrackId ? timelineTracks.find((track) => track.id === desiredTrackId) : sourceTrack;
  const targetTrack = isTrackCompatibleWithClip(requestedTrack, clip) ? requestedTrack : sourceTrack;
  if (!targetTrack || !isTrackCompatibleWithClip(targetTrack, clip)) return data;
  const targetTrackClips = (data.tracks[targetTrack.id] ?? []).filter((item) => item.id !== clip.id);
  const startTime = targetTrack.kind === "visual" ? avoidVideoOverlap(targetTrackClips, clip, desiredStartTime) : Math.max(0, desiredStartTime);
  tracks[sourceTrackId] = (tracks[sourceTrackId] ?? []).filter((item) => item.id !== clipId);
  tracks[targetTrack.id] = [...(tracks[targetTrack.id] ?? []), { ...clip, track: targetTrack.id, startTime }];
  return {
    ...data,
    tracks,
    selectedClipId: clipId,
    selectedTrackId: targetTrack.id,
    totalDurationSeconds: calculateTimelineDuration(tracks),
    status: "editing",
  };
}

export function resizeVideoEditorClip(data: VideoEditorNodeData, clipId: string, desiredDurationSeconds: number): VideoEditorNodeData {
  const tracks = { ...data.tracks };
  const timelineTracks = getVideoEditorTimelineTracks(data);
  trackIdsForData(data).forEach((track) => {
    tracks[track] = tracks[track].map((clip) => {
      if (clip.id !== clipId || clip.locked) return clip;
      let durationSeconds = clampClipDurationToSource(clip, desiredDurationSeconds);
      const layer = timelineTracks.find((item) => item.id === track);
      if (layer?.kind === "visual") {
        const next = (data.tracks[track] ?? [])
          .filter((item) => item.id !== clip.id && item.startTime >= clip.startTime)
          .sort((a, b) => a.startTime - b.startTime)[0];
        if (next) durationSeconds = Math.min(durationSeconds, Math.max(0.1, next.startTime - clip.startTime));
      }
      return { ...clip, durationSeconds, trimEnd: trimEndForDuration(clip, durationSeconds) };
    });
  });
  return { ...data, tracks, totalDurationSeconds: calculateTimelineDuration(tracks), status: "editing" };
}

export function setVideoEditorClipStartTrim(data: VideoEditorNodeData, clipId: string, desiredTrimStart: number): VideoEditorNodeData {
  const tracks = { ...data.tracks };
  trackIdsForData(data).forEach((track) => {
    tracks[track] = tracks[track].map((clip) => {
      if (clip.id !== clipId || clip.locked || clip.mediaType === "image") return clip;
      const sourceDuration = Number(clip.sourceDurationSeconds);
      const maxTrimStart = Number.isFinite(Number(clip.sourceDurationSeconds))
        ? Math.max(0, sourceDuration - Math.max(0, clip.trimEnd ?? 0) - 0.1)
        : Number.POSITIVE_INFINITY;
      const maxDuration = availableVisualDurationAfterClip(data, track, clip);
      const minTrimStartForRoom = Number.isFinite(sourceDuration) && Number.isFinite(maxDuration)
        ? Math.max(0, sourceDuration - Math.max(0, clip.trimEnd ?? 0) - maxDuration)
        : 0;
      const trimStart = Math.max(minTrimStartForRoom, Math.min(Math.max(0, desiredTrimStart), maxTrimStart));
      return {
        ...clip,
        trimStart,
        durationSeconds: Math.min(durationFromSourceTrim(clip, trimStart, clip.trimEnd ?? 0), maxDuration),
      };
    });
  });
  return { ...data, tracks, totalDurationSeconds: calculateTimelineDuration(tracks), status: "editing" };
}

export function setVideoEditorClipEndTrim(data: VideoEditorNodeData, clipId: string, desiredTrimEnd: number): VideoEditorNodeData {
  const tracks = { ...data.tracks };
  trackIdsForData(data).forEach((track) => {
    tracks[track] = tracks[track].map((clip) => {
      if (clip.id !== clipId || clip.locked || clip.mediaType === "image") return clip;
      const sourceDuration = Number(clip.sourceDurationSeconds);
      const maxTrimEnd = Number.isFinite(Number(clip.sourceDurationSeconds))
        ? Math.max(0, sourceDuration - Math.max(0, clip.trimStart ?? 0) - 0.1)
        : Number.POSITIVE_INFINITY;
      const maxDuration = availableVisualDurationAfterClip(data, track, clip);
      const minTrimEndForRoom = Number.isFinite(sourceDuration) && Number.isFinite(maxDuration)
        ? Math.max(0, sourceDuration - Math.max(0, clip.trimStart ?? 0) - maxDuration)
        : 0;
      const trimEnd = Math.max(minTrimEndForRoom, Math.min(Math.max(0, desiredTrimEnd), maxTrimEnd));
      return {
        ...clip,
        trimEnd,
        durationSeconds: Math.min(durationFromSourceTrim(clip, clip.trimStart ?? 0, trimEnd), maxDuration),
      };
    });
  });
  return { ...data, tracks, totalDurationSeconds: calculateTimelineDuration(tracks), status: "editing" };
}

export function trimVideoEditorClipStart(data: VideoEditorNodeData, clipId: string, desiredStartTime: number): VideoEditorNodeData {
  const tracks = { ...data.tracks };
  const timelineTracks = getVideoEditorTimelineTracks(data);
  trackIdsForData(data).forEach((track) => {
    tracks[track] = tracks[track].map((clip) => {
      if (clip.id !== clipId || clip.locked) return clip;
      const originalEnd = clip.startTime + clip.durationSeconds;
      const layer = timelineTracks.find((item) => item.id === track);
      const previous = layer?.kind === "visual"
        ? (data.tracks[track] ?? [])
          .filter((item) => item.id !== clip.id && item.startTime + item.durationSeconds <= clip.startTime + 0.01)
          .sort((a, b) => (b.startTime + b.durationSeconds) - (a.startTime + a.durationSeconds))[0]
        : undefined;
      const minStart = previous ? previous.startTime + previous.durationSeconds : 0;
      const nextStart = Math.min(originalEnd - 0.1, Math.max(minStart, desiredStartTime));
      const startDelta = nextStart - clip.startTime;
      const trimStart = clip.mediaType === "video" ? Math.max(0, (clip.trimStart ?? 0) + startDelta) : clip.trimStart;
      return {
        ...clip,
        startTime: nextStart,
        durationSeconds: Math.max(0.1, originalEnd - nextStart),
        trimStart,
      };
    });
  });
  return { ...data, tracks, totalDurationSeconds: calculateTimelineDuration(tracks), status: "editing" };
}

export function ingestMediaListToVideoEditor(mediaList: MediaListOutput, existing?: VideoEditorNodeData): VideoEditorNodeData {
  const current = normalizeVideoEditorData(existing);
  const freshTracks = buildInitialVideoEditorTracks(mediaList);
  const existingSourceIds = new Set(
    Object.values(current.tracks).flatMap((clips) => clips.map((clip) => clip.sourceItemId).filter(Boolean) as string[]),
  );
  const mergedTracks = { ...current.tracks };
  VIDEO_EDITOR_TRACK_ORDER.forEach((track) => {
    const additions = freshTracks[track].filter((clip) => !clip.sourceItemId || !existingSourceIds.has(clip.sourceItemId));
    mergedTracks[track] = [...mergedTracks[track], ...additions];
  });
  const next: VideoEditorNodeData = {
    ...current,
    sourceMediaList: mediaList,
    sourceMediaListFingerprint: mediaListFingerprint(mediaList),
    tracks: mergedTracks,
    status: "media_loaded",
  };
  return {
    ...next,
    totalDurationSeconds: calculateTimelineDuration(next.tracks),
  };
}

export function patchVideoEditorClip(data: VideoEditorNodeData, clipId: string, patch: Partial<VideoEditorClip>): VideoEditorNodeData {
  const tracks = { ...data.tracks };
  const trackIds = trackIdsForData(data);
  if (patch.track && trackIds.includes(patch.track)) {
    const originalTrack = trackIds.find((track) => tracks[track]?.some((clip) => clip.id === clipId));
    const originalClip = originalTrack ? tracks[originalTrack].find((clip) => clip.id === clipId) : undefined;
    if (originalClip) {
      trackIds.forEach((track) => {
        tracks[track] = tracks[track].filter((clip) => clip.id !== clipId);
      });
      const nextClip = { ...originalClip, ...patch, track: patch.track };
      tracks[patch.track] = [...(tracks[patch.track] ?? []), nextClip];
      return { ...data, tracks, totalDurationSeconds: calculateTimelineDuration(tracks), status: "editing" };
    }
  }
  trackIds.forEach((track) => {
    tracks[track] = tracks[track].map((clip) => {
      if (clip.id !== clipId) return clip;
      const nextClip = { ...clip, ...patch };
      return {
        ...nextClip,
        durationSeconds: clampClipDurationToSource(nextClip, nextClip.durationSeconds),
      };
    });
  });
  return { ...data, tracks, totalDurationSeconds: calculateTimelineDuration(tracks), status: "editing" };
}

export function removeVideoEditorClip(data: VideoEditorNodeData, clipId: string): VideoEditorNodeData {
  const tracks = { ...data.tracks };
  trackIdsForData(data).forEach((track) => {
    tracks[track] = tracks[track].filter((clip) => clip.id !== clipId);
  });
  return { ...data, tracks, selectedClipId: data.selectedClipId === clipId ? undefined : data.selectedClipId, totalDurationSeconds: calculateTimelineDuration(tracks), status: "editing" };
}

export function duplicateVideoEditorClip(data: VideoEditorNodeData, clipId: string): VideoEditorNodeData {
  const tracks = { ...data.tracks };
  trackIdsForData(data).forEach((track) => {
    const clip = tracks[track]?.find((item) => item.id === clipId);
    if (!clip) return;
    tracks[track] = [...tracks[track], { ...clip, id: `clip_dup_${Date.now()}`, startTime: clip.startTime + clip.durationSeconds }];
  });
  return { ...data, tracks, totalDurationSeconds: calculateTimelineDuration(tracks), status: "editing" };
}

export function splitVideoEditorClipAtTime(data: VideoEditorNodeData, clipId: string, splitTime: number): VideoEditorNodeData {
  const tracks = { ...data.tracks };
  let selectedTrackId: VideoEditorTrackKind | undefined;
  let selectedClipId: string | undefined;
  trackIdsForData(data).forEach((track) => {
    tracks[track] = (tracks[track] ?? []).flatMap((clip) => {
      if (clip.id !== clipId || clip.locked) return [clip];
      const clipEnd = clip.startTime + clip.durationSeconds;
      const splitAt = clampVideoEditorTime(splitTime, clip.startTime + 0.1, clipEnd - 0.1);
      const leftDuration = Math.max(0.1, splitAt - clip.startTime);
      const rightDuration = Math.max(0.1, clipEnd - splitAt);
      if (leftDuration < 0.1 || rightDuration < 0.1) return [clip];
      const rightId = `${clip.id}_split_${Date.now()}`;
      const rightTrimStart = clip.mediaType === "image" ? clip.trimStart : Math.max(0, (clip.trimStart ?? 0) + leftDuration);
      selectedTrackId = track;
      selectedClipId = rightId;
      return [
        {
          ...clip,
          durationSeconds: leftDuration,
          trimEnd: trimEndForDuration(clip, leftDuration),
        },
        {
          ...clip,
          id: rightId,
          startTime: splitAt,
          durationSeconds: rightDuration,
          trimStart: rightTrimStart,
          trimEnd: clip.trimEnd,
        },
      ];
    }).sort((a, b) => a.startTime - b.startTime || a.durationSeconds - b.durationSeconds);
  });
  if (!selectedClipId) return data;
  return {
    ...data,
    tracks,
    selectedTrackId,
    selectedClipId,
    totalDurationSeconds: calculateTimelineDuration(tracks),
    status: "editing",
  };
}

function trackForNewClip(data: VideoEditorNodeData, item: MediaListItem): VideoEditorTrackKind {
  const mediaKind = item.mediaType === "audio" ? "audio" : "visual";
  const timelineTracks = getVideoEditorTimelineTracks(data);
  const selectedTrack = timelineTracks.find((track) => track.id === data.selectedTrackId && track.kind === mediaKind && !track.locked);
  if (selectedTrack) return selectedTrack.id;
  const firstCompatibleTrack = timelineTracks.find((track) => track.kind === mediaKind && !track.locked);
  return firstCompatibleTrack?.id ?? trackForMediaItem(item);
}

export function addMediaListItemToTimeline(data: VideoEditorNodeData, item: MediaListItem): VideoEditorNodeData {
  if (item.mediaType === "placeholder" || (!item.assetId && !item.url)) return data;
  const track = trackForNewClip(data, item);
  const layer = getVideoEditorTimelineTracks(data).find((itemTrack) => itemTrack.id === track);
  const startTime = layer?.kind === "visual" ? (data.tracks[track] ?? []).reduce((max, clip) => Math.max(max, clip.startTime + clip.durationSeconds), 0) : data.playheadTime;
  const clip = { ...clipFromMediaListItem(item, startTime), track };
  const tracks = { ...data.tracks, [track]: [...(data.tracks[track] ?? []), { ...clip, id: `${clip.id}_${Date.now()}` }] };
  return { ...data, tracks, selectedTrackId: track, totalDurationSeconds: calculateTimelineDuration(tracks), status: "editing" };
}

export function createVideoEditorTimelineTrack(data: VideoEditorNodeData, kind: "visual" | "audio"): VideoEditorNodeData {
  const timelineTracks = getVideoEditorTimelineTracks(data);
  const count = timelineTracks.filter((track) => track.kind === kind).length + 1;
  const id = `${kind === "visual" ? "video" : "audio"}_${Date.now()}`;
  const track: VideoEditorTimelineTrack = {
    id,
    kind,
    label: kind === "visual" ? `V${count}` : `A${count}`,
    role: "custom",
    height: kind === "visual" ? 54 : 46,
  };
  const firstVisualIndex = timelineTracks.findIndex((item) => item.kind === "visual");
  const nextTimelineTracks = kind === "visual" && firstVisualIndex >= 0
    ? [...timelineTracks.slice(0, firstVisualIndex), track, ...timelineTracks.slice(firstVisualIndex)]
    : [...timelineTracks, track];
  return {
    ...data,
    timelineTracks: nextTimelineTracks,
    tracks: { ...data.tracks, [id]: [] },
    selectedTrackId: id,
    status: "editing",
  };
}

export function patchVideoEditorTimelineTrack(data: VideoEditorNodeData, trackId: VideoEditorTrackKind, patch: Partial<VideoEditorTimelineTrack>): VideoEditorNodeData {
  const timelineTracks = getVideoEditorTimelineTracks(data).map((track) => track.id === trackId ? { ...track, ...patch, id: track.id, kind: patch.kind ?? track.kind } : track);
  return { ...data, timelineTracks, status: "editing" };
}

export function deleteVideoEditorTimelineTrack(data: VideoEditorNodeData, trackId: VideoEditorTrackKind): VideoEditorNodeData {
  const timelineTracks = getVideoEditorTimelineTracks(data);
  const track = timelineTracks.find((item) => item.id === trackId);
  if (!track) return data;
  const sameKindTracks = timelineTracks.filter((item) => item.kind === track.kind);
  if (sameKindTracks.length <= 1) return data;
  const targetTrack = sameKindTracks.find((item) => item.id !== trackId && !item.locked) ?? sameKindTracks.find((item) => item.id !== trackId);
  if (!targetTrack) return data;
  const movingClips = data.tracks[trackId] ?? [];
  const targetClips = [...(data.tracks[targetTrack.id] ?? [])];
  const movedClips = movingClips.map((clip) => {
    const startTime = targetTrack.kind === "visual" ? avoidVideoOverlap(targetClips, clip, clip.startTime) : clip.startTime;
    const movedClip = { ...clip, track: targetTrack.id, startTime };
    targetClips.push(movedClip);
    return movedClip;
  });
  const tracks = { ...data.tracks, [targetTrack.id]: [...(data.tracks[targetTrack.id] ?? []), ...movedClips] };
  delete tracks[trackId];
  const nextTimelineTracks = timelineTracks.filter((item) => item.id !== trackId);
  return {
    ...data,
    timelineTracks: nextTimelineTracks,
    tracks,
    selectedTrackId: data.selectedTrackId === trackId ? targetTrack.id : data.selectedTrackId,
    selectedClipId: data.selectedClipId,
    totalDurationSeconds: calculateTimelineDuration(tracks),
    status: "editing",
  };
}

export function createAudioRequest(args: {
  type: TimelineAudioRequest["type"];
  playheadTime: number;
  durationSeconds: number;
  prompt: string;
  mood?: string;
  intensity?: TimelineAudioRequest["intensity"];
  energy?: TimelineAudioRequest["energy"];
  variations: number;
  sourceNodeId?: string;
  sourceMediaListId?: string;
}): TimelineAudioRequest {
  return {
    id: `audio_request_${Date.now()}`,
    type: args.type,
    startTime: args.playheadTime,
    durationSeconds: args.durationSeconds,
    prompt: args.prompt,
    mood: args.mood,
    intensity: args.intensity,
    energy: args.energy,
    variations: args.variations,
    status: "draft",
    metadata: {
      generatedFrom: "video-editor",
      sourceNodeId: args.sourceNodeId,
      sourceMediaListId: args.sourceMediaListId,
      createdAt: new Date().toISOString(),
    },
  };
}

function trackForAudioRequest(data: VideoEditorNodeData): VideoEditorTrackKind {
  const timelineTracks = getVideoEditorTimelineTracks(data);
  const selectedTrack = timelineTracks.find((track) => track.id === data.selectedTrackId && track.kind === "audio" && !track.locked);
  if (selectedTrack) return selectedTrack.id;
  return timelineTracks.find((track) => track.kind === "audio" && !track.locked)?.id ?? "audio";
}

export function approveTimelineAudioVariation(data: VideoEditorNodeData, requestId: string, assetId: string, variationIndex: number): VideoEditorNodeData {
  const request = data.audioRequests.find((item) => item.id === requestId);
  if (!request) return data;
  const approvedRequest: TimelineAudioRequest = {
    ...request,
    status: "approved",
    approvedAssetId: assetId,
    selectedVariationIndex: variationIndex,
  };
  const track = trackForAudioRequest(data);
  const clip: VideoEditorClip = {
    id: `clip_${request.id}_${variationIndex}`,
    assetId,
    mediaType: "audio",
    track,
    title: request.prompt.slice(0, 64) || request.type,
    startTime: request.startTime,
    durationSeconds: request.durationSeconds,
    volume: 1,
    fadeInSeconds: 0,
    fadeOutSeconds: 0,
    audioRole: request.type,
    mute: false,
    metadata: request.metadata,
    status: "approved",
  };
  const tracks = { ...data.tracks, [track]: [...(data.tracks[track] ?? []), clip] };
  return {
    ...data,
    tracks,
    selectedTrackId: track,
    audioRequests: data.audioRequests.map((item) => item.id === requestId ? approvedRequest : item),
    totalDurationSeconds: calculateTimelineDuration(tracks),
    status: "editing",
  };
}

export function buildVideoEditorMediaListOutput(data: VideoEditorNodeData): MediaListOutput {
  const clips = Object.values(data.tracks).flat();
  return {
    kind: "media_list",
    sourceNodeId: "video-editor",
    sourceNodeType: "video_editor",
    title: data.label || "Video Editor",
    status: clips.length ? "frames_ready" : "empty",
    items: clips.map((clip, index) => ({
      id: clip.id,
      order: index + 1,
      title: clip.title,
      mediaType: clip.mediaType,
      role: clip.track,
      assetId: clip.assetId,
      url: clip.url,
      s3Key: clip.s3Key,
      durationSeconds: clip.durationSeconds,
      sceneId: clip.sceneId,
      sceneOrder: clip.sceneOrder,
      status: clip.status === "approved" ? "approved" : clip.status === "error" ? "error" : "generated",
      metadata: {
        ...(clip.metadata && typeof clip.metadata === "object" ? clip.metadata as Record<string, unknown> : {}),
        track: clip.track,
        audioRole: clip.audioRole,
        startTime: clip.startTime,
        trimStart: clip.trimStart,
        trimEnd: clip.trimEnd,
        volume: clip.volume,
        fadeInSeconds: clip.fadeInSeconds,
        fadeOutSeconds: clip.fadeOutSeconds,
      },
    })),
    metadata: {
      cineNodeId: "",
      generatedAt: new Date().toISOString(),
      totalFrames: clips.length,
    },
  };
}
