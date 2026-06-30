import { describe, expect, it } from "vitest";
import { createDataset } from "@/app/spaces/dataset/dataset-logic";
import {
  applyBrandKitDatasetEdit,
  syncBrandKitAssetsToDataset,
  syncBrandKitDatasetToAssets,
} from "@/app/spaces/brandkit/brandkit-dataset-sync";
import { defaultProjectAssets } from "@/app/spaces/project-assets-metadata";

describe("brandkit-dataset-sync", () => {
  const brainId = "brain-node-1";

  it("crea bloque Marca con contexto, colores y mensajes", () => {
    const assets = defaultProjectAssets();
    assets.knowledge.corporateContext = "Marca de moda sostenible en España.";
    assets.brand.colorPrimary = "#112233";
    assets.brand.logoPositive = "https://example.com/logo.png";
    assets.strategy.approvedPhrases = ["Calidad real", "Hecho para durar"];
    assets.strategy.languageTraits = ["Cercano", "Directo"];

    const base = createDataset("Test", "local", "proj1");
    const { dataset, link } = syncBrandKitAssetsToDataset(base, brainId, assets);

    expect(link.brainNodeId).toBe(brainId);
    expect(dataset.constants.values[`bk:${brainId}:context`]?.type).toBe("text");
    expect(
      dataset.constants.values[`bk:${brainId}:context`]?.type === "text"
        ? dataset.constants.values[`bk:${brainId}:context`].value
        : "",
    ).toContain("moda sostenible");
    expect(
      dataset.constants.values[`bk:${brainId}:color_primary`]?.type === "color"
        ? dataset.constants.values[`bk:${brainId}:color_primary`].value
        : "",
    ).toBe("#112233");

    const messagesList = dataset.lists.find((l) => l.id === link.messagesListId);
    expect(messagesList?.cards.length).toBe(2);
  });

  it("sync bidireccional: editar dataset actualiza assets", () => {
    const assets = defaultProjectAssets();
    assets.strategy.approvedPhrases = ["Uno", "Dos"];

    const base = createDataset("Test", "local", "proj1");
    const { dataset, link } = syncBrandKitAssetsToDataset(base, brainId, assets);

    const messagesList = dataset.lists.find((l) => l.id === link.messagesListId)!;
    const messageFieldId = messagesList.schema[0]!.id;
    const editedDataset = {
      ...dataset,
      constants: {
        ...dataset.constants,
        values: {
          ...dataset.constants.values,
          [`bk:${brainId}:context`]: { type: "text" as const, value: "Nuevo contexto" },
        },
      },
      lists: dataset.lists.map((list) =>
        list.id === link.messagesListId
          ? {
              ...list,
              cards: [
                {
                  id: "m1",
                  values: { [messageFieldId]: { type: "text" as const, value: "Claim editado" } },
                },
              ],
            }
          : list,
      ),
    };

    const nextAssets = syncBrandKitDatasetToAssets(editedDataset, link, assets);
    expect(nextAssets.knowledge.corporateContext).toBe("Nuevo contexto");
    expect(nextAssets.strategy.approvedPhrases).toEqual(["Claim editado"]);
  });

  it("applyBrandKitDatasetEdit mantiene par dataset+assets alineado", () => {
    const assets = defaultProjectAssets();
    assets.brand.colorPrimary = "#abcdef";
    const base = createDataset("Test", "local", "proj1");
    const seeded = syncBrandKitAssetsToDataset(base, brainId, assets);

    const { assets: nextAssets, dataset } = applyBrandKitDatasetEdit(
      seeded.dataset,
      seeded.link,
      assets,
    );
    expect(nextAssets.brand.colorPrimary).toBe("#ABCDEF");
    expect(
      dataset.constants.values[`bk:${brainId}:color_primary`]?.type === "color"
        ? dataset.constants.values[`bk:${brainId}:color_primary`].value
        : "",
    ).toBe("#ABCDEF");
  });
});
