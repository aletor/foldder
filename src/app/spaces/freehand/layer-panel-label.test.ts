import { describe, expect, it } from "vitest";
import { layerPanelDisplayName, textLayerNameSnippet } from "./layer-panel-label";
import type { TextObject } from "../FreehandStudio";

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
