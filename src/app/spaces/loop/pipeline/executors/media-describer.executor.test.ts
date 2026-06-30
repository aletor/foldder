import { describe, expect, it, vi, beforeEach } from "vitest";

const describeImageForLoop = vi.fn();
vi.mock("../transports/loop-describe", () => ({
  describeImageForLoop: (args: unknown) => describeImageForLoop(args),
}));

import { mediaDescriberExecutor } from "./media-describer.executor";
import type { ExecCtx } from "../node-executor";

const ctx: ExecCtx = { ownerEmail: "a@b.com", rowIndex: 0 };

beforeEach(() => {
  describeImageForLoop.mockReset();
  describeImageForLoop.mockResolvedValue("una foto de producto sobre fondo neutro");
});

describe("mediaDescriberExecutor", () => {
  it("describe la imagen de entrada (cualquier handle de imagen) y devuelve texto", async () => {
    const out = await mediaDescriberExecutor.execute({
      node: { id: "desc", type: "mediaDescriber" },
      inputs: { byHandle: { media: { kind: "image", url: "https://img/in.png", s3Key: "k1" } } },
      overrides: {},
      ctx,
    });
    expect(out).toEqual({ kind: "text", text: "una foto de producto sobre fondo neutro" });
    expect(describeImageForLoop).toHaveBeenCalledWith({ url: "https://img/in.png", s3Key: "k1" });
  });

  it("falla con mensaje claro si no hay imagen de entrada", async () => {
    await expect(
      mediaDescriberExecutor.execute({
        node: { id: "desc", type: "mediaDescriber" },
        inputs: { byHandle: {} },
        overrides: {},
        ctx,
      }),
    ).rejects.toThrow(/no hay imagen/i);
    expect(describeImageForLoop).not.toHaveBeenCalled();
  });
});
