import { describe, expect, it } from "vitest";
import { mapPdfFontToDesigner, collectMissingPdfFonts } from "./pdf-scan-font-map";
import { applyPdfGState, createPdfGState, mapPdfBlendMode } from "./pdf-scan-gstate";

describe("mapPdfFontToDesigner", () => {
  it("maps Helvetica-Bold to system stack + weight 700", () => {
    const mapped = mapPdfFontToDesigner("Helvetica-Bold");
    expect(mapped.matched).toBe(true);
    expect(mapped.fontWeight).toBe(700);
    expect(mapped.fontFamily.toLowerCase()).toContain("helvetica");
  });

  it("maps subset Montserrat to Google Fonts", () => {
    const mapped = mapPdfFontToDesigner("ABCDEF+Montserrat-Regular");
    expect(mapped.matched).toBe(true);
    expect(mapped.familyLabel).toBe("Montserrat");
    expect(mapped.fontFamily).toBe("Montserrat");
  });

  it("detects italic", () => {
    expect(mapPdfFontToDesigner("Times-Italic").italic).toBe(true);
  });

  it("collects unmatched families", () => {
    const missing = collectMissingPdfFonts(["Helvetica", "SomeWeirdDisplayFontXYZ"]);
    expect(missing.some((m) => /weird|someweird/i.test(m))).toBe(true);
    expect(missing).not.toContain("Helvetica");
  });
});

describe("applyPdfGState", () => {
  it("reads fill/stroke alpha, blend and soft mask", () => {
    const state = createPdfGState();
    applyPdfGState([[["ca", 0.4], ["CA", 0.8], ["BM", "Multiply"], ["SMask", { type: "Luminosity" }]]], state);
    expect(state.fillAlpha).toBeCloseTo(0.4);
    expect(state.strokeAlpha).toBeCloseTo(0.8);
    expect(state.blendMode).toBe("multiply");
    expect(state.softMask).toBe(true);
    expect(state.softMaskSubtype).toBe("Luminosity");
    applyPdfGState([[["SMask", "None"]]], state);
    expect(state.softMask).toBe(false);
    expect(state.softMaskSubtype).toBeNull();
  });

  it("maps PDF blend names", () => {
    expect(mapPdfBlendMode("Screen")).toBe("screen");
    expect(mapPdfBlendMode("HardLight")).toBe("hard-light");
  });
});
