import { describe, expect, it } from "vitest";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import { createExecutorRegistry } from "./executor-registry";
import { runLoopPipeline } from "./loop-pipeline-run";
import type { PipelineEdge } from "./discover-pipeline";
import {
  firstPortOfKind,
  type ExecutorNode,
  type NodeExecutor,
} from "./node-executor";

/** Stubs de generación/describe para validar el encadenamiento del scope sin red. */
const stubNanoBanana: NodeExecutor = {
  type: "nanoBanana",
  mode: "input-binding",
  getBindableVariables: () => [],
  async execute({ overrides }) {
    const prompt = String(overrides.prompt ?? "");
    return { kind: "image", url: `https://img/${encodeURIComponent(prompt)}.png` };
  },
  estimateCost: () => ({ costUsd: 0.07, label: "Generar imagen" }),
};

const stubMediaDescriber: NodeExecutor = {
  type: "mediaDescriber",
  mode: "input-binding",
  getBindableVariables: () => [],
  async execute({ inputs }) {
    const img = firstPortOfKind(inputs, "image");
    if (!img || img.kind !== "image") throw new Error("sin imagen upstream");
    return { kind: "text", text: `descripcion de ${img.url}` };
  },
  estimateCost: () => ({ costUsd: 0.01, label: "Describir imagen" }),
};

function makeDataset(): Dataset {
  return {
    id: "ds1",
    name: "Cast",
    scope: "local",
    version: 1,
    createdAt: "",
    updatedAt: "",
    constants: { fields: [], values: {} },
    lists: [
      {
        id: "l1",
        name: "Filas",
        key: "filas",
        schema: [
          { id: "f_n", key: "nombre", label: "Nombre", type: "text", required: false },
        ],
        cards: [
          { id: "c0", values: { f_n: { type: "text", value: "Luna" } } },
          { id: "c1", values: { f_n: { type: "text", value: "Sol" } } },
        ],
      },
    ],
  };
}

describe("PoC: Image Creation → Image Describer → Loop", () => {
  const nodes: ExecutorNode[] = [
    { id: "pop", type: "loop" },
    { id: "ds", type: "dataset" },
    {
      id: "img",
      type: "nanoBanana",
      data: { modelKey: "flash31", aspect_ratio: "16:9", resolution: "2k" },
    },
    { id: "desc", type: "mediaDescriber" },
  ];

  const edges: PipelineEdge[] = [
    { source: "ds", target: "pop", targetHandle: "dataset" },
    { source: "img", target: "desc", sourceHandle: "image", targetHandle: "media" },
    { source: "desc", target: "pop", sourceHandle: "prompt", targetHandle: "template" },
  ];

  it("descubre la tubería, encadena scope img→desc y devuelve texto en el sink", async () => {
    const registry = createExecutorRegistry();
    registry.register(stubNanoBanana).register(stubMediaDescriber);

    const result = await runLoopPipeline({
      loopId: "pop",
      nodes,
      edges,
      dataset: makeDataset(),
      listId: "l1",
      bindings: {
        "img.prompt": {
          inputId: "prompt",
          source: "column",
          listId: "l1",
          fieldId: "f_n",
          fieldKey: "nombre",
        },
      },
      promptTemplatesByNodeId: { img: "foto de {nombre}" },
      registry,
      ownerEmail: "test@foldder.com",
    });

    expect(result.analysis.validation.ok).toBe(true);
    expect(result.analysis.sinkId).toBe("desc");
    expect(new Set(result.analysis.pipelineNodeIds)).toEqual(new Set(["img", "desc"]));
    expect(result.analysis.iterated).toEqual(new Set(["img", "desc"]));
    expect(result.analysis.order).toEqual(["img", "desc"]);
    expect(result.okCount).toBe(2);
    expect(result.failedCount).toBe(0);

    const row0 = result.rows[0]!;
    expect(row0.final?.kind).toBe("text");
    expect(row0.final?.text).toContain("descripcion de");
    expect(row0.final?.text).toContain("foto%20de%20Luna");
    expect(row0.intermediates.img?.kind).toBe("image");

    expect(result.cost.totalUsd).toBeCloseTo(0.16, 2); // (0.07+0.01)×2
    expect(result.cost.missingExecutorTypes).toEqual([]);
  });
});
