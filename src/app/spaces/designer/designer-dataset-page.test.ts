import { describe, expect, it } from "vitest";
import type { FreehandObject } from "../FreehandStudio";
import {
  indexDesignerPageObjectsById,
  patchLiveCanvasFromDatasetPageObjects,
} from "./designer-dataset-page";

function nestedBoundImage(): FreehandObject[] {
  const image = {
    id: "img-nested",
    type: "image",
    src: "https://old/row0.png",
    intrinsicRatio: 1,
    _designerDatasetBinding: {
      source: "list",
      listId: "list1",
      listKey: "poses",
      fieldId: "f1",
      fieldKey: "pose",
      kind: "image",
    },
  } as unknown as FreehandObject;

  const clip = {
    id: "clip1",
    type: "clippingContainer",
    mask: { id: "mask1", type: "rect", width: 100, height: 100 },
    content: [image],
  } as unknown as FreehandObject;

  const folder = {
    id: "folder1",
    type: "groupContainer",
    children: [clip],
  } as unknown as FreehandObject;

  return [folder];
}

describe("designer-dataset-page live canvas patch", () => {
  it("indexDesignerPageObjectsById incluye imagen dentro de carpeta y clip", () => {
    const byId = indexDesignerPageObjectsById(nestedBoundImage());
    expect(byId.has("folder1")).toBe(true);
    expect(byId.has("clip1")).toBe(true);
    expect(byId.has("img-nested")).toBe(true);
  });

  it("patchLiveCanvasFromDatasetPageObjects parchea objetos anidados", () => {
    const live = nestedBoundImage();
    const pageObjects = nestedBoundImage();
    const nested = pageObjects[0]!.type === "groupContainer" ? pageObjects[0]!.children[0]! : null;
    expect(nested?.type).toBe("clippingContainer");
    if (nested?.type === "clippingContainer") {
      nested.content[0] = {
        ...(nested.content[0] as FreehandObject),
        src: "https://new/row1.png",
        intrinsicRatio: 2,
      } as FreehandObject;
    }

    const patches: Array<{ id: string; patch: Record<string, unknown> }> = [];
    patchLiveCanvasFromDatasetPageObjects(
      {
        getObjects: () => live,
        patchObject: (id, patch) => patches.push({ id, patch }),
      },
      pageObjects,
    );

    expect(patches).toEqual([
      {
        id: "img-nested",
        patch: { src: "https://new/row1.png", intrinsicRatio: 2 },
      },
    ]);
  });
});
