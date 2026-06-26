import { describe, expect, it, vi, beforeEach } from "vitest";

const enhancePromptForPopulate = vi.fn();
vi.mock("../transports/populate-enhance", () => ({
  enhancePromptForPopulate: (args: unknown) => enhancePromptForPopulate(args),
}));

import { enhancerExecutor } from "./enhancer.executor";
import type { ExecCtx } from "../node-executor";

const ctx: ExecCtx = { ownerEmail: "a@b.com", rowIndex: 0 };

beforeEach(() => {
  enhancePromptForPopulate.mockReset();
  enhancePromptForPopulate.mockResolvedValue("prompt cinematográfico, luz suave, 85mm");
});

describe("enhancerExecutor", () => {
  it("mejora el prompt del input de texto", async () => {
    const out = await enhancerExecutor.execute({
      node: { id: "enh", type: "enhancer" },
      inputs: { byHandle: { p0: { kind: "text", text: "un coche rojo" } } },
      overrides: {},
      ctx,
    });
    expect(out).toEqual({ kind: "text", text: "prompt cinematográfico, luz suave, 85mm" });
    expect(enhancePromptForPopulate).toHaveBeenCalledWith({ prompt: "un coche rojo" });
  });

  it("el override tiene prioridad sobre el input conectado", async () => {
    await enhancerExecutor.execute({
      node: { id: "enh", type: "enhancer", data: { value: "ignorado" } },
      inputs: { byHandle: { p0: { kind: "text", text: "del cable" } } },
      overrides: { prompt: "de la fila" },
      ctx,
    });
    expect(enhancePromptForPopulate).toHaveBeenCalledWith({ prompt: "de la fila" });
  });

  it("falla si no hay prompt", async () => {
    await expect(
      enhancerExecutor.execute({
        node: { id: "enh", type: "enhancer" },
        inputs: { byHandle: {} },
        overrides: {},
        ctx,
      }),
    ).rejects.toThrow(/no hay prompt/i);
  });
});
