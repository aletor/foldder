import { describe, expect, it } from "vitest";
import { filterProjectableToneTraits, isRawArtifact } from "./raw-artifact";

describe("T-F1 — isRawArtifact", () => {
  it.each([
    ["### Document: sample-brand-deck.pdf", true],
    ["Document: pitch.pdf", true],
    ["Página 3 — resumen", true],
    ["Page 2: overview", true],
    ["https://example.com/deck.pdf", true],
    ["/Volumes/projects/brand/sample-brand-deck.pdf", true],
    ["```json", true],
    ["| col | val |", true],
    ["Marca orientada a equipos de producto", false],
    ["formal", false],
  ])("isRawArtifact(%j) → %s", (text, expected) => {
    expect(
      isRawArtifact(text, { sourceFilenames: ["sample-brand-deck.pdf"] }),
    ).toBe(expected);
  });

  it("detecta filename de fuente embebido", () => {
    expect(
      isRawArtifact("Resumen sample-brand-deck.pdf con datos", {
        sourceFilenames: ["sample-brand-deck.pdf"],
      }),
    ).toBe(true);
  });

  it("filtra chips en inglés ALL CAPS", () => {
    expect(filterProjectableToneTraits(["FORMAL", "confiable", "TRUSTWORTHY"])).toEqual(["confiable"]);
  });
});
