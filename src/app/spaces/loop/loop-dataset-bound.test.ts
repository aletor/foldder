import { describe, expect, it } from "vitest";
import {
  computeDatasetBoundNodeIds,
  estimateExpectedImageGenerations,
  listColumnTokensInPrompt,
  loopWillIteratePerRow,
  promptDependsOnListColumns,
} from "./loop-dataset-bound";
import type { LoopInputBinding } from "./loop-types";

describe("loop-dataset-bound", () => {
  it("promptDependsOnListColumns: tokens de listado sin manual", () => {
    expect(promptDependsOnListColumns("foto de {texto}", ["texto"])).toBe(true);
    expect(promptDependsOnListColumns("foto fija", ["texto"])).toBe(false);
    expect(promptDependsOnListColumns("{marca}", ["texto"], undefined)).toBe(false);
  });

  it("promptDependsOnListColumns: manual cubre el token → no itera", () => {
    expect(
      promptDependsOnListColumns("foto de {texto}", ["texto"], { texto: "hola" }),
    ).toBe(false);
    expect(
      promptDependsOnListColumns("foto de {texto}", ["texto"], { texto: "  " }),
    ).toBe(true);
  });

  it("listColumnTokensInPrompt ignora constantes y manuales", () => {
    expect(listColumnTokensInPrompt("{texto} y {marca}", ["texto"])).toEqual(["texto"]);
    expect(
      listColumnTokensInPrompt("{texto}", ["texto"], { texto: "fijo" }),
    ).toEqual([]);
  });

  it("computeDatasetBoundNodeIds une bindings + prompt target", () => {
    const bindings: Record<string, LoopInputBinding> = {
      "img.image": {
        inputId: "image",
        source: "column",
        listId: "l1",
        fieldId: "f_img",
      },
    };
    const withBindingOnly = computeDatasetBoundNodeIds({
      bindings,
      listFieldKeys: ["texto"],
      templatePrompt: "fijo",
      promptTargetNodeId: "img",
    });
    expect(withBindingOnly).toEqual(new Set(["img"]));

    const tokenOnly = computeDatasetBoundNodeIds({
      bindings: {},
      listFieldKeys: ["texto"],
      templatePrompt: "genera {texto}",
      promptTargetNodeId: "img",
    });
    expect(tokenOnly).toEqual(new Set(["img"]));
  });

  it("computeDatasetBoundNodeIds: promptTemplatesByNodeId marca nodos", () => {
    const ids = computeDatasetBoundNodeIds({
      bindings: {},
      listFieldKeys: ["nombre"],
      promptTemplatesByNodeId: {
        genA: "retrato de {nombre}",
        genB: "logo fijo",
      },
    });
    expect(ids).toEqual(new Set(["genA"]));
  });

  it("loopWillIteratePerRow y estimateExpectedImageGenerations", () => {
    expect(
      loopWillIteratePerRow({
        promptText: "{texto}",
        bindings: {},
        listFieldKeys: ["texto"],
      }),
    ).toBe(true);
    expect(
      loopWillIteratePerRow({
        promptText: "hola",
        bindings: {},
        listFieldKeys: ["texto"],
      }),
    ).toBe(false);
    expect(
      estimateExpectedImageGenerations({ rowCount: 5, willIterate: true, hasTemplate: true }),
    ).toBe(5);
    expect(
      estimateExpectedImageGenerations({ rowCount: 5, willIterate: false, hasTemplate: true }),
    ).toBe(1);
    expect(
      estimateExpectedImageGenerations({ rowCount: 5, willIterate: true, hasTemplate: false }),
    ).toBe(0);
  });
});
