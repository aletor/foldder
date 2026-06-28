import { describe, expect, it } from "vitest";
import { createExecutorRegistry } from "./executor-registry";
import { runPopulatePipeline } from "./populate-pipeline-run";
import type { PipelineEdge } from "./discover-pipeline";
import { concatenatorExecutor } from "./executors/concatenator.executor";
import type { ExecutorNode, NodeExecutor } from "./node-executor";

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

describe("Concatenator → Image Creation → Populate", () => {
  const nodes: ExecutorNode[] = [
    { id: "pop", type: "populate" },
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

    const result = await runPopulatePipeline({
      populateId: "pop",
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
});
