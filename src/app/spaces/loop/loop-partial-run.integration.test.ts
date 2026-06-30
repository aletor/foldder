import { describe, expect, it, vi } from "vitest";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import { createExecutorRegistry } from "./pipeline/executor-registry";
import { runPipeline } from "./pipeline/run-pipeline";
import type { ExecutorNode, NodeExecutor, NodeOutput } from "./pipeline/node-executor";
import { finalizeLoopBatchRun } from "./loop-batch-finalize";
import { executorNodeMap } from "./pipeline/pipeline-adapter";

function imageGenExecutor(): NodeExecutor {
  return {
    type: "nanoBanana",
    mode: "input-binding",
    getBindableVariables: () => [],
    execute: async ({ ctx }) => {
      if (ctx.rowIndex === 1) throw new Error("Fallo forzado en fila 2");
      return {
        kind: "image",
        url: `https://example.com/row-${ctx.rowIndex + 1}.png`,
        s3Key: `knowledge-files/test/row-${ctx.rowIndex + 1}.png`,
      } satisfies NodeOutput;
    },
    estimateCost: () => ({ costUsd: 0.01, label: "test" }),
  };
}

function minimalDataset(): Dataset {
  return {
    id: "ds_test",
    name: "Test",
    scope: "local",
    lists: [
      {
        id: "list1",
        name: "Principal",
        key: "principal",
        schema: [
          { id: "f1", key: "nombre", label: "Nombre", type: "text", required: false },
        ],
        cards: [
          { id: "c0", values: { f1: { type: "text", value: "A" } } },
          { id: "c1", values: { f1: { type: "text", value: "B" } } },
          { id: "c2", values: { f1: { type: "text", value: "C" } } },
        ],
      },
    ],
    constants: { fields: [], values: {} },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
  };
}

describe("loop partial run (3 filas, fallo en fila 2)", () => {
  it("conserva 2 resultados y registra el fallo en fila 2", async () => {
    const nodes: ExecutorNode[] = [{ id: "nano1", type: "nanoBanana", data: {} }];
    const registry = createExecutorRegistry();
    registry.register(imageGenExecutor());
    const nodeById = executorNodeMap(nodes);

    const pipeline = await runPipeline(
      {
        registry,
        nodeById,
        buildInputs: () => ({ inputs: { byHandle: {} }, overrides: {} }),
        ctxBase: { ownerEmail: "test@test.com" },
      },
      {
        order: ["nano1"],
        iterated: new Set(["nano1"]),
        constant: new Set(),
        sinkId: "nano1",
        rowCount: 3,
      },
    );

    expect(pipeline.okCount).toBe(2);
    expect(pipeline.failedCount).toBe(1);
    expect(pipeline.rows[1]?.error).toMatch(/Fallo forzado en fila 2/);

    const dataset = minimalDataset();
    const commits: unknown[] = [];
    const result = await finalizeLoopBatchRun({
      loopId: "pop_test",
      label: "Loop test",
      projectId: null,
      pipelineRows: pipeline.rows,
      totalRows: 3,
      templatePrompt: "test {nombre}",
      connectedDataset: dataset,
      listId: "list1",
      bindings: {},
      activeImageRefs: [],
      fixedRefUrls: {},
      cardIdsByRow: ["c0", "c1", "c2"],
      analysisOrder: ["nano1"],
      nodeById,
      templateModel: { modelKey: "flash31" },
      templateType: "nanoBanana",
      soleNanoSink: true,
      flowNodes: [],
      flowEdges: [],
      setNodes: vi.fn(),
      writeDataset: false,
    });

    expect(result.status).toBe("partial");
    expect(result.okCount).toBe(2);
    expect(result.failedCount).toBe(1);
    expect(result.lastRunOutputs).toHaveLength(2);
    expect(result.lastRunOutputs[0]).toContain("row-1");
    expect(result.lastRunOutputs[1]).toContain("row-3");
    expect(result.failures).toEqual([{ rowIndex: 1, error: "Fallo forzado en fila 2" }]);
    expect(result.subgraph.nodes.length).toBeGreaterThan(0);
    expect(result.summaryError).toMatch(/2 resultados guardados/i);
    expect(result.summaryError).toMatch(/fila 2/i);

    // Simula commits incrementales: tras fila 1 solo hay 1 output
    const afterRow1 = await finalizeLoopBatchRun({
      loopId: "pop_test",
      label: "Loop test",
      projectId: null,
      pipelineRows: pipeline.rows.slice(0, 1),
      totalRows: 3,
      templatePrompt: "test",
      connectedDataset: dataset,
      listId: "list1",
      bindings: {},
      activeImageRefs: [],
      fixedRefUrls: {},
      cardIdsByRow: ["c0", "c1", "c2"],
      analysisOrder: ["nano1"],
      nodeById,
      templateModel: { modelKey: "flash31" },
      templateType: "nanoBanana",
      soleNanoSink: true,
      flowNodes: [],
      flowEdges: [],
      setNodes: vi.fn(),
      writeDataset: false,
    });
    expect(afterRow1.okCount).toBe(1);
    expect(afterRow1.status).toBe("done");
    commits.push(afterRow1);
  });
});
