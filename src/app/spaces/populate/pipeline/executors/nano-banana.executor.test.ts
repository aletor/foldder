import { describe, expect, it, vi, beforeEach } from "vitest";

const generatePopulateImage = vi.fn();
vi.mock("../../populate-generate", () => ({
  generatePopulateImage: (args: unknown) => generatePopulateImage(args),
}));

vi.mock("../resolve-media-ref-for-api", () => ({
  resolveMediaRefsForApi: async (refs: { url: string }[]) => refs.map((r) => r.url),
}));

import { nanoBananaExecutor } from "./nano-banana.executor";
import type { ExecCtx } from "../node-executor";

const ctx: ExecCtx = { ownerEmail: "a@b.com", rowIndex: 0 };

beforeEach(() => {
  generatePopulateImage.mockReset();
  generatePopulateImage.mockResolvedValue({ output: "https://img/out.png", s3Key: "k1" });
});

describe("nanoBananaExecutor", () => {
  it("usa el override del prompt y junta las refs de imagen en orden", async () => {
    const out = await nanoBananaExecutor.execute({
      node: { id: "img", type: "nanoBanana", data: { modelKey: "flash31", resolution: "2k" } },
      inputs: {
        byHandle: {
          image: { kind: "image", url: "ref1" },
          image2: { kind: "image", url: "ref2", s3Key: "k2" },
        },
      },
      overrides: { prompt: "un gato astronauta" },
      ctx,
    });

    expect(out).toEqual({ kind: "image", url: "https://img/out.png", s3Key: "k1" });
    expect(generatePopulateImage).toHaveBeenCalledTimes(1);
    const arg = generatePopulateImage.mock.calls[0][0];
    expect(arg.prompt).toBe("un gato astronauta");
    expect(arg.images).toEqual(["ref1", "ref2"]);
    expect(arg.model).toMatchObject({ modelKey: "flash31", aspectRatio: "16:9", resolution: "2k", provider: "gemini" });
  });

  it("cae al promptText del nodo si no hay override", async () => {
    await nanoBananaExecutor.execute({
      node: { id: "img", type: "nanoBanana", data: { promptText: "semilla", imageProvider: "openai" } },
      inputs: { byHandle: {} },
      overrides: {},
      ctx,
    });
    const arg = generatePopulateImage.mock.calls[0][0];
    expect(arg.prompt).toBe("semilla");
    expect(arg.images).toEqual([]);
    expect(arg.model.provider).toBe("openai");
  });

  it("estimateCost usa el modelo/resolución del nodo", () => {
    const est = nanoBananaExecutor.estimateCost({
      node: { id: "img", type: "nanoBanana", data: { modelKey: "pro3" } },
      overrides: {},
    });
    expect(est.costUsd).toBeGreaterThan(0);
    expect(est.label).toBe("Generar imagen");
  });
});
