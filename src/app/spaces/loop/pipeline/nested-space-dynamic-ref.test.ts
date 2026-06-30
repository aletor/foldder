import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import { adaptLoopBindingsForPipeline } from "../loop-pipeline-prompt-target";
import { analyzePipeline, type PipelineEdge } from "./discover-pipeline";
import { datasetBoundNodeIdsFromBindings } from "./pipeline-bindings";
import { createExecutorRegistry } from "./executor-registry";
import { concatenatorExecutor } from "./executors/concatenator.executor";
import { runLoopPipeline } from "./loop-pipeline-run";
import { collectImageRefs, type ExecutorNode, type NodeExecutor } from "./node-executor";
import { expandSpacePortalTemplateForPipeline } from "../../space-portal-loop-link";

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
          { id: "c0", values: { f_foto: { type: "image", assetId: "a", url: "https://cdn/faces/alice.png" } } },
          { id: "c1", values: { f_foto: { type: "image", assetId: "b", url: "https://cdn/faces/bob.png" } } },
        ],
      },
    ],
  };
}

/** Subgrafo interno del nested space: media fija + concatenator → image creation (sink). */
function innerSpaceGraph(): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: [
      { id: "media", type: "mediaInput", position: { x: 0, y: 0 }, data: { value: "https://cdn/fixed/jersey.png", type: "image" } },
      { id: "cat", type: "concatenator", position: { x: 0, y: 100 }, data: {} },
      { id: "img", type: "nanoBanana", position: { x: 200, y: 50 }, data: { value: "https://cdn/out/seed.png", type: "image" } },
    ],
    edges: [
      { id: "ie1", source: "media", target: "img", sourceHandle: "media", targetHandle: "image2" },
      { id: "ie2", source: "cat", target: "img", sourceHandle: "prompt", targetHandle: "prompt" },
    ],
  };
}

describe("Loop dynamic image ref crosses nested space boundary", () => {
  const inner = innerSpaceGraph();
  const portal: Node = {
    id: "portal1",
    type: "space",
    position: { x: 400, y: 0 },
    data: {
      spaceId: "space_batch",
      outputType: "media_list",
      hasInput: true,
      hasOutput: true,
      _foldderSpaceInnerNodes: inner.nodes,
      _foldderSpaceInnerEdges: inner.edges,
    },
  };
  const loop: Node = { id: "pop", type: "loop", position: { x: 800, y: 0 }, data: {} };
  const parentEdges: Edge[] = [
    { id: "e_tpl", source: "portal1", target: "pop", sourceHandle: "media_list", targetHandle: "template" },
  ];

  const fotoBinding = {
    inputId: "image",
    source: "column" as const,
    listId: "l1",
    fieldId: "f_foto",
    fieldKey: "foto",
  };

  it("flattens the portal and re-keys the image binding to the inner generator", () => {
    const expanded = expandSpacePortalTemplateForPipeline([portal, loop], parentEdges);

    const innerGenId = expanded.nodes.find((n) => n.type === "nanoBanana")?.id;
    expect(innerGenId).toBeTruthy();

    const executorNodes: ExecutorNode[] = expanded.nodes.map((n) => ({
      id: n.id,
      type: n.type ?? "",
      data: (n.data ?? {}) as Record<string, unknown>,
    }));
    const pipelineEdges = expanded.edges as PipelineEdge[];

    const bindings = { image: fotoBinding };
    const pre = analyzePipeline({
      loopId: "pop",
      nodes: executorNodes,
      edges: pipelineEdges,
      datasetBoundNodeIds: datasetBoundNodeIdsFromBindings(bindings),
    });
    const analysis = analyzePipeline({
      loopId: "pop",
      nodes: executorNodes,
      edges: pipelineEdges,
      datasetBoundNodeIds: datasetBoundNodeIdsFromBindings(bindings, pre.sinkId ?? undefined),
    });

    expect(analysis.order).toContain(innerGenId);

    const adapted = adaptLoopBindingsForPipeline(
      bindings,
      analysis,
      new Map(executorNodes.map((n) => [n.id, n])),
    );
    expect(adapted[`${innerGenId}.image`]).toEqual(fotoBinding);
  });

  it("runtime: each row uses its own column face (not the fixed inner media)", async () => {
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

    const registry = createExecutorRegistry();
    registry.register(concatenatorExecutor).register(stubNanoBanana);

    const expanded = expandSpacePortalTemplateForPipeline([portal, loop], parentEdges);
    const executorNodes: ExecutorNode[] = expanded.nodes.map((n) => ({
      id: n.id,
      type: n.type ?? "",
      data: (n.data ?? {}) as Record<string, unknown>,
    }));
    const pipelineEdges = expanded.edges as PipelineEdge[];

    const bindings = { image: fotoBinding };
    const pre = analyzePipeline({
      loopId: "pop",
      nodes: executorNodes,
      edges: pipelineEdges,
      datasetBoundNodeIds: datasetBoundNodeIdsFromBindings(bindings),
    });
    const analysis = analyzePipeline({
      loopId: "pop",
      nodes: executorNodes,
      edges: pipelineEdges,
      datasetBoundNodeIds: datasetBoundNodeIdsFromBindings(bindings, pre.sinkId ?? undefined),
    });
    const adapted = adaptLoopBindingsForPipeline(
      bindings,
      analysis,
      new Map(executorNodes.map((n) => [n.id, n])),
    );

    const result = await runLoopPipeline({
      loopId: "pop",
      nodes: executorNodes,
      edges: pipelineEdges,
      dataset: makeFaceDataset(),
      listId: "l1",
      bindings: adapted,
      promptTemplatesByNodeId: Object.fromEntries(
        executorNodes.filter((n) => n.type === "concatenator").map((n) => [n.id, "retrato con camiseta"]),
      ),
      registry,
      ownerEmail: "t@t.com",
      resolveFixedExternal: (edge) => {
        if (edge.source.includes("media")) {
          return { kind: "image", url: "https://cdn/fixed/jersey.png" };
        }
        return undefined;
      },
    });

    expect(result.okCount).toBe(2);
    expect(captured).toHaveLength(2);
    expect(captured[0]!.refUrls[0]).toBe("https://cdn/faces/alice.png");
    expect(captured[1]!.refUrls[0]).toBe("https://cdn/faces/bob.png");
    expect(captured[0]!.refUrls[0]).not.toBe(captured[1]!.refUrls[0]);
  });
});
