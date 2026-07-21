import { describe, expect, it } from "vitest";
import {
  designerStyleFromPdfWeightLabel,
  remainingMissingPdfFonts,
} from "./pdf-scan-font-style";

describe("designerStyleFromPdfWeightLabel", () => {
  it("mapea pesos habituales", () => {
    expect(designerStyleFromPdfWeightLabel("Bold")).toEqual({
      weight: 700,
      style: "Bold",
      italic: false,
    });
    expect(designerStyleFromPdfWeightLabel("BoldItalic")).toEqual({
      weight: 700,
      style: "Bold Italic",
      italic: true,
    });
    expect(designerStyleFromPdfWeightLabel("Regular", true)).toEqual({
      weight: 400,
      style: "Italic",
      italic: true,
    });
  });
});

describe("remainingMissingPdfFonts", () => {
  it("quita familias ya extraídas", () => {
    expect(
      remainingMissingPdfFonts(["Fractul", "WeirdDisplay", "Fractul"], [{ family: "Fractul" }]),
    ).toEqual(["WeirdDisplay"]);
  });

  it("es case-insensitive", () => {
    expect(remainingMissingPdfFonts(["Montserrat"], [{ family: "montserrat" }])).toEqual([]);
  });
});
