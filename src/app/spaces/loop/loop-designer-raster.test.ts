import { describe, expect, it, vi } from "vitest";
import { dataUrlToImageFile, rasterizeAndUploadDesignerRows } from "./loop-designer-raster";
import type { DesignerMaterializedRow } from "./loop-designer-materialize";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";

function page(id: string, slideKey: string, slideName?: string): DesignerPageState {
  return { id, slideKey, slideName, format: "a4v", objects: [] } as unknown as DesignerPageState;
}

function row(rowIndex: number, cardId: string, pages: DesignerPageState[]): DesignerMaterializedRow {
  return { rowIndex, cardId, pages };
}

describe("dataUrlToImageFile", () => {
  it("convierte un PNG data URL a File", () => {
    const tinyPng =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const file = dataUrlToImageFile(tinyPng, "m1");
    expect(file).not.toBeNull();
    expect(file!.name).toBe("m1.png");
    expect(file!.type).toBe("image/png");
    expect(file!.size).toBeGreaterThan(0);
  });

  it("devuelve null para un data URL no-imagen", () => {
    expect(dataUrlToImageFile("data:text/plain;base64,aGk=", "m1")).toBeNull();
    expect(dataUrlToImageFile("https://x/y.png", "m1")).toBeNull();
  });
});

describe("rasterizeAndUploadDesignerRows", () => {
  it("reparte fila×slide, resuelve slideKey y espera cada fila", async () => {
    const rows = [
      row(0, "c0", [page("p1", "slk_a", "Frente"), page("p2", "slk_b", "Dorso")]),
      row(1, "c1", [page("p3", "slk_a", "Frente"), page("p4", "slk_b", "Dorso")]),
    ];
    const rasterize = vi.fn(async (_pages: DesignerPageState[], ids: string[]) =>
      Object.fromEntries(ids.map((id) => [id, `data:image/png;base64,${id}`])),
    );
    const upload = vi.fn(async (dataUrl: string) => ({
      url: `https://s3/${dataUrl.slice(-2)}.png`,
      s3Key: `key_${dataUrl.slice(-2)}`,
    }));
    const order: number[] = [];

    const result = await rasterizeAndUploadDesignerRows({
      rows,
      rasterize,
      upload,
      onRowDone: (done) => order.push(done),
    });

    expect(rasterize).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenCalledTimes(4);
    expect(order).toEqual([1, 2]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ rowIndex: 0, cardId: "c0" });
    expect(result[0]!.slides.map((s) => s.slideKey)).toEqual(["slk_a", "slk_b"]);
    expect(result[0]!.slides[0]).toMatchObject({ slideName: "Frente", s3Key: "key_p1" });
  });

  it("omite páginas sin raster devuelto", async () => {
    const rows = [row(0, "c0", [page("p1", "slk_a"), page("p2", "slk_b")])];
    const rasterize = async () => ({ p1: "data:image/png;base64,p1" });
    const upload = async () => ({ url: "u", s3Key: "k" });
    const result = await rasterizeAndUploadDesignerRows({ rows, rasterize, upload });
    expect(result[0]!.slides).toHaveLength(1);
    expect(result[0]!.slides[0]!.slideKey).toBe("slk_a");
  });

  it("no rasteriza filas sin páginas", async () => {
    const rows = [row(0, "c0", [])];
    const rasterize = vi.fn(async () => ({}));
    const upload = vi.fn(async () => ({ url: "u", s3Key: "k" }));
    const result = await rasterizeAndUploadDesignerRows({ rows, rasterize, upload });
    expect(rasterize).not.toHaveBeenCalled();
    expect(result[0]!.slides).toHaveLength(0);
  });
});
