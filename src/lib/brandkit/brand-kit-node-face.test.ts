import { describe, expect, it } from "vitest";
import { createEmptyBrandKit } from "./brand-kit-defaults";
import {
  brandKitFaceSwatchColumns,
  extractNodeFaceGalleryStripUrls,
  extractPrimaryPaletteHex,
  extractPrimaryTypeSpecimen,
} from "./brand-kit-node-face";
import type { GalleryValue, PaletteValue, TypographyValue } from "./brand-kit-types";

describe("brandKitFaceSwatchColumns", () => {
  it("elige columnas compactas para cuadrados", () => {
    expect(brandKitFaceSwatchColumns(0)).toBe(1);
    expect(brandKitFaceSwatchColumns(1)).toBe(1);
    expect(brandKitFaceSwatchColumns(2)).toBe(2);
    expect(brandKitFaceSwatchColumns(4)).toBe(2);
    expect(brandKitFaceSwatchColumns(5)).toBe(3);
    expect(brandKitFaceSwatchColumns(9)).toBe(3);
  });
});

describe("extractPrimaryTypeSpecimen", () => {
  it("prioriza display/heading", () => {
    const doc = createEmptyBrandKit();
    doc.slots.typography = {
      ...doc.slots.typography,
      status: "resolved",
      value: {
        families: [
          { family: "Inter", role: "body", source: "google", fallbacks: ["sans-serif"], weights: [400] },
          {
            family: "Playfair Display",
            role: "display",
            source: "google",
            fallbacks: ["Georgia", "serif"],
            weights: [400, 700],
          },
        ],
      } satisfies TypographyValue,
    };
    const specimen = extractPrimaryTypeSpecimen(doc);
    expect(specimen?.familyName).toBe("Playfair Display");
    expect(specimen?.fontWeight).toBe(700);
    expect(specimen?.fontFamily).toContain("Playfair Display");
  });
});

describe("extractPrimaryPaletteHex", () => {
  it("usa el rol primary si existe", () => {
    const doc = createEmptyBrandKit();
    doc.slots.palette = {
      ...doc.slots.palette,
      status: "resolved",
      value: {
        colors: [
          { hex: "#EEEEEE", role: "neutral" },
          { hex: "#1B3A8A", role: "primary" },
        ],
      } satisfies PaletteValue,
    };
    expect(extractPrimaryPaletteHex(doc)).toBe("#1B3A8A");
  });
});

describe("extractNodeFaceGalleryStripUrls", () => {
  it("prioriza el snapshot congelado", () => {
    const doc = createEmptyBrandKit();
    doc.slots.gallery = {
      ...doc.slots.gallery,
      status: "resolved",
      value: {
        harvested: [],
        generated: [
          { assetId: "a", previewUrl: "https://example.com/new.png", promptVersion: 2 },
        ],
        stylePromptVersion: 2,
        nodeFaceStripUrls: [
          "https://example.com/1.png",
          "https://example.com/2.png",
          "https://example.com/3.png",
          "https://example.com/4.png",
        ],
      } satisfies GalleryValue,
    };
    expect(extractNodeFaceGalleryStripUrls(doc)).toEqual([
      "https://example.com/1.png",
      "https://example.com/2.png",
      "https://example.com/3.png",
      "https://example.com/4.png",
    ]);
  });
});
