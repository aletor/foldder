import { describe, expect, it } from "vitest";
import { createExecutorRegistry } from "./executor-registry";
import { runLoopPipeline } from "./loop-pipeline-run";
import type { PipelineEdge } from "./discover-pipeline";
import { concatenatorExecutor } from "./executors/concatenator.executor";
import type { ExecutorNode, NodeExecutor } from "./node-executor";
import { createResolveFixedExternal } from "../loop-pipeline-integration";

const stubNanoBanana: NodeExecutor = {
  type: "nanoBanana",
  mode: "input-binding",
  getBindableVariables: () => [],
  async execute({ inputs, overrides }) {
    const prompt = String(overrides.prompt ?? inputs.byHandle.prompt?.kind === "text" ? inputs.byHandle.prompt.text : "");
    return { kind: "image", url: `https://img/${encodeURIComponent(prompt)}.png` };
  },
  estimateCost: () => ({ costUsd: 0.07, label: "Generar imagen" }),
};

describe("Concatenator → Image Creation → Loop", () => {
  const nodes: ExecutorNode[] = [
    { id: "pop", type: "loop" },
    { id: "cat", type: "concatenator" },
    { id: "img", type: "nanoBanana" },
  ];
  const edges: PipelineEdge[] = [
    { source: "cat", target: "img", sourceHandle: "prompt", targetHandle: "prompt" },
    { source: "img", target: "pop", sourceHandle: "image", targetHandle: "template" },
  ];

  it("inyecta templatePrompt en concatenator y encadena al generador", async () => {
    const registry = createExecutorRegistry();
    registry.register(concatenatorExecutor).register(stubNanoBanana);

    const result = await runLoopPipeline({
      loopId: "pop",
      nodes,
      edges,
      dataset: {
        id: "ds",
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
            schema: [],
            cards: [{ id: "c0", values: {} }],
          },
        ],
      },
      listId: "l1",
      promptTemplatesByNodeId: { cat: "foto de jugador" },
      registry,
      ownerEmail: "t@t.com",
    });

    expect(result.okCount).toBe(1);
    expect(result.rows[0]?.final?.url).toContain("foto%20de%20jugador");
  });

  it("combina prompts externos conectados a p0/p1 del concatenator", async () => {
    const nodes = [
      { id: "pop", type: "loop" },
      { id: "cat", type: "concatenator" },
      { id: "img", type: "nanoBanana" },
      { id: "pA", type: "promptInput", data: { value: "retrato" } },
      { id: "pB", type: "promptInput", data: { value: "estudio" } },
    ] as ExecutorNode[];
    const edges: PipelineEdge[] = [
      { source: "pA", target: "cat", sourceHandle: "prompt", targetHandle: "p0" },
      { source: "pB", target: "cat", sourceHandle: "prompt", targetHandle: "p1" },
      { source: "cat", target: "img", sourceHandle: "prompt", targetHandle: "prompt" },
      { source: "img", target: "pop", sourceHandle: "image", targetHandle: "template" },
    ];

    const registry = createExecutorRegistry();
    registry.register(concatenatorExecutor).register(stubNanoBanana);

    const result = await runLoopPipeline({
      loopId: "pop",
      nodes,
      edges,
      dataset: {
        id: "ds",
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
            schema: [],
            cards: [{ id: "c0", values: {} }],
          },
        ],
      },
      listId: "l1",
      registry,
      ownerEmail: "t@t.com",
      resolveFixedExternal: createResolveFixedExternal(nodes, edges),
    });

    expect(result.okCount).toBe(1);
    expect(result.rows[0]?.final?.url).toContain("retrato%20estudio");
  });
});
