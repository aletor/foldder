import { describe, expect, it } from "vitest";
import {
  columnOverrideForRow,
  datasetBoundNodeIdsFromBindings,
  isValidPopulateSinkEdge,
  namespacedBindingKey,
  parseNamespacedBindingKey,
  primarySinkSourceHandle,
} from "./pipeline-bindings";
import type { PopulateInputBinding } from "../populate-types";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";

const emptyDataset: Dataset = {
  id: "d",
  name: "D",
  scope: "local",
  lists: [{ id: "l1", name: "L", key: "l", schema: [], cards: [] }],
  constants: { fields: [], values: {} },
  createdAt: "",
  updatedAt: "",
  version: 1,
};

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

  it("manual: no cuenta como nodo bound al Dataset (no itera)", () => {
    const bindings: Record<string, PopulateInputBinding> = {
      "img1.prompt": { inputId: "prompt", source: "manual", manualValue: "equipo X" },
    };
    expect(datasetBoundNodeIdsFromBindings(bindings)).toEqual(new Set());
  });

  it("columnOverrideForRow: manual texto devuelve valor constante", () => {
    const binding: PopulateInputBinding = { inputId: "prompt", source: "manual", manualValue: "  hola  " };
    const out = columnOverrideForRow({ binding, dataset: emptyDataset, listId: "l1", rowIndex: 3, inputKind: "text" });
    expect(out).toEqual({ kind: "text", text: "hola" });
  });

  it("columnOverrideForRow: manual imagen usa la URL tecleada", () => {
    const binding: PopulateInputBinding = { inputId: "image", source: "manual", manualValue: "https://x/y.png" };
    const out = columnOverrideForRow({ binding, dataset: emptyDataset, listId: "l1", rowIndex: 0, inputKind: "image" });
    expect(out).toEqual({ kind: "image", url: "https://x/y.png" });
  });

  it("columnOverrideForRow: manual vacío no aporta valor", () => {
    const binding: PopulateInputBinding = { inputId: "prompt", source: "manual", manualValue: "   " };
    expect(columnOverrideForRow({ binding, dataset: emptyDataset, listId: "l1", rowIndex: 0, inputKind: "text" })).toBeUndefined();
  });

  it("columnOverrideForRow: tokens manuales se sustituyen en el prompt (constante por fila)", () => {
    const binding: PopulateInputBinding = { inputId: "prompt", source: "column", listId: "l1", fieldId: "f1" };
    const out = columnOverrideForRow({
      binding,
      dataset: emptyDataset,
      listId: "l1",
      rowIndex: 0,
      promptTemplate: "logo de {equipo}",
      manualTokenValues: { equipo: "Halcones" },
      inputKind: "text",
    });
    expect(out).toEqual({ kind: "text", text: "logo de Halcones" });
  });

  it("columnOverrideForRow: texto fijo sin binding usa promptTemplate", () => {
    const out = columnOverrideForRow({
      binding: undefined,
      dataset: emptyDataset,
      listId: "l1",
      rowIndex: 0,
      promptTemplate: "foto de jugador de voleibol",
      inputKind: "text",
    });
    expect(out).toEqual({ kind: "text", text: "foto de jugador de voleibol" });
  });
});
