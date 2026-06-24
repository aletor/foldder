import { describe, expect, it } from "vitest";

import { buildVideoEditorClipsFromMediaList, isMediaListItemDownloadable, mergeMediaListOutputs } from "./media-list-consumers";
import type { MediaListOutput } from "./media-list-output";

function output(items: MediaListOutput["items"]): MediaListOutput {
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

describe("media_list consumers", () => {
  it("does not treat placeholders as downloadable assets", () => {
    expect(isMediaListItemDownloadable({
      id: "placeholder",
      order: 1,
      title: "Pendiente",
      mediaType: "placeholder",
      role: "storyboard_placeholder",
      status: "pending",
    })).toBe(false);
    expect(isMediaListItemDownloadable({
      id: "image",
      order: 2,
      title: "Frame",
      mediaType: "image",
      role: "storyboard_frame",
      status: "generated",
      assetId: "asset://frame",
    })).toBe(true);
  });

  it("builds ordered still clips from image media_list items", () => {
    const clips = buildVideoEditorClipsFromMediaList(output([
      { id: "scene_2", order: 20, title: "Bosque", mediaType: "image", role: "storyboard_frame", status: "generated", assetId: "asset://2", sceneId: "s2", sceneOrder: 2, durationSeconds: 7 },
      { id: "scene_1", order: 10, title: "Casa", mediaType: "image", role: "storyboard_frame", status: "generated", assetId: "asset://1", sceneId: "s1", sceneOrder: 1, durationSeconds: 5 },
    ]));

    expect(clips.map((clip) => clip.title)).toEqual(["Casa", "Bosque"]);
    expect(clips[0]?.startTime).toBe(0);
    expect(clips[1]?.startTime).toBe(5);
    expect(clips[1]?.durationSeconds).toBe(7);
  });

  it("prioritizes scene videos over frames for the same scene", () => {
    const clips = buildVideoEditorClipsFromMediaList(output([
      { id: "frame_1", order: 10, title: "Frame escena", mediaType: "image", role: "storyboard_frame", status: "generated", assetId: "asset://frame", sceneId: "scene_1", sceneOrder: 1, durationSeconds: 4 },
      { id: "video_1", order: 11, title: "Vídeo escena", mediaType: "video", role: "scene_video", status: "generated", assetId: "asset://video", sceneId: "scene_1", sceneOrder: 1, durationSeconds: 8 },
    ]));

    expect(clips).toHaveLength(1);
    expect(clips[0]?.mediaType).toBe("video");
    expect(clips[0]?.assetId).toBe("asset://video");
  });

  it("merges multiple media_list outputs preserving unique item ids", () => {
    const merged = mergeMediaListOutputs([
      output([
        { id: "a1", order: 0, title: "A", mediaType: "image", role: "designer_page", status: "generated", assetId: "asset://a" },
      ]),
      output([
        { id: "b1", order: 0, title: "B", mediaType: "image", role: "designer_page", status: "generated", assetId: "asset://b" },
      ]),
    ]);
    expect(merged?.items).toHaveLength(2);
    expect(merged?.items.map((item) => item.id)).toEqual(["a1", "b1"]);
    expect((merged?.metadata as { mergedSourceCount?: number }).mergedSourceCount).toBe(2);
  });

  it("dedupes colliding item ids when merging lists from different sources", () => {
    const merged = mergeMediaListOutputs([
      output([{ id: "same", order: 0, title: "A", mediaType: "image", role: "x", status: "generated", assetId: "a" }]),
      output([{ id: "same", order: 0, title: "B", mediaType: "image", role: "x", status: "generated", assetId: "b" }]),
    ]);
    expect(merged?.items).toHaveLength(2);
    expect(new Set(merged?.items.map((item) => item.id)).size).toBe(2);
  });
});
