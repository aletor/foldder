import { describe, expect, it } from "vitest";
import {
  enrichTypographySpecimen,
  GOOGLE_FONTS_OFL_LICENSE,
  isGoogleFontFamily,
  typographyValueWithUpload,
} from "./typography-specimen";

describe("enrichTypographySpecimen", () => {
  it("Montserrat no embebida → Google Fonts con licencia OFL", () => {
    const value = enrichTypographySpecimen({
      family: "Montserrat",
      weights: ["Regular", "Bold"],
      specimenAvailable: false,
      fallback: "sans-serif",
    });
    expect(value.specimenAvailable).toBe(true);
    expect(value.specimenSource).toBe("google-fonts");
    expect(value.specimenCssUrl).toContain("Montserrat");
    expect(value.specimenLicense).toBe(GOOGLE_FONTS_OFL_LICENSE);
  });

  it("familia custom sin Google Fonts → sin espécimen hasta subida", () => {
    const value = enrichTypographySpecimen({
      family: "Fraktul Custom",
      weights: ["Regular"],
      specimenAvailable: false,
      fallback: "sans-serif",
    });
    expect(value.specimenAvailable).toBe(false);
    expect(value.specimenCssUrl).toBeUndefined();
  });

  it("identified_only → sin espécimen falso ni licencia embebida", () => {
    const value = enrichTypographySpecimen({
      family: "Fractul Custom",
      weights: ["Regular", "Bold"],
      embedStatus: "identified_only",
      specimenAvailable: false,
      fallback: "sans-serif",
    });
    expect(value.specimenAvailable).toBe(false);
    expect(value.specimenCssUrl).toBeUndefined();
    expect(value.specimenLicense).toContain("binario no disponible");
  });

  it("subida woff2 activa espécimen con licencia de uso", () => {
    const value = typographyValueWithUpload(
      { family: "Fraktul", weights: ["Regular"], specimenAvailable: false, fallback: "sans-serif" },
      "data:font/woff2;base64,abc",
      "fraktul.woff2",
    );
    expect(value.specimenAvailable).toBe(true);
    expect(value.specimenSource).toBe("upload");
    expect(value.specimenFontUrl).toContain("woff2");
    expect(value.specimenLicense).toContain("fraktul.woff2");
  });

  it("isGoogleFontFamily reconoce Montserrat", () => {
    expect(isGoogleFontFamily("montserrat")).toBe(true);
    expect(isGoogleFontFamily("Fraktul")).toBe(false);
  });
});
