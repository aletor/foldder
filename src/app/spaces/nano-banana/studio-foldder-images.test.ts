import { describe, expect, it } from "vitest";
import type { Node } from "@xyflow/react";
import { listStudioFoldderImages, planStudioIncomingUrls, STUDIO_SCENE_DEST } from "./studio-foldder-images";

describe("listStudioFoldderImages", () => {
  it("returns image media from the project graph and skips video", () => {
    const nodes = [
      {
        id: "in1",
        type: "mediaInput",
        position: { x: 0, y: 0 },
        data: { value: "https://cdn.example/photo.jpg", type: "image" },
      },
      {
        id: "vid1",
        type: "geminiVideo",
        position: { x: 0, y: 0 },
        data: { value: "https://cdn.example/clip.mp4" },
      },
    ] as Node[];
    const items = listStudioFoldderImages({ nodes });
    expect(items.some((item) => item.url.includes("photo.jpg"))).toBe(true);
    expect(items.some((item) => item.url.includes("clip.mp4"))).toBe(false);
  });

  it("puts the first empty-canvas image on the scene and extras on a refs card", () => {
    expect(
      planStudioIncomingUrls({
        urls: ["https://cdn.example/a.jpg", "https://cdn.example/b.jpg"],
        dest: STUDIO_SCENE_DEST,
        hasScene: false,
        maxRefs: 4,
      }),
    ).toEqual({
      sessionImage: "https://cdn.example/a.jpg",
      extraCard: { references: ["https://cdn.example/b.jpg"] },
    });
  });

  it("attaches to an existing local-change card without replacing the scene", () => {
    expect(
      planStudioIncomingUrls({
        urls: ["https://cdn.example/ref.jpg"],
        dest: "card_1",
        hasScene: true,
        maxRefs: 4,
      }),
    ).toEqual({
      cardUpdate: { cardId: "card_1", add: ["https://cdn.example/ref.jpg"] },
    });
  });
});
