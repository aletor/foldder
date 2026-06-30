import { describe, expect, it } from "vitest";
import { createExecutorRegistry } from "./executor-registry";
import { estimatePipelineCost } from "./estimate-pipeline-cost";
import type { ExecutorNode, NodeExecutor } from "./node-executor";

function costExecutor(type: string, costUsd: number): NodeExecutor {
  return {
    type,
    mode: "input-binding",
    getBindableVariables: () => [],
    execute: async () => ({ kind: "text", text: "" }),
    estimateCost: () => ({ costUsd, label: type }),
  };
}

describe("estimatePipelineCost", () => {
  const nodes: ExecutorNode[] = [
    { id: "brain", type: "brain" },
    { id: "img", type: "img" },
    { id: "bg", type: "bg" },
  ];
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  it("Σ iterados×N + Σ constantes", () => {
    const registry = createExecutorRegistry();
    registry.register(costExecutor("brain", 0.5));
    registry.register(costExecutor("img", 0.07));
    registry.register(costExecutor("bg", 0.02));

    const est = estimatePipelineCost({
      order: ["brain", "img", "bg"],
      iterated: new Set(["img", "bg"]),
      rowCount: 10,
      registry,
      nodeById,
    });

    // brain (constante) = 0.5 ; img+bg (iterados) = (0.07+0.02)×10 = 0.9
    expect(est.totalUsd).toBeCloseTo(1.4, 5);
    expect(est.missingExecutorTypes).toEqual([]);
    const brainLine = est.lines.find((l) => l.nodeId === "brain")!;
    expect(brainLine.runs).toBe(1);
    expect(brainLine.iterated).toBe(false);
    const imgLine = est.lines.find((l) => l.nodeId === "img")!;
    expect(imgLine.runs).toBe(10);
    expect(imgLine.costUsd).toBeCloseTo(0.7, 5);
  });

  it("reporta tipos sin executor (no estimables)", () => {
    const registry = createExecutorRegistry();
    registry.register(costExecutor("img", 0.07));
    const est = estimatePipelineCost({
      order: ["brain", "img", "bg"],
      iterated: new Set(["img"]),
      rowCount: 3,
      registry,
      nodeById,
    });
    expect(new Set(est.missingExecutorTypes)).toEqual(new Set(["brain", "bg"]));
    // solo img estima
    expect(est.totalUsd).toBeCloseTo(0.21, 5);
  });
});
