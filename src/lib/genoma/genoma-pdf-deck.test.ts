import { describe, expect, it } from "vitest";
import { analyzeDeckPdfHeuristics, isLikelyDeckPdf } from "./genoma-pdf-deck";
import { deckLogoVisionPageNumbers } from "./ingest/page-vision-pass-selection";

describe("isLikelyDeckPdf", () => {
  it("detects investor deck filenames", async () => {
    const buffer = Buffer.from("%PDF-1.4");
    expect(await isLikelyDeckPdf(buffer, "Investor Deck V1.pdf", "")).toBe(true);
    expect(await isLikelyDeckPdf(buffer, "brand-manual.pdf", "")).toBe(false);
  });

  it("detects long PDFs with little hex text as decks", async () => {
    const h = await analyzeDeckPdfHeuristics(Buffer.from("x"), "report.pdf", "solo texto sin colores");
    expect(h.fewHexColorsInText).toBe(true);
  });
});

describe("deckLogoVisionPageNumbers", () => {
  it("limits deck logo vision to cover and anchors", () => {
    expect(deckLogoVisionPageNumbers(1)).toEqual([1]);
    expect(deckLogoVisionPageNumbers(16)).toEqual([1, 2, 16]);
  });
});
