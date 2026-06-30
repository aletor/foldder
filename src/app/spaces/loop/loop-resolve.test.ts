import { describe, expect, it } from "vitest";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import {
  extractPromptTokens,
  hasPromptTokens,
  insertTokenAtSelection,
  substitutePromptTokens,
} from "./loop-tokens";
import {
  hasColumnBindings,
  resolveColumnImageInputsForRow,
  resolveImageBindingForRow,
  resolvePromptForRow,
} from "./loop-resolve";
import type { LoopBindings } from "./loop-types";

function makeDataset(): Dataset {
  return {
    id: "ds1",
    name: "Personajes",
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
        name: "Cast",
        key: "cast",
        schema: [
          { id: "f_desc", key: "descripcion", label: "Descripción", type: "text", required: false },
          { id: "f_foto", key: "foto_personaje", label: "Foto", type: "image", required: false },
          { id: "f_edad", key: "edad", label: "Edad", type: "number", required: false },
        ],
        cards: [
          {
            id: "card_a",
            values: {
              f_desc: { type: "text", value: "una astronauta" },
              f_foto: { type: "image", assetId: "a1", url: "https://cdn/x/a.png" },
              f_edad: { type: "number", value: 30 },
            },
          },
          {
            id: "card_b",
            values: {
              f_desc: { type: "text", value: "un pirata" },
              f_foto: { type: "image", assetId: "b1", url: "https://cdn/x/b.png" },
              f_edad: { type: "number", value: 45 },
            },
          },
        ],
      },
    ],
  };
}

describe("loop-tokens", () => {
  it("extracts unique tokens preserving order", () => {
    expect(extractPromptTokens("hola {a} y {b} y {a}")).toEqual(["a", "b"]);
    expect(extractPromptTokens("sin tokens")).toEqual([]);
  });

  it("hasPromptTokens detects tokens", () => {
    expect(hasPromptTokens("x {y}")).toBe(true);
    expect(hasPromptTokens("plano")).toBe(false);
  });

  it("substitutes known tokens and leaves unknown intact", () => {
    const out = substitutePromptTokens("el {x} salta", (k) => (k === "x" ? "gato" : null));
    expect(out).toBe("el gato salta");
    const out2 = substitutePromptTokens("el {y} salta", () => null);
    expect(out2).toBe("el {y} salta");
  });

  it("inserts a token at the selection", () => {
    const { text, caret } = insertTokenAtSelection("foto de ", 8, 8, "descripcion");
    expect(text).toBe("foto de {descripcion}");
    expect(caret).toBe("foto de {descripcion}".length);
  });
});

describe("loop-resolve", () => {
  it("resolves prompt tokens per row from list and constants", () => {
    const ds = makeDataset();
    expect(resolvePromptForRow("{marca}: el protagonista es {descripcion} ({edad})", ds, "l1", 0)).toBe(
      "ACME: el protagonista es una astronauta (30)",
    );
    expect(resolvePromptForRow("el protagonista es {descripcion}", ds, "l1", 1)).toBe(
      "el protagonista es un pirata",
    );
  });

  it("manual token values override list/constant and are constant per row", () => {
    const ds = makeDataset();
    const manual = { descripcion: "un robot dorado" };
    // El token manual gana sobre la columna, en cualquier fila.
    expect(
      resolvePromptForRow("{marca}: el protagonista es {descripcion}", ds, "l1", 0, manual),
    ).toBe("ACME: el protagonista es un robot dorado");
    expect(
      resolvePromptForRow("{marca}: el protagonista es {descripcion}", ds, "l1", 1, manual),
    ).toBe("ACME: el protagonista es un robot dorado");
  });

  it("empty manual token falls back to the dataset column", () => {
    const ds = makeDataset();
    expect(
      resolvePromptForRow("el protagonista es {descripcion}", ds, "l1", 1, { descripcion: "   " }),
    ).toBe("el protagonista es un pirata");
    // Token manual no presente ⇒ comportamiento normal (columna).
    expect(
      resolvePromptForRow("el protagonista es {descripcion}", ds, "l1", 0, { otro: "x" }),
    ).toBe("el protagonista es una astronauta");
  });

  it("manual token can fill a key that is not a dataset column", () => {
    const ds = makeDataset();
    expect(resolvePromptForRow("estilo {estilo}", ds, "l1", 0, { estilo: "acuarela" })).toBe(
      "estilo acuarela",
    );
  });

  it("resolves a column image binding per row", () => {
    const ds = makeDataset();
    const binding = {
      inputId: "image2",
      source: "column" as const,
      listId: "l1",
      fieldId: "f_foto",
      fieldKey: "foto_personaje",
    };
    expect(resolveImageBindingForRow(binding, ds, 0)).toBe("https://cdn/x/a.png");
    expect(resolveImageBindingForRow(binding, ds, 1)).toBe("https://cdn/x/b.png");
  });

  it("ignores fixed bindings and missing images", () => {
    const ds = makeDataset();
    const fixed = { inputId: "image", source: "fixed" as const };
    expect(resolveImageBindingForRow(fixed, ds, 0)).toBeNull();
    const outOfRange = {
      inputId: "image2",
      source: "column" as const,
      listId: "l1",
      fieldId: "f_foto",
    };
    expect(resolveImageBindingForRow(outOfRange, ds, 99)).toBeNull();
  });

  it("resolves all column image inputs for a row", () => {
    const ds = makeDataset();
    const bindings: LoopBindings = {
      image: { inputId: "image", source: "fixed" },
      image2: {
        inputId: "image2",
        source: "column",
        listId: "l1",
        fieldId: "f_foto",
        fieldKey: "foto_personaje",
      },
    };
    expect(resolveColumnImageInputsForRow(bindings, ds, 1)).toEqual({
      image2: "https://cdn/x/b.png",
    });
    expect(hasColumnBindings(bindings)).toBe(true);
    expect(hasColumnBindings({ image: { inputId: "image", source: "fixed" } })).toBe(false);
  });
});
