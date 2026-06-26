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
