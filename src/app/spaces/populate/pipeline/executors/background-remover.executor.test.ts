import { describe, expect, it, vi, beforeEach } from "vitest";

const matteImageForPopulate = vi.fn();
vi.mock("../transports/populate-matte", () => ({
  matteImageForPopulate: (args: unknown) => matteImageForPopulate(args),
}));

vi.mock("../resolve-media-ref-for-api", () => ({
  resolveMediaRefsForApi: async (refs: { url: string }[]) => refs.map((r) => r.url),
}));

import { backgroundRemoverExecutor } from "./background-remover.executor";

const ctx = { ownerEmail: "a@b.com", rowIndex: 0 };

beforeEach(() => {
  matteImageForPopulate.mockReset();
  matteImageForPopulate.mockResolvedValue({
    rgbaImage: "data:image/png;base64,abc",
    rgbaUrl: "https://cdn/matte.png",
    rgbaS3Key: "k/matte.png",
  });
});

describe("backgroundRemoverExecutor", () => {
  it("envía la imagen upstream a matte y devuelve el recorte", async () => {
    const out = await backgroundRemoverExecutor.execute({
      node: {
        id: "bg",
        type: "backgroundRemover",
        data: { threshold: 0.8, expansion: 2, feather: 0.5 },
      },
      inputs: { byHandle: { media: { kind: "image", url: "https://img/in.png" } } },
      overrides: {},
      ctx,
    });

    expect(matteImageForPopulate).toHaveBeenCalledWith({
      image: "https://img/in.png",
      threshold: 0.8,
      expansion: 2,
      feather: 0.5,
    });
    expect(out).toEqual({ kind: "image", url: "https://cdn/matte.png", s3Key: "k/matte.png" });
  });

  it("estimateCost coincide con wallet matte", () => {
    expect(backgroundRemoverExecutor.estimateCost({ node: { id: "bg", type: "backgroundRemover" }, overrides: {} })).toEqual({
      costUsd: 0.01,
      label: "Quitar fondo",
    });
  });

  it("falls back to data URL when matte has no S3 url", async () => {
    matteImageForPopulate.mockResolvedValue({ rgbaImage: "data:image/png;base64,abc" });
    const out = await backgroundRemoverExecutor.execute({
      node: { id: "bg", type: "backgroundRemover", data: {} },
      inputs: { byHandle: { media: { kind: "image", url: "https://img/in.png" } } },
      overrides: {},
      ctx,
    });
    expect(out).toEqual({ kind: "image", url: "data:image/png;base64,abc", s3Key: undefined });
  });
});
