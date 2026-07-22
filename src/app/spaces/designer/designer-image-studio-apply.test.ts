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
        sourceImageUrl: "old.png",
        mode: "edit",
      },
      { imageUrl: "https://cdn.example/new.png" },
    );

    expect((next[0]!.objects[0] as { src: string }).src).toBe("https://cdn.example/new.png");
    expect((next[1]!.objects[0] as { src: string }).src).toBe("other.png");
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
        sourceImageUrl: "old.png",
        mode: "edit",
      },
      {},
    );
    expect(next).toBe(pages);
  });
});
