import { describe, expect, it } from "vitest";
import { buildDatasetMediaListOutput } from "./dataset-media-list";
import type { Dataset } from "./dataset-types";

function dataset(): Dataset {
  return {
    id: "ds1",
    name: "COLORPELO",
    scope: "local",
    lists: [
      {
        id: "list1",
        name: "Personajes",
        key: "personajes",
        schema: [
          { id: "f_img", key: "foto", label: "Foto", type: "image", required: false },
          { id: "f_vid", key: "clip", label: "Clip", type: "video", required: false },
          { id: "f_txt", key: "nombre", label: "Nombre", type: "text", required: false },
        ],
        cards: [
          {
            id: "c1",
            values: {
              f_img: { type: "image", assetId: "a1", url: "https://cdn/a.png", s3Key: "k/a.png", hasAlpha: true },
              f_vid: { type: "video", assetId: "v1", url: "https://cdn/a.mp4", durationMs: 5000 },
              f_txt: { type: "text", value: "Ana" },
            },
          },
          {
            id: "c2",
            values: {
              f_img: { type: "image", assetId: "a2", url: "https://cdn/b.jpg" },
            },
          },
        ],
      },
    ],
    constants: { fields: [], values: {} },
    createdAt: "",
    updatedAt: "",
    version: 1,
  };
}

describe("buildDatasetMediaListOutput", () => {
  it("extrae imágenes y vídeos en orden fila × columna", () => {
    const out = buildDatasetMediaListOutput({
      dataset: dataset(),
      sourceNodeId: "dsNode1",
    });
    expect(out?.items).toHaveLength(3);
    expect(out?.items[0]?.title).toBe("Fila 1 · Foto");
    expect(out?.items[0]?.mediaType).toBe("image");
    expect(out?.items[0]?.mimeType).toBe("image/png");
    expect(out?.items[1]?.title).toBe("Fila 1 · Clip");
    expect(out?.items[1]?.mediaType).toBe("video");
    expect(out?.items[2]?.title).toBe("Fila 2 · Foto");
  });

  it("filtra por listId cuando se indica", () => {
    const ds = dataset();
    ds.lists.push({
      id: "list2",
      name: "Otros",
      key: "otros",
      schema: [{ id: "f2", key: "img", label: "Img", type: "image", required: false }],
      cards: [{ id: "c9", values: { f2: { type: "image", assetId: "x", url: "https://cdn/z.png" } } }],
    });
    const out = buildDatasetMediaListOutput({
      dataset: ds,
      sourceNodeId: "dsNode1",
      listId: "list2",
    });
    expect(out?.items).toHaveLength(1);
    expect(out?.items[0]?.url).toBe("https://cdn/z.png");
  });

  it("devuelve null si no hay medios", () => {
    const ds = dataset();
    ds.lists[0]!.cards = [];
    expect(buildDatasetMediaListOutput({ dataset: ds, sourceNodeId: "dsNode1" })).toBeNull();
  });

  it("acepta celdas con s3Key sin url", () => {
    const ds = dataset();
    ds.lists[0]!.cards = [
      {
        id: "c3",
        values: {
          f_img: { type: "image", assetId: "a3", url: "", s3Key: "spaces/k/c3.png" },
        },
      },
    ];
    const out = buildDatasetMediaListOutput({ dataset: ds, sourceNodeId: "dsNode1" });
    expect(out?.items).toHaveLength(1);
    expect(out?.items[0]?.s3Key).toBe("spaces/k/c3.png");
  });
});
