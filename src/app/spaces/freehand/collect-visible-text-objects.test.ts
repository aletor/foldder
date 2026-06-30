import { describe, expect, it } from "vitest";
import { collectVisibleTextObjectsDeep } from "@/app/spaces/FreehandStudio";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";

function text(id: string, visible = true): FreehandObject {
  return { id, type: "text", visible, text: "Hola" } as unknown as FreehandObject;
}

describe("collectVisibleTextObjectsDeep", () => {
  it("incluye textos anidados dentro de un clip", () => {
    const clip = {
      id: "clip1",
      type: "clippingContainer",
      mask: { id: "m1", type: "rect", x: 0, y: 0, width: 10, height: 10 },
      content: [text("inner")],
    } as unknown as FreehandObject;
    const ids = collectVisibleTextObjectsDeep([text("top"), clip]).map((t) => t.id);
    expect(ids).toEqual(["top", "inner"]);
  });

  it("ignora textos ocultos y máscaras de clip", () => {
    const clip = {
      id: "clip1",
      type: "clippingContainer",
      mask: { id: "m1", type: "text", visible: true, isClipMask: true, text: "mask" },
      content: [text("inner", false)],
    } as unknown as FreehandObject;
    expect(collectVisibleTextObjectsDeep([clip])).toHaveLength(0);
  });
});
