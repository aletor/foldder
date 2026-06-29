import { describe, expect, it } from "vitest";
import { canRenameLayerInPanel, layerPanelDisplayName, textLayerNameSnippet } from "./layer-panel-label";
import type { TextObject, FreehandObject } from "../FreehandStudio";

describe("textLayerNameSnippet", () => {
  it("recorta a 4 caracteres con elipsis", () => {
    expect(textLayerNameSnippet("Hola mundo")).toBe("Hola…");
  });

  it("colapsa espacios y saltos de línea", () => {
    expect(textLayerNameSnippet("  AB\nCD  ")).toBe("AB C…");
  });

  it("devuelve vacío si no hay texto", () => {
    expect(textLayerNameSnippet("   ")).toBe("");
  });
});

describe("layerPanelDisplayName", () => {
  it("usa el snippet de texto en capas de texto", () => {
    const obj = {
      id: "t1",
      name: "Text 1",
      type: "text",
      text: "Nombre",
    } as TextObject;
    expect(layerPanelDisplayName(obj)).toBe("Nomb…");
  });

  it("cae al nombre si el texto está vacío", () => {
    const obj = {
      id: "t1",
      name: "Text 1",
      type: "text",
      text: "",
    } as TextObject;
    expect(layerPanelDisplayName(obj)).toBe("Text 1");
  });
});

describe("canRenameLayerInPanel", () => {
  it("no permite renombrar capas de texto", () => {
    expect(canRenameLayerInPanel({ id: "t", type: "text", name: "T" } as TextObject)).toBe(false);
    expect(canRenameLayerInPanel({ id: "p", type: "textOnPath", name: "P" } as TextObject)).toBe(false);
  });

  it("permite renombrar carpetas e imágenes", () => {
    expect(canRenameLayerInPanel({ id: "f", type: "groupContainer", name: "Carpeta" } as FreehandObject)).toBe(
      true,
    );
    expect(canRenameLayerInPanel({ id: "i", type: "image", name: "Img" } as FreehandObject)).toBe(true);
  });
});
