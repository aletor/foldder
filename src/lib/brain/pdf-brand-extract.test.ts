import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  extractBrandKitFromPdfBuffer,
  rankPdfPaletteColors,
  shouldSkipPdfBrandExtract,
  PDF_BRAND_EXTRACT_VERSION,
  detectPdfLogoCandidates,
  extractPdfOperatorColors,
  extractPdfRenderPaletteColors,
} from "@/lib/brain/pdf-brand-extract";
import { parseEmbeddedPdfFontFamilies } from "@/lib/brain/pdf-font-extract";

const FIXTURE_PATH = path.join(
  process.cwd(),
  "fixtures/brandkit/sample-brand-deck.pdf",
);
const hasFixture = fs.existsSync(FIXTURE_PATH);

function deltaE(hexA: string, hexB: string): number {
  const parse = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  };
  const a = parse(hexA);
  const b = parse(hexB);
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

describe.skipIf(!hasFixture)("investor deck fixture — extracción visual PDF", () => {
  const buffer = hasFixture ? fs.readFileSync(FIXTURE_PATH) : Buffer.alloc(0);

  it("T-F2 — detecta candidatos de logo con bbox", async () => {
    const logos = await detectPdfLogoCandidates(buffer, "sample-brand-deck.pdf");
    expect(logos.length).toBeGreaterThanOrEqual(1);
    for (const logo of logos) {
      expect(logo.bbox.width).toBeGreaterThan(20);
      expect(logo.bbox.height).toBeGreaterThan(10);
      expect(logo.buffer.byteLength).toBeGreaterThan(100);
    }
    const variants = new Set(logos.map((l) => l.variant));
    expect(variants.has("positive")).toBe(true);
  });

  it("T-F3 — propone 5 colores con navy y acentos", async () => {
    const operatorColors = await extractPdfOperatorColors(buffer);
    const palette = rankPdfPaletteColors(operatorColors);
    expect(palette.length).toBeGreaterThanOrEqual(5);
    const navy = palette.find((c) => deltaE(c.hex, "#262f75") < 18);
    const mint = palette.some(
      (c) =>
        deltaE(c.hex, "#79e0a3") < 30 ||
        deltaE(c.hex, "#9fd6b6") < 24 ||
        deltaE(c.hex, "#70a4b7") < 18,
    );
    const gold = palette.some((c) => deltaE(c.hex, "#8c734c") < 24);
    expect(navy).toBeTruthy();
    expect(mint).toBe(true);
    expect(gold).toBe(true);
  });

  it("T-F3b — paleta desde render cuantizado", async () => {
    const renderColors = await extractPdfRenderPaletteColors(buffer, 12);
    expect(renderColors.size).toBeGreaterThan(0);
    const palette = rankPdfPaletteColors(renderColors, { detailPrefix: "render cuantizado" });
    expect(palette.length).toBeGreaterThanOrEqual(3);
    expect(palette.every((c) => c.detail.startsWith("render cuantizado"))).toBe(true);
  });

  it("T-F4 — tipografía embebida normalizada (Fractul)", async () => {
    const fonts = await parseEmbeddedPdfFontFamilies(buffer);
    expect(fonts.size).toBeGreaterThan(0);
    const extracted = await extractBrandKitFromPdfBuffer(buffer, "sample-brand-deck.pdf");
    expect(extracted.typography.primary?.family.toLowerCase()).toContain("fractul");
    expect(extracted.typography.primary?.weights.length).toBeGreaterThan(0);
  });

  it("T-F6 post-B — completitud sube con marca propuesta", async () => {
    const extracted = await extractBrandKitFromPdfBuffer(buffer, "sample-brand-deck.pdf");
    expect(extracted.brand.colorPrimary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(extracted.logos.length).toBeGreaterThan(0);
    expect(extracted.typography.primary?.family).toBeTruthy();
  });
});

describe("T-F7 — idempotencia hash PDF", () => {
  it("mismo hash + versión ⇒ skip", () => {
    expect(
      shouldSkipPdfBrandExtract({
        contentSha256: "abc123",
        previousContentSha256: "abc123",
        previousBrandExtractVersion: PDF_BRAND_EXTRACT_VERSION,
      }),
    ).toBe(true);
  });

  it("hash distinto ⇒ no skip", () => {
    expect(
      shouldSkipPdfBrandExtract({
        contentSha256: "abc123",
        previousContentSha256: "other",
        previousBrandExtractVersion: PDF_BRAND_EXTRACT_VERSION,
      }),
    ).toBe(false);
  });

  it("forceReextract ⇒ no skip aunque hash+versión coincidan", () => {
    expect(
      shouldSkipPdfBrandExtract({
        contentSha256: "abc123",
        previousContentSha256: "abc123",
        previousBrandExtractVersion: PDF_BRAND_EXTRACT_VERSION,
        forceReextract: true,
      }),
    ).toBe(false);
  });
});
