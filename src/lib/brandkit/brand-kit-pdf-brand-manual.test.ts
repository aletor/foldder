import { describe, expect, it } from "vitest";
import { isLikelyBrandManualPdf } from "./brand-kit-pdf-brand-manual-detect";

const FFF_MANUAL_SNIPPET = `
chapitre présente les logotypes de la fff et les règles d'utilisation
mise en couleurs
typographie fff
pantone 465c
univers de marque
`.trim();

describe("isLikelyBrandManualPdf", () => {
  it("detects FFF-style guide from text signals", () => {
    expect(isLikelyBrandManualPdf("2b1a8faefd0a6aa90e2a6882d96cd9a7.pdf", FFF_MANUAL_SNIPPET)).toBe(true);
  });

  it("detects from filename hints", () => {
    expect(isLikelyBrandManualPdf("Brand Manual Acme.pdf", "")).toBe(true);
  });
});
