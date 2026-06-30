import { describe, expect, it, vi } from "vitest";
import { createExecutorRegistry } from "./executor-registry";
import { runPipeline, type RunPipelineDeps } from "./run-pipeline";
import type { ExecutorNode, NodeExecutor, NodeOutput } from "./node-executor";
import type { PipelineScope } from "./resolve-node-inputs";

/** Executor de texto que cuenta ejecuciones y concatena su input upstream. */
function textExecutor(type: string, counter: { n: number }, label = "x"): NodeExecutor {
  return {
    type,
    mode: "input-binding",
    getBindableVariables: () => [],
    execute: async ({ node, inputs }) => {
      counter.n += 1;
      const upstream = inputs.byHandle.in;
      const prefix = upstream && upstream.kind === "text" ? `${upstream.text}>` : "";
      return { kind: "text", text: `${prefix}${node.id}` } satisfies NodeOutput;
    },
    estimateCost: () => ({ costUsd: 0, label }),
  };
}

function depsFor(
  executors: NodeExecutor[],
  nodes: ExecutorNode[],
): RunPipelineDeps {
  const registry = createExecutorRegistry();
  executors.forEach((e) => registry.register(e));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  return {
    registry,
    nodeById,
    // Cablea el handle "in" de cada nodo al output de su productor (cadena C→I1→I2).
    buildInputs: ({ node, scope }) => {
      const producer: Record<string, string | undefined> = { i1: "c", i2: "i1" };
      const src = producer[node.id];
      const up = src ? (scope as PipelineScope)[src] : undefined;
      const byHandle = up ? { in: portToInput(up) } : {};
      return { inputs: { byHandle }, overrides: {} };
    },
    ctxBase: { ownerEmail: "a@b.com" },
  };
}

function portToInput(out: NodeOutput) {
  return out.kind === "text" ? ({ kind: "text", text: out.text ?? "" } as const) : undefined;
}

describe("runPipeline", () => {
  const nodes: ExecutorNode[] = [
    { id: "c", type: "constNode" },
    { id: "i1", type: "iterNode" },
    { id: "i2", type: "iterNode" },
  ];

  it("ejecuta constantes 1 vez e iterados N veces, encadenando el scope", async () => {
    const constCount = { n: 0 };
    const iterCount = { n: 0 };
    const deps = depsFor(
      [textExecutor("constNode", constCount), textExecutor("iterNode", iterCount)],
      nodes,
    );

    const res = await runPipeline(deps, {
      order: ["c", "i1", "i2"],
      iterated: new Set(["i1", "i2"]),
      constant: new Set(["c"]),
      sinkId: "i2",
      rowCount: 2,
    });

    expect(constCount.n).toBe(1); // constante una sola vez
    expect(iterCount.n).toBe(4); // 2 iterados × 2 filas
    expect(res.okCount).toBe(2);
    expect(res.failedCount).toBe(0);
    // scope encadenado: c → i1 → i2
    expect(res.rows[0].final).toEqual({ kind: "text", text: "c>i1>i2" });
    expect(res.constantCache.c).toEqual({ kind: "text", text: "c" });
  });

  it("aísla el fallo de una fila y continúa el lote", async () => {
    const iterCount = { n: 0 };
    const failing: NodeExecutor = {
      type: "iterNode",
      mode: "input-binding",
      getBindableVariables: () => [],
      execute: vi.fn(async ({ node, ctx }) => {
        iterCount.n += 1;
        if (node.id === "i1" && ctx.rowIndex === 1) throw new Error("boom en fila 1");
        return { kind: "text", text: node.id } satisfies NodeOutput;
      }),
      estimateCost: () => ({ costUsd: 0, label: "x" }),
    };
    const deps = depsFor([textExecutor("constNode", { n: 0 }), failing], nodes);

    const res = await runPipeline(deps, {
      order: ["c", "i1", "i2"],
      iterated: new Set(["i1", "i2"]),
      constant: new Set(["c"]),
      sinkId: "i2",
      rowCount: 3,
    });

    expect(res.okCount).toBe(2);
    expect(res.failedCount).toBe(1);
    const failed = res.rows.find((r) => r.status === "failed")!;
    expect(failed.rowIndex).toBe(1);
    expect(failed.error).toMatch(/boom/);
    // la fila 1 abortó tras i1: i2 no se ejecutó esa fila
    expect(res.rows[1].intermediates.i2).toBeUndefined();
  });

  it("reporta progreso correcto (constantes + iterados×filas)", async () => {
    const deps = depsFor(
      [textExecutor("constNode", { n: 0 }), textExecutor("iterNode", { n: 0 })],
      nodes,
    );
    const progress: Array<[number, number]> = [];
    await runPipeline(deps, {
      order: ["c", "i1", "i2"],
      iterated: new Set(["i1", "i2"]),
      constant: new Set(["c"]),
      sinkId: "i2",
      rowCount: 2,
      onProgress: (done, total) => progress.push([done, total]),
    });
    const last = progress[progress.length - 1];
    expect(last).toEqual([5, 5]); // 1 constante + 2×2 iterados
  });

  it("lanza si algún nodo de la tubería no tiene executor", async () => {
    const deps = depsFor([textExecutor("constNode", { n: 0 })], nodes); // falta iterNode
    await expect(
      runPipeline(deps, {
        order: ["c", "i1", "i2"],
        iterated: new Set(["i1", "i2"]),
        constant: new Set(["c"]),
        sinkId: "i2",
        rowCount: 1,
      }),
    ).rejects.toThrow(/sin executor/i);
  });
});
