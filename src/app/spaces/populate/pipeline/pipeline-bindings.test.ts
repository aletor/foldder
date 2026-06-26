import { describe, expect, it } from "vitest";
import {
  datasetBoundNodeIdsFromBindings,
  isValidPopulateSinkEdge,
  namespacedBindingKey,
  parseNamespacedBindingKey,
  primarySinkSourceHandle,
} from "./pipeline-bindings";
import type { PopulateInputBinding } from "../populate-types";

describe("pipeline-bindings — sink y namespace", () => {
  it("primarySinkSourceHandle por tipo", () => {
    expect(primarySinkSourceHandle("nanoBanana")).toBe("image");
    expect(primarySinkSourceHandle("mediaDescriber")).toBe("prompt");
    expect(primarySinkSourceHandle("layerizer")).toBe("layout");
    expect(primarySinkSourceHandle("backgroundRemover")).toBe("rgba");
    expect(primarySinkSourceHandle("designer")).toBe("document");
  });

  it("Background Remover puede ser sink (rgba → populate.template)", () => {
    expect(
      isValidPopulateSinkEdge({
        sourceNodeType: "backgroundRemover",
        sourceHandle: "rgba",
        isPipelineExecutable: (t) => t === "backgroundRemover",
      }),
    ).toBe(true);
    expect(
      isValidPopulateSinkEdge({
        sourceNodeType: "backgroundRemover",
        sourceHandle: "rgba",
        isPipelineExecutable: () => false,
      }),
    ).toBe(false);
  });

  it("Layerizer puede ser sink si tiene executor (layout → populate.template)", () => {
    expect(
      isValidPopulateSinkEdge({
        sourceNodeType: "layerizer",
        sourceHandle: "layout",
        isPipelineExecutable: (t) => t === "layerizer",
      }),
    ).toBe(true);
  });

  it("namespaced binding keys", () => {
    expect(namespacedBindingKey("img1", "prompt")).toBe("img1.prompt");
    expect(parseNamespacedBindingKey("img1.prompt")).toEqual({
      nodeId: "img1",
      inputKey: "prompt",
    });
    expect(parseNamespacedBindingKey("prompt")).toEqual({ inputKey: "prompt" });
  });

  it("datasetBoundNodeIds: namespaced y legacy (sink)", () => {
    const bindings: Record<string, PopulateInputBinding> = {
      "img1.prompt": { inputId: "prompt", source: "column", listId: "l1", fieldId: "f1" },
      image: { inputId: "image", source: "column", listId: "l1", fieldId: "f2" },
    };
    expect(datasetBoundNodeIdsFromBindings(bindings)).toEqual(new Set(["img1"]));
    expect(datasetBoundNodeIdsFromBindings(bindings, "img0")).toEqual(
      new Set(["img1", "img0"]),
    );
  });
});
