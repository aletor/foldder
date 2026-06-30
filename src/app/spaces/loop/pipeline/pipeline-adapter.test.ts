import { describe, expect, it } from "vitest";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import { resolveNodeInputsForPipeline } from "./pipeline-adapter";
import type { ExecutorNode } from "./node-executor";
import type { PipelineEdge } from "./discover-pipeline";

function miniDataset(): Dataset {
  return {
    id: "ds1",
    name: "D",
    scope: "local",
    version: 1,
    createdAt: "",
    updatedAt: "",
    constants: { fields: [], values: {} },
    lists: [
      {
        id: "l1",
        name: "L",
        key: "l",
        schema: [{ id: "fp", key: "nombre", label: "Nombre", type: "text", required: false }],
        cards: [{ id: "c0", values: { fp: { type: "text", value: "Ana" } } }],
      },
    ],
  };
}

describe("pipeline-adapter", () => {
  const img: ExecutorNode = { id: "img", type: "nanoBanana", data: { promptText: "fijo" } };
  const desc: ExecutorNode = { id: "desc", type: "mediaDescriber" };
  const edges: PipelineEdge[] = [
    { source: "img", target: "desc", sourceHandle: "image", targetHandle: "media" },
  ];

  it("pasa la imagen del scope upstream al Describer (handle media)", () => {
    const res = resolveNodeInputsForPipeline(
      {
        nodes: [img, desc],
        edges,
        pipelineNodeIds: new Set(["img", "desc"]),
        dataset: miniDataset(),
        listId: "l1",
        sinkNodeId: "desc",
      },
      {
        node: desc,
        rowIndex: 0,
        scope: { img: { kind: "image", url: "https://gen/out.png", s3Key: "k" } },
      },
    );
    expect(res.inputs.byHandle.media).toEqual({
      kind: "image",
      url: "https://gen/out.png",
      s3Key: "k",
    });
  });

  it("aplica plantilla de prompt al concatenator en p0", () => {
    const cat: ExecutorNode = { id: "cat", type: "concatenator" };
    const res = resolveNodeInputsForPipeline(
      {
        nodes: [cat],
        edges: [],
        pipelineNodeIds: new Set(["cat"]),
        dataset: miniDataset(),
        listId: "l1",
        sinkNodeId: null,
        promptTemplatesByNodeId: { cat: "retrato de {nombre}" },
        bindings: {
          "cat.p0": {
            inputId: "p0",
            source: "column",
            listId: "l1",
            fieldId: "fp",
            fieldKey: "nombre",
          },
        },
      },
      { node: cat, rowIndex: 0, scope: {} },
    );
    expect(res.overrides.p0).toBe("retrato de Ana");
  });

  it("aplica override de columna de imagen sobre conexión fija del handle", () => {
    const res = resolveNodeInputsForPipeline(
      {
        nodes: [img],
        edges: [{ source: "media", target: "img", targetHandle: "image" }],
        pipelineNodeIds: new Set(["img"]),
        dataset: {
          ...miniDataset(),
          lists: [
            {
              id: "l1",
              name: "L",
              key: "l",
              schema: [{ id: "ff", key: "foto", label: "Foto", type: "image", required: false }],
              cards: [
                {
                  id: "c0",
                  values: { ff: { type: "image", assetId: "a", url: "https://row0.png" } },
                },
                {
                  id: "c1",
                  values: { ff: { type: "image", assetId: "b", url: "https://row1.png" } },
                },
              ],
            },
          ],
        },
        listId: "l1",
        sinkNodeId: "img",
        bindings: {
          "img.image": {
            inputId: "image",
            source: "column",
            listId: "l1",
            fieldId: "ff",
            fieldKey: "foto",
          },
        },
        resolveFixedExternal: () => ({ kind: "image", url: "https://fixed-base.png" }),
      },
      { node: img, rowIndex: 1, scope: {} },
    );
    expect(res.inputs.byHandle.image).toEqual({ kind: "image", url: "https://row1.png" });
    expect(res.overrides.image).toBe("https://row1.png");
  });

  it("aplica override namespaced de columna al Image Creation", () => {
    const res = resolveNodeInputsForPipeline(
      {
        nodes: [img],
        edges: [],
        pipelineNodeIds: new Set(["img"]),
        dataset: miniDataset(),
        listId: "l1",
        sinkNodeId: "img",
        promptTemplatesByNodeId: { img: "retrato de {nombre}" },
        bindings: {
          "img.prompt": {
            inputId: "prompt",
            source: "column",
            listId: "l1",
            fieldId: "fp",
            fieldKey: "nombre",
          },
        },
      },
      { node: img, rowIndex: 0, scope: {} },
    );
    expect(res.overrides.prompt).toBe("retrato de Ana");
  });
});
