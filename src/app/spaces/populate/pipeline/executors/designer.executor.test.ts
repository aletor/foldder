import { describe, expect, it, vi } from "vitest";
import { designerExecutor } from "./designer.executor";
import type { ExecCtx } from "../node-executor";

describe("designerExecutor (node-clone)", () => {
  it("rasteriza vía la capacidad inyectada y devuelve los slides", async () => {
    const rasterizeDesignerPages = vi.fn().mockResolvedValue([
      { url: "https://s/slide1.png", s3Key: "k1" },
      { url: "https://s/slide2.png", s3Key: "k2" },
    ]);
    const ctx: ExecCtx = {
      ownerEmail: "a@b.com",
      rowIndex: 2,
      capabilities: { rasterizeDesignerPages },
    };
    const out = await designerExecutor.execute({
      node: { id: "des", type: "designer", data: {} },
      inputs: { byHandle: {} },
      overrides: { title: "Jugador 3" },
      ctx,
    });
    expect(out.kind).toBe("image");
    expect(out.url).toBe("https://s/slide1.png");
    expect(out.items).toHaveLength(2);
    expect(rasterizeDesignerPages).toHaveBeenCalledWith({
      node: { id: "des", type: "designer", data: {} },
      overrides: { title: "Jugador 3" },
      rowIndex: 2,
    });
  });

  it("falla con mensaje claro si el entorno no aporta la capacidad de rasterizado", async () => {
    const ctx: ExecCtx = { ownerEmail: "a@b.com", rowIndex: 0 };
    await expect(
      designerExecutor.execute({
        node: { id: "des", type: "designer" },
        inputs: { byHandle: {} },
        overrides: {},
        ctx,
      }),
    ).rejects.toThrow(/rasterizado/i);
  });

  it("node-clone no declara variables bindeables (son por instancia)", () => {
    expect(designerExecutor.getBindableVariables({ id: "des", type: "designer" })).toEqual([]);
  });
});
