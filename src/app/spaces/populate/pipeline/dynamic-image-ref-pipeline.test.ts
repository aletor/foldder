import { describe, expect, it } from "vitest";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import { adaptPopulateBindingsForPipeline } from "../populate-pipeline-prompt-target";
import { analyzePipeline } from "./discover-pipeline";
import { createExecutorRegistry } from "./executor-registry";
import { concatenatorExecutor } from "./executors/concatenator.executor";
import { runPopulatePipeline } from "./populate-pipeline-run";
import type { PipelineEdge } from "./discover-pipeline";
import {
  collectImageRefs,
  type ExecutorNode,
  type NodeExecutor,
} from "./node-executor";

const IMAGE_HANDLES = ["image", "image2", "image3", "image4"];

function makeFaceDataset(): Dataset {
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
        schema: [{ id: "f_foto", key: "foto", label: "Foto", type: "image", required: false }],
        cards: [
          {
            id: "c0",
            values: { f_foto: { type: "image", assetId: "a", url: "https://cdn/faces/alice.png" } },
          },
          {
            id: "c1",
            values: { f_foto: { type: "image", assetId: "b", url: "https://cdn/faces/bob.png" } },
          },
        ],
      },
    ],
  };
}

describe("Populate dynamic image ref per row (pipeline runtime)", () => {
  const nodes: ExecutorNode[] = [
    { id: "pop", type: "populate" },
    { id: "cat", type: "concatenator" },
    { id: "img", type: "nanoBanana" },
    { id: "media", type: "mediaInput", data: { value: "https://cdn/fixed/jersey.png" } },
  ];
  const edges: PipelineEdge[] = [
    { source: "media", target: "img", sourceHandle: "media", targetHandle: "image2" },
    { source: "cat", target: "img", sourceHandle: "prompt", targetHandle: "prompt" },
    { source: "img", target: "pop", sourceHandle: "image", targetHandle: "template" },
  ];

  const fotoBinding = {
    inputId: "image",
    source: "column" as const,
    listId: "l1",
    fieldId: "f_foto",
    fieldKey: "foto",
  };

  const captured: { rowIndex: number; refUrls: string[] }[] = [];

  const stubNanoBanana: NodeExecutor = {
    type: "nanoBanana",
    mode: "input-binding",
    getBindableVariables: () => [],
    async execute({ inputs, ctx }) {
      captured.push({
        rowIndex: ctx.rowIndex,
        refUrls: collectImageRefs(inputs, IMAGE_HANDLES).map((r) => r.url),
      });
      return { kind: "image", url: `https://out/${ctx.rowIndex}.png` };
    },
    estimateCost: () => ({ costUsd: 0.07, label: "Generar imagen" }),
  };

  it("columna Foto pisa la conexión fija en Ref 1 por fila (concatenator upstream)", async () => {
    captured.length = 0;
    const registry = createExecutorRegistry();
    registry.register(concatenatorExecutor).register(stubNanoBanana);

    const analysis = analyzePipeline({
      populateId: "pop",
      nodes,
      edges,
      datasetBoundNodeIds: new Set(["img"]),
    });
    const adapted = adaptPopulateBindingsForPipeline(
      { image: fotoBinding, image2: { inputId: "image2", source: "fixed" } },
      analysis,
      new Map(nodes.map((n) => [n.id, n])),
    );
    expect(adapted["img.image"]).toEqual(fotoBinding);
    expect(adapted["cat.image"]).toBeUndefined();

    const result = await runPopulatePipeline({
      populateId: "pop",
      nodes,
      edges,
      dataset: makeFaceDataset(),
      listId: "l1",
      bindings: adapted,
      promptTemplatesByNodeId: { cat: "retrato con camiseta" },
      registry,
      ownerEmail: "t@t.com",
      resolveFixedExternal: (edge) => {
        if (edge.source === "media") {
          return { kind: "image", url: "https://cdn/fixed/jersey.png" };
        }
        return undefined;
      },
    });

    expect(result.okCount).toBe(2);
    expect(captured).toHaveLength(2);
    expect(captured[0]!.refUrls[0]).toBe("https://cdn/faces/alice.png");
    expect(captured[1]!.refUrls[0]).toBe("https://cdn/faces/bob.png");
    expect(captured[0]!.refUrls).toContain("https://cdn/fixed/jersey.png");
    expect(captured[0]!.refUrls[0]).not.toBe(captured[1]!.refUrls[0]);
  });
});
