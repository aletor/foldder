import { describe, expect, it } from "vitest";
import { applyDesignerImageStudioResult } from "./designer-image-studio-apply";
import type { DesignerPageState } from "./DesignerNode";

describe("applyDesignerImageStudioResult", () => {
  it("actualiza el src de la capa imagen en la página correcta", () => {
    const pages = [
      {
        id: "p1",
        format: "custom",
        objects: [
          { id: "img1", type: "image", src: "old.png", x: 0, y: 0, w: 100, h: 100 },
        ],
      },
      {
        id: "p2",
        format: "custom",
        objects: [
          { id: "img2", type: "image", src: "other.png", x: 0, y: 0, w: 50, h: 50 },
        ],
      },
    ] as unknown as DesignerPageState[];

    const next = applyDesignerImageStudioResult(
      pages,
      {
        designerNodeId: "d1",
        nanoNodeId: "n1",
        pageId: "p1",
        imageObjectId: "img1",
        targetKind: "image",
        sourceImageUrl: "old.png",
        mode: "edit",
      },
      { imageUrl: "https://cdn.example/new.png" },
    );

    expect((next[0]!.objects[0] as { src: string }).src).toBe("https://cdn.example/new.png");
    expect((next[1]!.objects[0] as { src: string }).src).toBe("other.png");
  });

  it("rellena imageFrameContent en un marco", () => {
    const pages = [
      {
        id: "p1",
        format: "custom",
        objects: [
          {
            id: "frame1",
            type: "rect",
            isImageFrame: true,
            x: 0,
            y: 0,
            width: 200,
            height: 100,
            imageFrameContent: null,
          },
        ],
      },
    ] as unknown as DesignerPageState[];

    const next = applyDesignerImageStudioResult(
      pages,
      {
        designerNodeId: "d1",
        nanoNodeId: "n1",
        pageId: "p1",
        imageObjectId: "frame1",
        targetKind: "imageFrame",
        sourceImageUrl: "data:image/png;base64,black",
        seedIsPlaceholder: true,
        mode: "edit",
      },
      { imageUrl: "https://cdn.example/gen.png", s3Key: "opt/gen.png" },
    );

    const frame = next[0]!.objects[0] as {
      imageFrameContent?: { src: string; s3Key?: string; generatedByAi?: boolean };
    };
    expect(frame.imageFrameContent?.src).toBe("https://cdn.example/gen.png");
    expect(frame.imageFrameContent?.s3Key).toBe("opt/gen.png");
    expect(frame.imageFrameContent?.generatedByAi).toBe(true);
  });

  it("no cambia nada si no hay imageUrl", () => {
    const pages = [
      {
        id: "p1",
        format: "custom",
        objects: [{ id: "img1", type: "image", src: "old.png", x: 0, y: 0, w: 10, h: 10 }],
      },
    ] as unknown as DesignerPageState[];
    const next = applyDesignerImageStudioResult(
      pages,
      {
        designerNodeId: "d1",
        nanoNodeId: "n1",
        pageId: "p1",
        imageObjectId: "img1",
        targetKind: "image",
        sourceImageUrl: "old.png",
        mode: "edit",
      },
      {},
    );
    expect(next).toBe(pages);
  });
});
