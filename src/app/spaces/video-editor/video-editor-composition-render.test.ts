import { describe, expect, it } from "vitest";

import { buildVideoEditorRenderManifest } from "./video-editor-engine";
import { createEmptyVideoEditorData } from "./video-editor-types";
import { createTextOverlayObject } from "./video-editor-composition-engine";
import {
  buildCompositionFfmpegFilter,
  buildOverlayFiltersAtTime,
  mergeCompositionCutPoints,
} from "./video-editor-composition-render";
import { DEFAULT_COMPOSITION_TRANSFORM } from "./video-editor-composition-types";

describe("video-editor-composition-render", () => {
  it("builds default fill ffmpeg filter", () => {
    const filter = buildCompositionFfmpegFilter(1920, 1080, DEFAULT_COMPOSITION_TRANSFORM, "fill");
    expect(filter).toContain("scale=1920:1080");
    expect(filter).toContain("crop=1920:1080");
  });

  it("builds positioned transform filter with pad", () => {
    const filter = buildCompositionFfmpegFilter(1920, 1080, {
      ...DEFAULT_COMPOSITION_TRANSFORM,
      x: 0.1,
      y: 0.2,
      width: 0.5,
      height: 0.5,
    }, "fill");
    expect(filter).toContain("pad=1920:1080:192:216:black");
  });

  it("merges composition keyframe cut points", () => {
    const points = mergeCompositionCutPoints(5, 10, {
      keyframes: [
        { id: "a", time: 0, transform: DEFAULT_COMPOSITION_TRANSFORM, easing: "linear" },
        { id: "b", time: 3, transform: DEFAULT_COMPOSITION_TRANSFORM, easing: "linear" },
        { id: "c", time: 8, transform: DEFAULT_COMPOSITION_TRANSFORM, easing: "linear" },
      ],
    });
    expect(points).toEqual([5, 8, 13, 15]);
  });

  it("builds overlay draw filters at time", () => {
    const text = createTextOverlayObject(1920, 1080);
    const filter = buildOverlayFiltersAtTime(
      [{
        id: "o1",
        startTime: 0,
        durationSeconds: 5,
        title: "Texto",
        object: text,
        composition: { keyframes: [{ id: "k", time: 0, transform: DEFAULT_COMPOSITION_TRANSFORM, easing: "linear" }] },
      }],
      1,
      1920,
      1080,
    );
    expect(filter).toContain("drawtext=");
  });

  it("includes overlay clips in render manifest", () => {
    const data = createEmptyVideoEditorData();
    data.tracks.video = [{
      id: "clip_1",
      assetId: "asset://video",
      mediaType: "video",
      track: "video",
      title: "Clip",
      startTime: 0,
      durationSeconds: 5,
      sourceDurationSeconds: 5,
    }];
    data.overlayClips = [{
      id: "overlay_1",
      startTime: 0,
      durationSeconds: 5,
      title: "Título",
      object: createTextOverlayObject(1920, 1080),
      composition: { keyframes: [{ id: "k", time: 0, transform: DEFAULT_COMPOSITION_TRANSFORM, easing: "linear" }] },
    }];
    const result = buildVideoEditorRenderManifest(data, "editor_1");
    expect(result.ok).toBe(true);
    expect(result.manifest?.overlayClips).toHaveLength(1);
    expect(result.manifest?.tracks.video?.[0]?.composition).toBeDefined();
    expect(result.manifest?.tracks.video?.[0]?.compositionCropPreset).toBe("fill");
  });

  it("persists composition crop preset on clip", () => {
    const data = createEmptyVideoEditorData();
    data.tracks.video = [{
      id: "clip_1",
      assetId: "asset://video",
      mediaType: "video",
      track: "video",
      title: "Clip",
      startTime: 0,
      durationSeconds: 5,
      sourceDurationSeconds: 5,
      compositionCropPreset: "fit",
    }];
    const result = buildVideoEditorRenderManifest(data, "editor_1");
    expect(result.manifest?.tracks.video?.[0]?.compositionCropPreset).toBe("fit");
  });
});
