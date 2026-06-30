import { describe, expect, it } from "vitest";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import { isImageCellEmpty, writeImageCellValue } from "@/app/spaces/dataset/dataset-image-history";

describe("dataset-image-history", () => {
  it("treats empty image cells as empty", () => {
    expect(isImageCellEmpty({ type: "image", assetId: "", url: "" })).toBe(true);
    expect(isImageCellEmpty({ type: "image", assetId: "a", url: "https://x.png" })).toBe(false);
  });

  it("pushes previous url to generationHistory on overwrite", () => {
    const first = writeImageCellValue({
      current: undefined,
      url: "https://v1.png",
      assetId: "a1",
    });
    const second = writeImageCellValue({
      current: first,
      url: "https://v2.png",
      assetId: "a2",
    });
    expect(second.url).toBe("https://v2.png");
    expect(second.generationHistory?.[0]?.url).toBe("https://v1.png");
  });
});

describe("loop-dataset-output", () => {
  it("creates column and writes rows", async () => {
    const { applyLoopResultsToDataset } = await import("./loop-dataset-output");
    const dataset = {
      id: "ds1",
      name: "Test",
      scope: "local",
      lists: [
        {
          id: "l1",
          name: "Lista",
          key: "lista",
          schema: [{ id: "f1", key: "nombre", label: "Nombre", type: "text", required: false }],
          cards: [
            { id: "c1", values: { f1: { type: "text", value: "A" } } },
            { id: "c2", values: { f1: { type: "text", value: "B" } } },
          ],
        },
      ],
      constants: { fields: [], values: {} },
      createdAt: "",
      updatedAt: "",
      version: 1,
    } as unknown as Dataset;

    const result = applyLoopResultsToDataset({
      dataset,
      listId: "l1",
      rows: [
        { rowIndex: 0, prompt: "p", refs: [], output: "https://out0.png" },
        { rowIndex: 1, prompt: "p", refs: [], output: "https://out1.png" },
      ],
      settings: {
        enabled: true,
        columnLabel: "Cara IA",
        conflictStrategy: "update",
        fillMode: "overwrite_all",
      },
    });

    expect(result.createdColumn).toBe(true);
    expect(result.writtenCount).toBe(2);
    const list = result.dataset.lists[0]!;
    const col = list.schema.find((f) => f.key === "cara_ia");
    expect(col).toBeTruthy();
    expect(list.cards[0]?.values[col!.id]?.type).toBe("image");
  });

  it("multi-canal: cada canal escribe en su propia columna (acumulando)", async () => {
    const { applyLoopChannelsToDataset } = await import("./loop-dataset-output");
    const dataset = {
      id: "ds1",
      name: "Test",
      scope: "local",
      lists: [
        {
          id: "l1",
          name: "Lista",
          key: "lista",
          schema: [{ id: "f1", key: "nombre", label: "Nombre", type: "text", required: false }],
          cards: [
            { id: "c1", values: { f1: { type: "text", value: "A" } } },
            { id: "c2", values: { f1: { type: "text", value: "B" } } },
          ],
        },
      ],
      constants: { fields: [], values: {} },
      createdAt: "",
      updatedAt: "",
      version: 1,
    } as unknown as Dataset;

    const result = applyLoopChannelsToDataset({
      dataset,
      listId: "l1",
      channels: [
        {
          channelId: "imgA",
          settings: { enabled: true, columnLabel: "Fondo", conflictStrategy: "update", fillMode: "overwrite_all" },
          rows: [
            { rowIndex: 0, prompt: "p", refs: [], output: "https://a0.png" },
            { rowIndex: 1, prompt: "p", refs: [], output: "https://a1.png" },
          ],
        },
        {
          channelId: "imgB",
          settings: { enabled: true, columnLabel: "Producto", conflictStrategy: "update", fillMode: "overwrite_all" },
          rows: [
            { rowIndex: 0, prompt: "p", refs: [], output: "https://b0.png" },
            { rowIndex: 1, prompt: "p", refs: [], output: "https://b1.png" },
          ],
        },
        {
          // Canal deshabilitado: no escribe ni crea columna.
          channelId: "imgC",
          settings: { enabled: false, columnLabel: "Ignorado", conflictStrategy: "update", fillMode: "overwrite_all" },
          rows: [{ rowIndex: 0, prompt: "p", refs: [], output: "https://c0.png" }],
        },
      ],
    });

    expect(result.channels).toHaveLength(2);
    expect(result.totalWritten).toBe(4);
    expect(result.createdColumns).toBe(2);
    const list = result.dataset.lists[0]!;
    const fondo = list.schema.find((f) => f.key === "fondo");
    const producto = list.schema.find((f) => f.key === "producto");
    expect(fondo).toBeTruthy();
    expect(producto).toBeTruthy();
    expect(list.schema.find((f) => f.key === "ignorado")).toBeUndefined();
    expect(list.cards[0]?.values[fondo!.id]?.type).toBe("image");
    expect(list.cards[1]?.values[producto!.id]?.type).toBe("image");
  });
});
