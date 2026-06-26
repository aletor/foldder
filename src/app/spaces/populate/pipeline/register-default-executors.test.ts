import { describe, expect, it } from "vitest";
import { createExecutorRegistry } from "./executor-registry";
import { registerDefaultPopulateExecutors } from "./register-default-executors";

describe("registerDefaultPopulateExecutors", () => {
  it("registra los executors built-in de F1", () => {
    const reg = registerDefaultPopulateExecutors(createExecutorRegistry());
    expect(new Set(reg.types())).toEqual(
      new Set(["nanoBanana", "designer", "mediaDescriber", "enhancer"]),
    );
  });

  it("nanoBanana expone prompt + refs de imagen como variables bindeables (desde la declaración)", () => {
    const reg = registerDefaultPopulateExecutors(createExecutorRegistry());
    const vars = reg.get("nanoBanana")!.getBindableVariables({ id: "img", type: "nanoBanana" });
    const keys = vars.map((v) => v.key);
    expect(keys).toContain("prompt");
    expect(keys).toContain("image");
    const prompt = vars.find((v) => v.key === "prompt")!;
    expect(prompt.type).toBe("text");
    expect(prompt.accepts).toContain("text");
    const ref = vars.find((v) => v.key === "image")!;
    expect(ref.type).toBe("image");
    expect(ref.accepts).toEqual(["image"]);
  });

  it("grokProcessor no está registrado: no es elegible en la tubería (gating F1)", () => {
    const reg = registerDefaultPopulateExecutors(createExecutorRegistry());
    expect(reg.isPipelineExecutable("grokProcessor")).toBe(false);
  });
});
