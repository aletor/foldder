import { describe, expect, it } from "vitest";
import {
  defaultDataForCanvasDropNode,
  pickNewNodeTypeForCanvasDrop,
  resolveHandleMetaForCanvasDrop,
} from "./canvas-connect-end-drop";

describe("canvas-connect-end-drop dataset input", () => {
  it("resolves dataset target handle on Designer and Populate", () => {
    expect(resolveHandleMetaForCanvasDrop("designer", "dataset", "target")).toMatchObject({
      type: "dataset",
      id: "dataset",
    });
    expect(resolveHandleMetaForCanvasDrop("populate", "dataset", "target")).toMatchObject({
      type: "dataset",
      id: "dataset",
    });
  });

  it("maps dataset:target to a new dataset node", () => {
    expect(
      pickNewNodeTypeForCanvasDrop("dataset:target", {
        srcNodeType: "designer",
        fromHandleId: "dataset",
        fromFlow: "target",
      }),
    ).toBe("dataset");
    expect(
      pickNewNodeTypeForCanvasDrop("dataset:target", {
        srcNodeType: "populate",
        fromHandleId: "dataset",
        fromFlow: "target",
      }),
    ).toBe("dataset");
  });

  it("seeds dataset nodes with the chooser open", () => {
    expect(defaultDataForCanvasDropNode("dataset")).toMatchObject({
      label: "Dataset",
      _datasetShowChooser: true,
    });
  });

  it("seeds lightroom nodes with idle decode state", () => {
    expect(defaultDataForCanvasDropNode("lightroom")).toMatchObject({
      label: "Lightroom",
      developSettings: {},
      decodeStatus: "idle",
    });
  });
});
