import { describe, expect, it } from "vitest";

import type { MediaListOutput } from "../media-list-output";
import {
  approveTimelineAudioVariation,
  buildInitialVideoEditorTracks,
  buildVideoEditorRenderManifest,
  createAudioRequest,
  createVideoEditorTimelineTrack,
  deleteVideoEditorTimelineTrack,
  getActiveVisualClipAtTime,
  getActiveVisualClipsAtTime,
  ingestMediaListToVideoEditor,
  moveVideoEditorClip,
  normalizeVideoEditorData,
  resizeVideoEditorClip,
  rippleDeleteVideoEditorClip,
  setVideoEditorClipEndTrim,
  setVideoEditorClipStartTrim,
  splitVideoEditorClipAtTime,
  trimVideoEditorClipStart,
} from "./video-editor-engine";
import { createEmptyVideoEditorData } from "./video-editor-types";
import { composeSegmentsFromWords } from "./subtitle-utils";
import { createDefaultSubtitleStyle, type VideoEditorSubtitleTrack } from "./subtitles-types";

function mediaList(items: MediaListOutput["items"]): MediaListOutput {
  return {
    kind: "media_list",
    sourceNodeId: "cine_1",
    sourceNodeType: "cine",
    title: "Cine",
    status: "frames_ready",
    items,
    metadata: {
      cineNodeId: "cine_1",
      generatedAt: "2026-05-01T00:00:00.000Z",
    },
  };
}

describe("video editor engine", () => {
  it("prioritizes scene videos over frames from the same scene", () => {
    const tracks = buildInitialVideoEditorTracks(mediaList([
      { id: "frame_1", order: 1, title: "Frame", mediaType: "image", role: "storyboard_frame", assetId: "asset://frame", sceneId: "scene_1", sceneOrder: 1, status: "generated" },
      { id: "video_1", order: 2, title: "Video", mediaType: "video", role: "scene_video", assetId: "asset://video", sceneId: "scene_1", sceneOrder: 1, status: "generated", durationSeconds: 8 },
    ]));

    expect(tracks.video).toHaveLength(1);
    expect(tracks.video[0]?.mediaType).toBe("video");
    expect(tracks.video[0]?.assetId).toBe("asset://video");
  });

  it("turns images into still clips and ignores placeholders", () => {
    const tracks = buildInitialVideoEditorTracks(mediaList([
      { id: "image_1", order: 1, title: "Still", mediaType: "image", role: "storyboard_frame", assetId: "asset://still", status: "generated" },
      { id: "pending", order: 2, title: "Pendiente", mediaType: "placeholder", role: "storyboard_placeholder", status: "pending" },
    ]));

    expect(tracks.video).toHaveLength(1);
    expect(tracks.video[0]?.durationSeconds).toBe(4);
    expect(tracks.video[0]?.title).toBe("Still");
  });

  it("refreshes media without duplicating existing source clips", () => {
    const list = mediaList([
      { id: "video_1", order: 1, title: "Video", mediaType: "video", role: "scene_video", assetId: "asset://video", status: "generated" },
    ]);
    const first = ingestMediaListToVideoEditor(list, createEmptyVideoEditorData());
    const second = ingestMediaListToVideoEditor(list, first);

    expect(first.tracks.video).toHaveLength(1);
    expect(second.tracks.video).toHaveLength(1);
  });

  it("creates an approved audio clip from an approved variation", () => {
    const data = createEmptyVideoEditorData();
    const request = {
      ...createAudioRequest({
        type: "sfx",
        playheadTime: 12,
        durationSeconds: 2,
        prompt: "Puffy ladra dos veces",
        variations: 2,
      }),
      status: "generated" as const,
      generatedAssetIds: ["asset://sfx-1", "asset://sfx-2"],
    };
    const next = approveTimelineAudioVariation({ ...data, audioRequests: [request] }, request.id, "asset://sfx-1", 0);

    expect(next.audioRequests[0]?.status).toBe("approved");
    expect(next.tracks.audio).toHaveLength(1);
    expect(next.tracks.audio[0]?.startTime).toBe(12);
    expect(next.tracks.audio[0]?.assetId).toBe("asset://sfx-1");
    expect(next.tracks.audio[0]?.audioRole).toBe("sfx");
  });

  it("finds the active visual clip at the playhead", () => {
    const data = ingestMediaListToVideoEditor(mediaList([
      { id: "image_1", order: 1, title: "Still A", mediaType: "image", role: "storyboard_frame", assetId: "asset://a", status: "generated", durationSeconds: 3 },
      { id: "image_2", order: 2, title: "Still B", mediaType: "image", role: "storyboard_frame", assetId: "asset://b", status: "generated", durationSeconds: 4 },
    ]), createEmptyVideoEditorData());

    expect(getActiveVisualClipAtTime(data, 1)?.title).toBe("Still A");
    expect(getActiveVisualClipAtTime(data, 3.2)?.title).toBe("Still B");
    expect(getActiveVisualClipAtTime(data, 8)).toBeUndefined();
  });

  it("keeps video clips from overlapping when moved or resized", () => {
    const data = ingestMediaListToVideoEditor(mediaList([
      { id: "image_1", order: 1, title: "Still A", mediaType: "image", role: "storyboard_frame", assetId: "asset://a", status: "generated", durationSeconds: 3 },
      { id: "image_2", order: 2, title: "Still B", mediaType: "image", role: "storyboard_frame", assetId: "asset://b", status: "generated", durationSeconds: 4 },
    ]), createEmptyVideoEditorData());

    const moved = moveVideoEditorClip(data, data.tracks.video[1]?.id ?? "", 1);
    expect(moved.tracks.video[1]?.startTime).toBeGreaterThanOrEqual(3);

    const resized = resizeVideoEditorClip(data, data.tracks.video[0]?.id ?? "", 10);
    expect(resized.tracks.video[0]?.durationSeconds).toBe(3);
  });

  it("clamps video clips to the detected source duration", () => {
    const data = ingestMediaListToVideoEditor(mediaList([
      { id: "video_1", order: 1, title: "Video", mediaType: "video", role: "scene_video", assetId: "asset://video", status: "generated", durationSeconds: 5 },
    ]), createEmptyVideoEditorData());

    const resized = resizeVideoEditorClip(data, data.tracks.video[0]?.id ?? "", 12);

    expect(resized.tracks.video[0]?.durationSeconds).toBe(5);
  });

  it("can shorten and then lengthen a clip again from the right edge", () => {
    const data = ingestMediaListToVideoEditor(mediaList([
      { id: "video_1", order: 1, title: "Video", mediaType: "video", role: "scene_video", assetId: "asset://video", status: "generated", durationSeconds: 8 },
    ]), createEmptyVideoEditorData());
    const clipId = data.tracks.video[0]?.id ?? "";

    const shortened = resizeVideoEditorClip(data, clipId, 3);
    const lengthened = resizeVideoEditorClip(shortened, clipId, 6);

    expect(shortened.tracks.video[0]?.durationSeconds).toBe(3);
    expect(shortened.tracks.video[0]?.trimEnd).toBe(5);
    expect(lengthened.tracks.video[0]?.durationSeconds).toBe(6);
    expect(lengthened.tracks.video[0]?.trimEnd).toBe(2);
  });

  it("creates custom timeline layers that participate in preview and render manifests", () => {
    const base = ingestMediaListToVideoEditor(mediaList([
      { id: "image_1", order: 1, title: "Base", mediaType: "image", role: "storyboard_frame", assetId: "knowledge-files/base.png", status: "generated", durationSeconds: 4 },
    ]), createEmptyVideoEditorData());
    const withLayer = createVideoEditorTimelineTrack(base, "visual");
    const customTrackId = withLayer.selectedTrackId ?? "";
    const overlayClip = {
      ...withLayer.tracks.video[0]!,
      id: "overlay_clip",
      track: customTrackId,
      title: "Overlay",
      assetId: "knowledge-files/overlay.png",
      startTime: 1,
      durationSeconds: 2,
    };
    const data = {
      ...withLayer,
      tracks: {
        ...withLayer.tracks,
        [customTrackId]: [overlayClip],
      },
    };

    const result = buildVideoEditorRenderManifest(data, "editor_1");

    expect(getActiveVisualClipAtTime(data, 1.5)?.title).toBe("Overlay");
    expect(getActiveVisualClipsAtTime(data, 1.5).map((clip) => clip.title)).toEqual(["Overlay", "Base"]);
    expect(result.ok).toBe(true);
    expect(result.manifest?.layers?.some((layer) => layer.id === customTrackId && layer.kind === "visual")).toBe(true);
    expect(result.manifest?.tracks[customTrackId]?.[0]?.title).toBe("Overlay");
  });

  it("moves clips between compatible timeline layers", () => {
    const base = ingestMediaListToVideoEditor(mediaList([
      { id: "image_1", order: 1, title: "Base", mediaType: "image", role: "storyboard_frame", assetId: "knowledge-files/base.png", status: "generated", durationSeconds: 4 },
    ]), createEmptyVideoEditorData());
    const withLayer = createVideoEditorTimelineTrack(base, "visual");
    const customTrackId = withLayer.selectedTrackId ?? "";
    const clipId = withLayer.tracks.video[0]?.id ?? "";

    const moved = moveVideoEditorClip(withLayer, clipId, 2, customTrackId);

    expect(moved.tracks.video).toHaveLength(0);
    expect(moved.tracks[customTrackId]?.[0]?.track).toBe(customTrackId);
    expect(moved.tracks[customTrackId]?.[0]?.startTime).toBe(2);
  });

  it("deletes custom tracks while preserving at least one track of each kind", () => {
    const base = ingestMediaListToVideoEditor(mediaList([
      { id: "image_1", order: 1, title: "Base", mediaType: "image", role: "storyboard_frame", assetId: "knowledge-files/base.png", status: "generated", durationSeconds: 4 },
    ]), createEmptyVideoEditorData());
    const withLayer = createVideoEditorTimelineTrack(base, "visual");
    const customTrackId = withLayer.selectedTrackId ?? "";
    const clipId = withLayer.tracks.video[0]?.id ?? "";
    const moved = moveVideoEditorClip(withLayer, clipId, 0, customTrackId);

    const deleted = deleteVideoEditorTimelineTrack(moved, customTrackId);
    const blocked = deleteVideoEditorTimelineTrack(base, "audio");

    expect(deleted.timelineTracks?.some((track) => track.id === customTrackId)).toBe(false);
    expect(deleted.tracks[customTrackId]).toBeUndefined();
    expect(deleted.tracks.video).toHaveLength(1);
    expect(deleted.tracks.video[0]?.track).toBe("video");
    expect(blocked).toBe(base);
  });

  it("migrates legacy semantic audio tracks into A1 roles", () => {
    const normalized = normalizeVideoEditorData({
      ...createEmptyVideoEditorData(),
      timelineTracks: [
        { id: "video", kind: "visual", label: "V1" },
        { id: "sfx", kind: "audio", label: "SFX / Ruidos" },
      ],
      tracks: {
        video: [],
        audio: [],
        sfx: [{
          id: "clip_sfx",
          assetId: "asset://sfx",
          mediaType: "audio",
          track: "sfx",
          title: "Hit",
          startTime: 1,
          durationSeconds: 2,
        }],
      },
    });

    expect(normalized.timelineTracks?.some((track) => track.id === "sfx")).toBe(false);
    expect(normalized.tracks.audio).toHaveLength(1);
    expect(normalized.tracks.audio[0]?.track).toBe("audio");
    expect(normalized.tracks.audio[0]?.audioRole).toBe("sfx");
  });

  it("trims a clip from the start while keeping its end fixed", () => {
    const data = ingestMediaListToVideoEditor(mediaList([
      { id: "video_1", order: 1, title: "Video", mediaType: "video", role: "scene_video", assetId: "asset://video", status: "generated", durationSeconds: 8 },
    ]), createEmptyVideoEditorData());
    const clipId = data.tracks.video[0]?.id ?? "";

    const trimmed = trimVideoEditorClipStart(data, clipId, 2);

    expect(trimmed.tracks.video[0]?.startTime).toBe(2);
    expect(trimmed.tracks.video[0]?.durationSeconds).toBe(6);
    expect(trimmed.tracks.video[0]?.trimStart).toBe(2);
  });

  it("splits a video clip at the playhead and preserves source trim", () => {
    const data = ingestMediaListToVideoEditor(mediaList([
      { id: "video_1", order: 1, title: "Video", mediaType: "video", role: "scene_video", assetId: "asset://video", status: "generated", durationSeconds: 8 },
    ]), createEmptyVideoEditorData());
    const clipId = data.tracks.video[0]?.id ?? "";

    const split = splitVideoEditorClipAtTime(data, clipId, 3);

    expect(split.tracks.video).toHaveLength(2);
    expect(split.tracks.video[0]?.durationSeconds).toBe(3);
    expect(split.tracks.video[0]?.trimEnd).toBe(5);
    expect(split.tracks.video[1]?.startTime).toBe(3);
    expect(split.tracks.video[1]?.durationSeconds).toBe(5);
    expect(split.tracks.video[1]?.trimStart).toBe(3);
    expect(split.selectedClipId).toBe(split.tracks.video[1]?.id);
  });

  it("updates trim fields and timeline duration from inspector-style edits", () => {
    const data = ingestMediaListToVideoEditor(mediaList([
      { id: "video_1", order: 1, title: "Video", mediaType: "video", role: "scene_video", assetId: "asset://video", status: "generated", durationSeconds: 8 },
    ]), createEmptyVideoEditorData());
    const clipId = data.tracks.video[0]?.id ?? "";

    const trimmedStart = setVideoEditorClipStartTrim(data, clipId, 1.5);
    const trimmedEnd = setVideoEditorClipEndTrim(trimmedStart, clipId, 2);

    expect(trimmedStart.tracks.video[0]?.trimStart).toBe(1.5);
    expect(trimmedStart.tracks.video[0]?.durationSeconds).toBe(6.5);
    expect(trimmedEnd.tracks.video[0]?.trimEnd).toBe(2);
    expect(trimmedEnd.tracks.video[0]?.durationSeconds).toBe(4.5);
  });

  it("resolves corrupted s3-file route urls into s3 keys in the render manifest", () => {
    const corruptedUrl =
      "/api/spaces/s3-fi-assets%2F1d760e9bdac7a6cce988%2Fg2a318d16-8868-448e-8505-e4950432aeb46b08c70ce9.mp4";
    const data = ingestMediaListToVideoEditor(mediaList([
      {
        id: "video_1",
        order: 1,
        title: "Video",
        mediaType: "video",
        role: "scene_video",
        url: corruptedUrl,
        assetId: corruptedUrl,
        status: "generated",
        durationSeconds: 8,
      },
    ]), createEmptyVideoEditorData());

    const result = buildVideoEditorRenderManifest(data, "editor_1");

    expect(result.ok).toBe(true);
    expect(result.manifest?.tracks.video[0]?.s3Key).toBe(
      "knowledge-files/user-assets/1d760e9bdac7a6cce988/g2a318d16-8868-448e-8505-e4950432aeb46b08c70ce9.mp4",
    );
  });

  it("ripple delete shifts subsequent clips on the same track", () => {
    const data = ingestMediaListToVideoEditor(mediaList([
      { id: "image_1", order: 1, title: "Still A", mediaType: "image", role: "storyboard_frame", assetId: "asset://a", status: "generated", durationSeconds: 3 },
      { id: "image_2", order: 2, title: "Still B", mediaType: "image", role: "storyboard_frame", assetId: "asset://b", status: "generated", durationSeconds: 4 },
    ]), createEmptyVideoEditorData());

    const firstId = data.tracks.video[0]?.id ?? "";
    const deleted = rippleDeleteVideoEditorClip(data, firstId);

    expect(deleted.tracks.video).toHaveLength(1);
    expect(deleted.tracks.video[0]?.startTime).toBe(0);
    expect(deleted.tracks.video[0]?.title).toBe("Still B");
  });

  it("builds a render manifest and preserves trim and volume", () => {
    const data = ingestMediaListToVideoEditor(mediaList([
      { id: "video_1", order: 1, title: "Video", mediaType: "video", role: "scene_video", assetId: "knowledge-files/video.mp4", status: "generated", durationSeconds: 8 },
      { id: "audio_1", order: 2, title: "Music", mediaType: "audio", role: "music", assetId: "knowledge-files/music.m4a", status: "generated", durationSeconds: 8 },
      { id: "pending", order: 3, title: "Pending", mediaType: "placeholder", role: "storyboard_placeholder", status: "pending" },
    ]), createEmptyVideoEditorData());
    const videoId = data.tracks.video[0]?.id ?? "";
    const audioId = data.tracks.audio[0]?.id ?? "";
    const patched = {
      ...data,
      tracks: {
        ...data.tracks,
        video: data.tracks.video.map((clip) => clip.id === videoId ? { ...clip, trimStart: 1 } : clip),
        audio: data.tracks.audio.map((clip) => clip.id === audioId ? { ...clip, volume: 0.4, fadeInSeconds: 1 } : clip),
      },
    };

    const result = buildVideoEditorRenderManifest(patched, "editor_1");

    expect(result.ok).toBe(true);
    expect(result.manifest?.tracks.video[0]?.trimStart).toBe(1);
    expect(result.manifest?.tracks.audio[0]?.volume).toBe(0.4);
    expect(result.manifest?.durationSeconds).toBe(8);
    expect(result.ignoredClips).toBe(0);
  });

  it("preserves image motion presets in the render manifest", () => {
    const data = ingestMediaListToVideoEditor(mediaList([
      { id: "image_1", order: 1, title: "Still", mediaType: "image", role: "storyboard_frame", assetId: "knowledge-files/still.png", status: "generated", durationSeconds: 4 },
    ]), createEmptyVideoEditorData());
    const imageId = data.tracks.video[0]?.id ?? "";
    const patched = {
      ...data,
      tracks: {
        ...data.tracks,
        video: data.tracks.video.map((clip) => clip.id === imageId ? { ...clip, motion: "slow_zoom_in" as const } : clip),
      },
    };

    const result = buildVideoEditorRenderManifest(patched, "editor_1");

    expect(result.ok).toBe(true);
    expect(result.manifest?.tracks.video[0]?.motion).toBe("slow_zoom_in");
  });

  it("rejects render manifests without visual clips", () => {
    const result = buildVideoEditorRenderManifest(createEmptyVideoEditorData(), "editor_1");

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("No hay clips visuales");
  });

  it("composes word timestamps into readable subtitle segments", () => {
    const segments = composeSegmentsFromWords([
      { id: "w1", text: "Hola", start: 0, end: 0.3 },
      { id: "w2", text: "Puffy.", start: 0.32, end: 0.7 },
      { id: "w3", text: "Entramos", start: 1.4, end: 1.8 },
      { id: "w4", text: "al", start: 1.82, end: 2 },
      { id: "w5", text: "bosque", start: 2.02, end: 2.4 },
    ], { respectPauses: true, maxCharsPerLine: 30 });

    expect(segments).toHaveLength(2);
    expect(segments[0]?.text).toBe("Hola Puffy.");
    expect(segments[1]?.text).toBe("Entramos al bosque");
  });

  it("adds enabled subtitles to the render manifest", () => {
    const data = ingestMediaListToVideoEditor(mediaList([
      { id: "video_1", order: 1, title: "Video", mediaType: "video", role: "scene_video", assetId: "knowledge-files/video.mp4", status: "generated", durationSeconds: 8 },
    ]), createEmptyVideoEditorData());
    const style = createDefaultSubtitleStyle("creator");
    const subtitleTrack: VideoEditorSubtitleTrack = {
      id: "sub_track_1",
      enabled: true,
      mode: "lines",
      burnIn: true,
      exportSrt: true,
      exportVtt: true,
      exportAss: true,
      style,
      document: {
        id: "sub_doc_1",
        sourceAssetId: "knowledge-files/video.mp4",
        language: "es",
        mode: "lines",
        status: "synced",
        durationSeconds: 8,
        style,
        createdAt: "2026-05-02T00:00:00.000Z",
        updatedAt: "2026-05-02T00:00:00.000Z",
        segments: [
          {
            id: "seg_1",
            start: 0,
            end: 2,
            text: "Hola bosque",
            words: [
              { id: "w1", text: "Hola", start: 0, end: 0.6 },
              { id: "w2", text: "bosque", start: 0.7, end: 1.2 },
            ],
          },
        ],
      },
    };

    const result = buildVideoEditorRenderManifest({ ...data, subtitleTracks: [subtitleTrack] }, "editor_1");

    expect(result.ok).toBe(true);
    expect(result.manifest?.subtitleTracks).toHaveLength(1);
    expect(result.manifest?.subtitleTracks?.[0]?.burnIn).toBe(true);
    expect(result.manifest?.subtitleTracks?.[0]?.document?.segments[0]?.text).toBe("Hola bosque");
  });
});
