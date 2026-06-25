import { describe, expect, it } from "vitest";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import {
  autofillFormFromRow,
  derivePopulateForm,
  resolveFormImages,
  resolveFormPrompt,
  resolvePublicFormImages,
} from "./populate-form";
import type { CreativeInputDescriptor, PopulateBindings } from "./populate-types";

function makeDataset(): Dataset {
  return {
    id: "ds1",
    name: "Plantilla",
    scope: "local",
    version: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    constants: {
      fields: [{ id: "c1", key: "marca", label: "Marca", type: "text", required: false }],
      values: { c1: { type: "text", value: "ACME" } },
    },
    lists: [
      {
        id: "l1",
        name: "Jugadores",
        key: "jugadores",
        schema: [
          { id: "f_nombre", key: "jugador", label: "Jugador", type: "text", required: false },
          { id: "f_foto", key: "foto", label: "Foto", type: "image", required: false },
        ],
        cards: [
          {
            id: "card_a",
            values: {
              f_nombre: { type: "text", value: "Messi" },
              f_foto: { type: "image", assetId: "a1", url: "https://cdn/x/a.png" },
            },
          },
          {
            id: "card_b",
            values: {
              f_nombre: { type: "text", value: "Yamal" },
              f_foto: { type: "image", assetId: "b1", url: "https://cdn/x/b.png" },
            },
          },
        ],
      },
    ],
  };
}

const imageInputs: CreativeInputDescriptor[] = [
  { inputId: "image", label: "Imagen 1", kind: "image" },
];

const bindings: PopulateBindings = {
  image: { inputId: "image", source: "column", listId: "l1", fieldId: "f_foto", fieldKey: "foto" },
};

describe("derivePopulateForm", () => {
  it("deriva un campo por variable: columna, constante e imagen", () => {
    const ds = makeDataset();
    const model = derivePopulateForm({
      promptTemplate: "{marca}: gol de {jugador} en el minuto {minuto}",
      bindings,
      imageInputs,
      dataset: ds,
      listId: "l1",
    });

    expect(model.empty).toBe(false);
    const byKey = Object.fromEntries(model.textFields.map((f) => [f.fieldKey, f]));
    // constante auto-rellenada
    expect(byKey.marca.kind).toBe("constant");
    expect(byKey.marca.constantValue).toBe("ACME");
    // columna de texto con sugerencias del Dataset
    expect(byKey.jugador.kind).toBe("text");
    expect(byKey.jugador.suggestions).toEqual(["Messi", "Yamal"]);
    // token efímero sin columna → texto libre sin sugerencias
    expect(byKey.minuto.kind).toBe("text");
    expect(byKey.minuto.suggestions).toEqual([]);
    // imagen ligada a columna → opciones por fila
    expect(model.imageFields).toHaveLength(1);
    expect(model.imageFields[0].options.map((o) => o.label)).toEqual(["Messi", "Yamal"]);
    expect(model.imageFields[0].options.map((o) => o.url)).toEqual([
      "https://cdn/x/a.png",
      "https://cdn/x/b.png",
    ]);
    // filas para autorellenar
    expect(model.rows.map((r) => r.label)).toEqual(["Messi", "Yamal"]);
  });

  it("marca empty cuando no hay variables", () => {
    const ds = makeDataset();
    const model = derivePopulateForm({
      promptTemplate: "plano sin tokens",
      bindings: {},
      imageInputs,
      dataset: ds,
      listId: "l1",
    });
    expect(model.empty).toBe(true);
  });
});

describe("autofillFormFromRow", () => {
  it("rellena tokens de columna y filas de imagen desde una fila", () => {
    const ds = makeDataset();
    const model = derivePopulateForm({
      promptTemplate: "gol de {jugador} en el minuto {minuto}",
      bindings,
      imageInputs,
      dataset: ds,
      listId: "l1",
    });
    const { textValues, imageRows } = autofillFormFromRow(model, ds, "l1", 1);
    expect(textValues).toEqual({ jugador: "Yamal" });
    expect(imageRows).toEqual({ image: 1 });
  });
});

describe("resolveFormPrompt / resolveFormImages", () => {
  it("sustituye tokens con valores del formulario y constantes", () => {
    const ds = makeDataset();
    const model = derivePopulateForm({
      promptTemplate: "{marca}: gol de {jugador} en el minuto {minuto}",
      bindings,
      imageInputs,
      dataset: ds,
      listId: "l1",
    });
    const prompt = resolveFormPrompt(model, "{marca}: gol de {jugador} en el minuto {minuto}", {
      jugador: "Messi",
      minuto: "90",
    });
    expect(prompt).toBe("ACME: gol de Messi en el minuto 90");
  });

  it("resuelve la imagen de la fila elegida", () => {
    const ds = makeDataset();
    const model = derivePopulateForm({
      promptTemplate: "gol de {jugador}",
      bindings,
      imageInputs,
      dataset: ds,
      listId: "l1",
    });
    const refs = resolveFormImages({
      model,
      imageInputs,
      fixedRefUrls: {},
      imageRows: { image: 0 },
      dataset: ds,
      listId: "l1",
    });
    expect(refs).toEqual([{ inputId: "image", url: "https://cdn/x/a.png", label: "Foto" }]);
  });

  it("usa la ref fija cuando el input no está ligado a columna", () => {
    const ds = makeDataset();
    const model = derivePopulateForm({
      promptTemplate: "gol de {jugador}",
      bindings: {},
      imageInputs,
      dataset: ds,
      listId: "l1",
    });
    const refs = resolveFormImages({
      model,
      imageInputs,
      fixedRefUrls: { image: "https://cdn/fixed.png" },
      imageRows: {},
      dataset: ds,
      listId: "l1",
    });
    expect(refs).toEqual([{ inputId: "image", url: "https://cdn/fixed.png", label: "Imagen 1" }]);
  });
});

describe("resolvePublicFormImages", () => {
  it("resuelve imágenes desde la instantánea pública sin Dataset", () => {
    const ds = makeDataset();
    const model = derivePopulateForm({
      promptTemplate: "gol de {jugador}",
      bindings,
      imageInputs,
      dataset: ds,
      listId: "l1",
    });
    const refs = resolvePublicFormImages({
      model,
      imageInputs,
      fixedRefUrls: {},
      imageRows: { image: 1 },
    });
    expect(refs).toEqual([{ inputId: "image", url: "https://cdn/x/b.png", label: "Foto" }]);
  });
});
