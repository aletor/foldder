import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Dataset } from "./dataset-types";
import {
  applyDatasetMediaUploadMap,
  collectEphemeralMediaUrlsFromDataset,
  uploadImportedDatasetMediaToS3,
} from "./dataset-folddata-hydrate";

vi.mock("../project-media-s3-save", () => ({
  uploadProjectMediaFile: vi.fn(async () => ({
    url: "https://cdn.example/foto.png",
    s3Key: "projects/p1/media/foto.png",
    contentType: "image/png",
  })),
}));

import { uploadProjectMediaFile } from "../project-media-s3-save";

function sampleDataset(blobUrl: string): Dataset {
  return {
    id: "ds1",
    name: "Test",
    scope: "local",
    lists: [
      {
        id: "l1",
        name: "Jugadores",
        key: "jugadores",
        schema: [{ id: "f1", key: "foto", label: "Foto", type: "image", required: false }],
        cards: [
          {
            id: "c1",
            values: {
              f1: { type: "image", assetId: "a1", url: blobUrl },
            },
          },
        ],
      },
    ],
    constants: { fields: [], values: {} },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
  };
}

describe("dataset-folddata-hydrate", () => {
  beforeEach(() => {
    vi.mocked(uploadProjectMediaFile).mockClear();
  });

  it("detecta blob: en celdas imagen", () => {
    expect(collectEphemeralMediaUrlsFromDataset(sampleDataset("blob:test-1"))).toEqual(["blob:test-1"]);
    expect(collectEphemeralMediaUrlsFromDataset(sampleDataset("https://cdn.example/x.png"))).toEqual([]);
  });

  it("aplica mapa de subida a celdas", () => {
    const map = new Map([
      ["blob:test-1", { url: "https://cdn.example/foto.png", s3Key: "projects/p1/media/foto.png" }],
    ]);
    const next = applyDatasetMediaUploadMap(sampleDataset("blob:test-1"), map);
    const val = next.lists[0]?.cards[0]?.values.f1;
    expect(val?.type).toBe("image");
    if (val?.type === "image") {
      expect(val.url).toBe("https://cdn.example/foto.png");
      expect(val.s3Key).toBe("projects/p1/media/foto.png");
    }
  });

  it("sube blob: a S3 tras import", async () => {
    const blob = new Blob([Uint8Array.from([137, 80, 78, 71])], { type: "image/png" });
    const blobUrl = "blob:folddata-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === blobUrl) {
          return { ok: true, blob: async () => blob } as Response;
        }
        throw new Error(`unexpected fetch ${String(input)}`);
      }),
    );

    const next = await uploadImportedDatasetMediaToS3(sampleDataset(blobUrl), {
      projectId: "proj_1",
    });
    expect(uploadProjectMediaFile).toHaveBeenCalledTimes(1);
    expect(next.lists[0]?.cards[0]?.values.f1).toMatchObject({
      type: "image",
      url: "https://cdn.example/foto.png",
      s3Key: "projects/p1/media/foto.png",
    });

    vi.unstubAllGlobals();
  });
});
