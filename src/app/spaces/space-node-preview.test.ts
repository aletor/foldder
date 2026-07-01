import { describe, expect, it } from "vitest";
import { collectSpaceMediaPreviewItems } from "./space-node-preview";

describe("collectSpaceMediaPreviewItems", () => {
  it("extrae items de media_list", () => {
    const items = collectSpaceMediaPreviewItems({
      outputType: "media_list",
      mediaListOutput: {
        kind: "media_list",
        sourceNodeId: "s1",
        sourceNodeType: "space",
        title: "Space",
        status: "frames_ready",
        items: [
          { id: "a", order: 0, title: "A", mediaType: "image", url: "https://x/a.png", status: "generated" },
          { id: "b", order: 1, title: "B", mediaType: "video", url: "https://x/b.mp4", status: "generated" },
        ],
        metadata: { cineNodeId: "s1" },
      },
    });
    expect(items).toHaveLength(2);
    expect(items[0]?.mediaType).toBe("image");
    expect(items[1]?.mediaType).toBe("video");
  });

  it("devuelve escalar image/video", () => {
    expect(
      collectSpaceMediaPreviewItems({ outputType: "image", value: "https://x/a.png" }),
    ).toEqual([{ id: "space-scalar-image", url: "https://x/a.png", mediaType: "image" }]);
    expect(
      collectSpaceMediaPreviewItems({ outputType: "video", value: "https://x/b.mp4" }),
    ).toEqual([{ id: "space-scalar-video", url: "https://x/b.mp4", mediaType: "video" }]);
  });
});
