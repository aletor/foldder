import { describe, expect, it } from "vitest";
import type { Dataset } from "./dataset-types";
import {
  collectMediaUrlsFromDataset,
  FOLDDER_FOLDDATA_FORMAT,
  FOLDDER_FOLDDATA_VERSION,
  prepareImportedDataset,
} from "./dataset-folddata";

function sampleDataset(): Dataset {
  return {
    id: "ds_old",
    name: "Equipos",
    scope: "global",
    lists: [
      {
        id: "dl_old",
        name: "Jugadores",
        key: "jugadores",
        schema: [
          { id: "f_name", key: "nombre", label: "Nombre", type: "text", required: true },
          { id: "f_photo", key: "foto", label: "Foto", type: "image", required: false },
        ],
        cards: [
          {
            id: "c_old",
            values: {
              f_name: { type: "text", value: "Ana" },
              f_photo: { type: "image", assetId: "a_old", url: "https://example.com/a.jpg" },
            },
          },
        ],
      },
    ],
    constants: {
      fields: [{ id: "f_logo", key: "logo", label: "Logo", type: "image", required: false }],
      values: {
        f_logo: { type: "image", assetId: "a_logo", url: "blob:logo" },
      },
    },
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
    version: 9,
  };
}

describe("dataset-folddata", () => {
  it("collectMediaUrlsFromDataset deduplicates image and video urls", () => {
    const urls = collectMediaUrlsFromDataset(sampleDataset());
    expect(urls).toEqual(["blob:logo", "https://example.com/a.jpg"]);
  });

  it("prepareImportedDataset remaps ids and resets version", () => {
    const imported = prepareImportedDataset(sampleDataset(), "local", "proj_1");
    expect(imported.id).not.toBe("ds_old");
    expect(imported.scope).toBe("local");
    expect(imported.projectId).toBe("proj_1");
    expect(imported.version).toBe(1);
    expect(imported.createdAt).not.toBe("2020-01-01T00:00:00.000Z");
    expect(imported.lists[0]?.id).not.toBe("dl_old");
    expect(imported.lists[0]?.cards[0]?.id).not.toBe("c_old");

    const schemaIds = imported.lists[0]?.schema.map((f) => f.id) ?? [];
    expect(schemaIds).not.toContain("f_name");
    expect(schemaIds).not.toContain("f_photo");

    const cardValues = imported.lists[0]?.cards[0]?.values ?? {};
    const valueKeys = Object.keys(cardValues);
    expect(valueKeys).not.toContain("f_name");
    expect(valueKeys).toHaveLength(2);
    const photoVal = Object.values(cardValues).find((v) => v.type === "image");
    expect(photoVal?.type).toBe("image");
    if (photoVal?.type === "image") {
      expect(photoVal.assetId).not.toBe("a_old");
      expect(photoVal.url).toBe("https://example.com/a.jpg");
    }

    const constFieldIds = imported.constants.fields.map((f) => f.id);
    expect(constFieldIds).not.toContain("f_logo");
    const logoVal = Object.values(imported.constants.values)[0];
    if (logoVal?.type === "image") {
      expect(logoVal.assetId).not.toBe("a_logo");
    }
  });

  it("exports stable format constants", () => {
    expect(FOLDDER_FOLDDATA_FORMAT).toBe("foldder-dataset");
    expect(FOLDDER_FOLDDATA_VERSION).toBe(1);
  });
});
