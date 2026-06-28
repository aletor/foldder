import { describe, expect, it } from "vitest";
import { concatenatorExecutor } from "./concatenator.executor";

describe("concatenatorExecutor", () => {
  it("une p0…p7 con espacio (igual que el nodo en lienzo)", async () => {
    const out = await concatenatorExecutor.execute({
      node: { id: "cat", type: "concatenator" },
      inputs: {
        byHandle: {
          p0: { kind: "text", text: "foto de" },
          p1: { kind: "text", text: "un coche rojo" },
        },
      },
      overrides: {},
      ctx: { ownerEmail: "t@t.com", rowIndex: 0 },
    });
    expect(out).toEqual({ kind: "text", text: "foto de un coche rojo" });
  });

  it("falla si no hay entradas", async () => {
    await expect(
      concatenatorExecutor.execute({
        node: { id: "cat", type: "concatenator" },
        inputs: { byHandle: {} },
        overrides: {},
        ctx: { ownerEmail: "t@t.com", rowIndex: 0 },
      }),
    ).rejects.toThrow(/no hay prompts/i);
  });
});
