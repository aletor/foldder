import { describe, expect, it } from "vitest";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import {
  imageAtCard,
  poseOptionsVisual,
  recordThumbFromValues,
  textAtCard,
  textAtSnapshotRow,
} from "./populate-row-preview";

const dataset: Dataset = {
  id: "ds",
  label: "DS",
  lists: [
    {
      id: "list1",
      key: "players",
      name: "Jugadores",
      schema: [
        { id: "f_name", key: "name", label: "Nombre", type: "text", required: false },
        { id: "f_photo", key: "photo", label: "Foto", type: "image", required: false },
        { id: "f_pose", key: "pose", label: "Pose", type: "image", required: false },
      ],
      cards: [
        {
          id: "c1",
          values: {
            f_name: { type: "text", value: "Messi" },
            f_photo: { type: "image", url: "https://x/front.png" },
            f_pose: { type: "image", url: "https://x/side.png" },
          },
        },
      ],
    },
  ],
};

describe("populate-row-preview", () => {
  it("lee texto e imagen de una fila", () => {
    expect(textAtCard({ dataset, listId: "list1", cardId: "c1", fieldId: "f_name" })).toBe("Messi");
    expect(imageAtCard({ dataset, listId: "list1", cardId: "c1", fieldId: "f_pose" })).toBe(
      "https://x/side.png",
    );
  });

  it("genera opciones de pose con URL", () => {
    const opts = poseOptionsVisual({
      schema: dataset.lists[0]!.schema,
      imageFieldIds: ["f_photo", "f_pose"],
      cardId: "c1",
      dataset,
      listId: "list1",
    });
    expect(opts).toHaveLength(2);
    expect(opts[1]!.url).toBe("https://x/side.png");
  });

  it("funciona con snapshot", () => {
    const rows = [{ cardId: "c1", label: "Messi", values: dataset.lists[0]!.cards[0]!.values }];
    expect(textAtSnapshotRow(rows, "c1", "f_name")).toBe("Messi");
    expect(recordThumbFromValues(rows[0]!.values, dataset.lists[0]!.schema)).toBe(
      "https://x/front.png",
    );
  });

  it("encuentra miniatura sin schema (formulario público)", () => {
    const values = dataset.lists[0]!.cards[0]!.values;
    expect(recordThumbFromValues(values, [])).toBe("https://x/front.png");
  });
});
