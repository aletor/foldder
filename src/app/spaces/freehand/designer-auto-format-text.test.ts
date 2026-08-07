import { describe, expect, it } from "vitest";
import { flattenStoryContent, htmlToStoryNodes } from "../indesign/text-model";
import {
  autoFormatDesignerText,
  isSectionHeadingLine,
  shouldStartNewParagraph,
  splitIntoSentences,
} from "./designer-auto-format-text";

describe("splitIntoSentences", () => {
  it("parte oraciones tras punto", () => {
    expect(splitIntoSentences("Hola mundo. Seguimos aquí.")).toEqual([
      "Hola mundo.",
      "Seguimos aquí.",
    ]);
  });

  it("no parte decimales", () => {
    expect(splitIntoSentences("Mide 3.14 metros exactamente.")).toEqual([
      "Mide 3.14 metros exactamente.",
    ]);
  });
});

describe("isSectionHeadingLine", () => {
  it("detecta partidas con precio", () => {
    expect(isSectionHeadingLine("1. Preproducción, organización y guion — 450 €")).toBe(true);
    expect(isSectionHeadingLine("1. Desplazamientos y dietas — 500 €")).toBe(true);
  });

  it("detecta encabezado seguido de viñetas", () => {
    expect(isSectionHeadingLine("1. Producción aérea con dron", "• Imágenes aéreas")).toBe(true);
  });
});

describe("shouldStartNewParagraph", () => {
  it("no separa oraciones cortas seguidas", () => {
    expect(shouldStartNewParagraph("Bien.", "Seguimos con el plan.")).toBe(false);
  });

  it("separa antes de una lista", () => {
    expect(shouldStartNewParagraph("Incluye lo siguiente.", "- Uno")).toBe(true);
  });
});

describe("autoFormatDesignerText", () => {
  const scopeSample = [
    "Alcance de los trabajos",
    "1. Preproducción, organización y guion — 450 €",
    "• Coordinación previa con el cliente.",
    "• Identificación de instalaciones.",
    "1. Desplazamientos y dietas — 500 €",
    "• Desplazamiento de dos profesionales.",
    "• Transporte del equipo.",
    "1. Producción aérea con dron — 450 €",
    "• Imágenes aéreas generales.",
    "La realización de los vuelos estará condicionada a la meteorología.",
  ].join("\n");

  it("jerarquía: título y secciones en negrita; viñetas sangradas en el HTML; numeración 1.2.3.", () => {
    const result = autoFormatDesignerText(scopeSample);
    expect(result.html).toContain("<b>Alcance de los trabajos</b>");
    expect(result.html).toContain("<b>1. Preproducción, organización y guion — 450 €</b>");
    expect(result.html).toContain("<b>2. Desplazamientos y dietas — 500 €</b>");
    expect(result.html).toContain("<b>3. Producción aérea con dron — 450 €</b>");
    // Sangría literal en HTML (no <ul>): visible al primer clic en el lienzo
    expect(result.html).toContain(`\u2003\u2003•`);
    expect(result.html).not.toContain("<ul>");
    expect(result.html).not.toContain("<ol>");
    expect(result.plainText).toMatch(/\u2003\u2003•/);
    expect(result.plainText.startsWith("Alcance de los trabajos")).toBe(true);
  });

  it("blanco tras subtítulo; entre viñetas solo un salto; entre secciones un blanco", () => {
    const result = autoFormatDesignerText(scopeSample);
    expect(result.plainText.includes("\n\n\n")).toBe(false);
    // Tras subtítulo: blanco antes de la primera viñeta
    expect(result.plainText).toMatch(/450 €\n\n\u2003\u2003•/);
    // Entre viñetas: un solo salto
    expect(result.plainText).toMatch(/cliente\.\n\u2003\u2003•/);
    // Entre fin de viñetas y siguiente sección: blanco
    expect(result.plainText).toMatch(/instalaciones\.\n\n2\. Desplazamientos/);
    expect(result.plainText).toMatch(/equipo\.\n\n3\. Producción/);
  });

  it("roundtrip story: sangría y blanco tras subtítulo en un solo pase", () => {
    const { html } = autoFormatDesignerText(scopeSample);
    const flat = flattenStoryContent(htmlToStoryNodes(html))
      .map((r) => r.text)
      .join("");
    expect(flat).toMatch(/450 €\n\n\u2003\u2003•/);
    expect(flat).toContain("\u2003\u2003•");
    // Segunda pasada desde el flat del lienzo no pierde ni dobla sangría
    const second = autoFormatDesignerText(flat);
    const flat2 = flattenStoryContent(htmlToStoryNodes(second.html))
      .map((r) => r.text)
      .join("");
    expect(flat2).toContain("\u2003\u2003•");
    expect(flat2.includes("\u2003\u2003\u2003\u2003•")).toBe(false);
  });

  it("pone en negrita el rótulo antes de dos puntos", () => {
    const result = autoFormatDesignerText("Color: azul marino");
    expect(result.spans.some((s) => s.text === "Color:" && s.style?.fontWeight === "bold")).toBe(true);
  });

  it("no inventa cambios en texto vacío", () => {
    const result = autoFormatDesignerText("   ");
    expect(result.plainText).toBe("");
    expect(result.changed).toBe(false);
  });
});
