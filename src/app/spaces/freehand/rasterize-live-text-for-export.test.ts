import { describe, expect, it } from "vitest";
import {
  canvasFontFromComputed,
  combinedLetterSpacingPx,
  parseCssFontStretch,
} from "./rasterize-live-text-for-export";
import {
  localFontFamilyMatches,
  scoreLocalFontCandidate,
  stretchFromFontLabel,
} from "./text-outline";

describe("combinedLetterSpacingPx", () => {
  it("sums letterSpacing and charSpacing like the live foreignObject", () => {
    expect(combinedLetterSpacingPx(-4.2, 0)).toBeCloseTo(-4.2);
    expect(combinedLetterSpacingPx(-2, -1.5)).toBeCloseTo(-3.5);
    expect(combinedLetterSpacingPx(undefined, 1)).toBe(1);
    expect(combinedLetterSpacingPx(3, undefined)).toBe(3);
  });
});

describe("parseCssFontStretch", () => {
  it("maps condensed percentages and keywords", () => {
    expect(parseCssFontStretch("condensed")).toBe("condensed");
    expect(parseCssFontStretch("ultra-condensed")).toBe("condensed");
    expect(parseCssFontStretch("75%")).toBe("condensed");
    expect(parseCssFontStretch("normal")).toBe("normal");
    expect(parseCssFontStretch("100%")).toBe("normal");
    expect(parseCssFontStretch("expanded")).toBe("expanded");
  });
});

describe("local font matching for export", () => {
  it("does not treat Helvetica as Helvetica Neue", () => {
    expect(localFontFamilyMatches("Helvetica", "Helvetica Neue", "Helvetica Neue Condensed Black")).toBe(false);
    expect(localFontFamilyMatches("Helvetica", "Helvetica", "Helvetica Bold")).toBe(true);
    expect(localFontFamilyMatches("Helvetica Neue", "Helvetica Neue", "Helvetica Neue Condensed Black")).toBe(true);
  });

  it("prefers Black over Condensed Black when stretch is normal", () => {
    const condensed = scoreLocalFontCandidate({
      family: "Helvetica Neue",
      fullName: "Helvetica Neue Condensed Black",
      style: "Condensed Black",
      requestedFamily: "Helvetica Neue",
      requestedWeight: 900,
      requestedStretch: "normal",
    });
    const black = scoreLocalFontCandidate({
      family: "Helvetica Neue",
      fullName: "Helvetica Neue Black",
      style: "Black",
      requestedFamily: "Helvetica Neue",
      requestedWeight: 900,
      requestedStretch: "normal",
    });
    expect(black).toBeLessThan(condensed);
  });

  it("prefers Condensed Black when the canvas is using condensed", () => {
    const condensed = scoreLocalFontCandidate({
      family: "Helvetica Neue",
      fullName: "Helvetica Neue Condensed Black",
      style: "Condensed Black",
      requestedFamily: "Helvetica Neue",
      requestedWeight: 900,
      requestedStretch: "condensed",
    });
    const black = scoreLocalFontCandidate({
      family: "Helvetica Neue",
      fullName: "Helvetica Neue Black",
      style: "Black",
      requestedFamily: "Helvetica Neue",
      requestedWeight: 900,
      requestedStretch: "condensed",
    });
    expect(condensed).toBeLessThan(black);
  });

  it("detects condensed from style labels", () => {
    expect(stretchFromFontLabel("Condensed Black", "Helvetica Neue Condensed Black")).toBe("condensed");
    expect(stretchFromFontLabel("Black", "Helvetica Neue Black")).toBe("normal");
  });
});

describe("canvasFontFromComputed", () => {
  it("includes condensed stretch so Canvas 2D matches CSS font matching", () => {
    const cs = {
      fontStyle: "normal",
      fontWeight: "900",
      fontStretch: "condensed",
      fontFamily: '"Helvetica Neue", sans-serif',
    } as CSSStyleDeclaration;
    expect(canvasFontFromComputed(cs, 120)).toContain("900");
    expect(canvasFontFromComputed(cs, 120)).toContain("condensed");
    expect(canvasFontFromComputed(cs, 120)).toContain("120px");
  });
});
