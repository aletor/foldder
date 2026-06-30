import { describe, expect, it } from "vitest";
import { createExecutorRegistry } from "./executor-registry";
import type { NodeExecutor } from "./node-executor";

function stubExecutor(type: string): NodeExecutor {
  return {
    type,
    mode: "input-binding",
    getBindableVariables: () => [],
    execute: async () => ({ kind: "text", text: "" }),
    estimateCost: () => ({ costUsd: 0, label: type }),
  };
}

describe("ExecutorRegistry", () => {
  it("registra y resuelve executors por tipo", () => {
    const reg = createExecutorRegistry();
    reg.register(stubExecutor("nanoBanana"));
    expect(reg.has("nanoBanana")).toBe(true);
    expect(reg.get("nanoBanana")?.type).toBe("nanoBanana");
    expect(reg.isPipelineExecutable("nanoBanana")).toBe(true);
  });

  it("un tipo sin registrar no es elegible en la tubería", () => {
    const reg = createExecutorRegistry();
    expect(reg.has("grokProcessor")).toBe(false);
    expect(reg.get("grokProcessor")).toBeNull();
    expect(reg.isPipelineExecutable("grokProcessor")).toBe(false);
    expect(reg.isPipelineExecutable(undefined)).toBe(false);
  });

  it("registrar el mismo tipo sobrescribe (idempotente por tipo)", () => {
    const reg = createExecutorRegistry();
    const a = stubExecutor("x");
    const b = stubExecutor("x");
    reg.register(a).register(b);
    expect(reg.types()).toEqual(["x"]);
    expect(reg.get("x")).toBe(b);
  });
});
