import { describe, expect, it } from "vitest";
import {
  applyDesignerSlidesToDataset,
  makePopulateDesignerGroupId,
  type DesignerDatasetOutputSettings,
  type DesignerRowSlides,
} from "./populate-designer-dataset-output";
import type { Dataset, FieldValue } from "@/app/spaces/dataset/dataset-types";

function baseDataset(): Dataset {
  const ts = "2026-01-01T00:00:00.000Z";
  return {
    id: "ds1",
    name: "Equipo",
    scope: "local",
    lists: [
      {
        id: "l1",
        name: "Jugadores",
        key: "jugadores",
        schema: [{ id: "f_nombre", key: "nombre", label: "Nombre", type: "text", required: false }],
        cards: [
          { id: "c1", values: { f_nombre: { type: "text", value: "Messi" } } },
          { id: "c2", values: { f_nombre: { type: "text", value: "Cristiano" } } },
        ],
      },
    ],
    constants: { fields: [], values: {} },
    createdAt: ts,
    updatedAt: ts,
    version: 1,
  };
}

const settings: DesignerDatasetOutputSettings = {
  enabled: true,
  groupId: makePopulateDesignerGroupId("pop1"),
  groupLabel: "Cromo",
  fillMode: "empty_only",
};

function rows(): DesignerRowSlides[] {
  return [
    {
      rowIndex: 0,
      cardId: "c1",
      slides: [
        { slideKey: "slk_front", slideName: "Frente", url: "https://x/f1.png", s3Key: "k/f1" },
        { slideKey: "slk_back", slideName: "Dorso", url: "https://x/b1.png", s3Key: "k/b1" },
      ],
    },
    {
      rowIndex: 1,
      cardId: "c2",
      slides: [
        { slideKey: "slk_front", slideName: "Frente", url: "https://x/f2.png", s3Key: "k/f2" },
        { slideKey: "slk_back", slideName: "Dorso", url: "https://x/b2.png", s3Key: "k/b2" },
      ],
    },
  ];
}

function imageCell(ds: Dataset, cardId: string, fieldId: string): Extract<FieldValue, { type: "image" }> | undefined {
  const card = ds.lists[0]!.cards.find((c) => c.id === cardId)!;
  const v = card.values[fieldId];
  return v?.type === "image" ? v : undefined;
}

describe("applyDesignerSlidesToDataset", () => {
  it("crea M columnas (una por slide) y rellena N filas", () => {
    const res = applyDesignerSlidesToDataset({ dataset: baseDataset(), listId: "l1", rows: rows(), settings });
    expect(res.createdColumns).toBe(2);
    expect(res.writtenCount).toBe(4);
    expect(res.columns.map((c) => c.fieldLabel)).toEqual(["Cromo · Frente", "Cromo · Dorso"]);

    const front = res.columns.find((c) => c.slideKey === "slk_front")!;
    expect(imageCell(res.dataset, "c1", front.fieldId)?.url).toBe("https://x/f1.png");
    expect(imageCell(res.dataset, "c2", front.fieldId)?.url).toBe("https://x/f2.png");
  });

  it("es idempotente en empty_only (no re-escribe celdas ya llenas)", () => {
    const first = applyDesignerSlidesToDataset({ dataset: baseDataset(), listId: "l1", rows: rows(), settings });
    const second = applyDesignerSlidesToDataset({ dataset: first.dataset, listId: "l1", rows: rows(), settings });
    expect(second.createdColumns).toBe(0);
    expect(second.writtenCount).toBe(0);
    expect(second.skippedCount).toBe(4);
  });

  it("overwrite_all versiona la celda (historial) y reusa la misma columna", () => {
    const first = applyDesignerSlidesToDataset({ dataset: baseDataset(), listId: "l1", rows: rows(), settings });
    const overwrite = applyDesignerSlidesToDataset({
      dataset: first.dataset,
      listId: "l1",
      rows: rows(),
      settings: { ...settings, fillMode: "overwrite_all" },
    });
    expect(overwrite.createdColumns).toBe(0);
    expect(overwrite.writtenCount).toBe(4);
    // La columna front sigue siendo la misma (re-match por slideKey).
    expect(overwrite.columns.find((c) => c.slideKey === "slk_front")!.fieldId).toBe(
      first.columns.find((c) => c.slideKey === "slk_front")!.fieldId,
    );
  });

  it("marca huérfana la columna cuya slide ya no se genera, sin borrarla", () => {
    const first = applyDesignerSlidesToDataset({ dataset: baseDataset(), listId: "l1", rows: rows(), settings });
    const frontFieldId = first.columns.find((c) => c.slideKey === "slk_front")!.fieldId;

    // Re-ejecución sin la slide "back" (se borró del template).
    const onlyFront: DesignerRowSlides[] = rows().map((r) => ({
      ...r,
      slides: r.slides.filter((s) => s.slideKey === "slk_front"),
    }));
    const second = applyDesignerSlidesToDataset({
      dataset: first.dataset,
      listId: "l1",
      rows: onlyFront,
      settings: { ...settings, fillMode: "overwrite_all" },
    });

    expect(second.orphanedColumns).toBe(1);
    const schema = second.dataset.lists[0]!.schema;
    const back = schema.find((f) => f.populateSlideKey === "slk_back")!;
    expect(back.orphaned).toBe(true);
    // La columna y su dato siguen existiendo (no destructivo).
    expect(imageCell(second.dataset, "c1", back.id)?.url).toBe("https://x/b1.png");
    // La columna front sigue activa.
    expect(schema.find((f) => f.id === frontFieldId)!.orphaned).toBe(false);
  });

  it("reordenar slides no cambia el mapeo de columnas (re-match por slideKey)", () => {
    const first = applyDesignerSlidesToDataset({ dataset: baseDataset(), listId: "l1", rows: rows(), settings });
    const frontFieldId = first.columns.find((c) => c.slideKey === "slk_front")!.fieldId;

    // Filas con slides en orden inverso.
    const reordered: DesignerRowSlides[] = rows().map((r) => ({ ...r, slides: [...r.slides].reverse() }));
    const second = applyDesignerSlidesToDataset({
      dataset: first.dataset,
      listId: "l1",
      rows: reordered,
      settings: { ...settings, fillMode: "overwrite_all" },
    });
    expect(second.createdColumns).toBe(0);
    expect(second.columns.find((c) => c.slideKey === "slk_front")!.fieldId).toBe(frontFieldId);
  });
});
