import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  buildTypographyDraft,
  extractBrandKitFromPdfBuffer,
  parseEmbeddedPdfFontFamiliesSync,
} from "@/lib/brain/pdf-brand-extract";
import { parseEmbeddedPdfFontFamilies, parsePdfFontResourceName } from "@/lib/brain/pdf-font-extract";

const ATRES_PDF = path.join(process.cwd(), "fixtures/brandkit/einf_2023_atresmedia.pdf");
const hasAtresFixture = fs.existsSync(ATRES_PDF);

describe("pdf-font-extract unit", () => {
  it("parsePdfFontResourceName normaliza subset Montserrat", () => {
    const parsed = parsePdfFontResourceName("BCDEEE+Montserrat-Bold");
    expect(parsed?.family).toBe("Montserrat");
    expect(parsed?.weight).toBe("Bold");
  });
});

describe.skipIf(!hasAtresFixture)("T-fonts-atres — einf_2023_atresmedia.pdf", () => {
  const buffer = fs.readFileSync(ATRES_PDF);

  it("regex sync devuelve 0 fuentes (ObjStm comprimidos)", () => {
    expect(parseEmbeddedPdfFontFamiliesSync(buffer).size).toBe(0);
  });

  it("pdf.js devuelve Montserrat primary con ≥3 pesos", async () => {
    const fontCounts = await parseEmbeddedPdfFontFamilies(buffer, 20);
    expect(fontCounts.size).toBeGreaterThan(3);

    const typography = buildTypographyDraft(fontCounts);
    expect(typography.primary?.family).toBe("Montserrat");
    expect(typography.primary?.weights.length).toBeGreaterThanOrEqual(3);
    expect(typography.primary?.weights).toEqual(
      expect.arrayContaining(["Regular", "Bold", "Italic"]),
    );

    const extracted = await extractBrandKitFromPdfBuffer(buffer, "einf_2023_atresmedia.pdf", {
      maxPages: 20,
    });
    expect(extracted.typography.primary?.family).toBe("Montserrat");
    expect(extracted.diagnostics.fontFamilies).toBeGreaterThan(0);
    expect(extracted.typography.primary?.weights.length).toBeGreaterThanOrEqual(3);
  });
});
