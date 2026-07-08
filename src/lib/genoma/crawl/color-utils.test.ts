import { describe, expect, it } from "vitest";
import {
  isBoilerplateCssVarName,
  mergeFontFamilies,
  parseColorToHex,
  rankPaletteColors,
  sanitizeFontFamily,
  scoreBrandCssVarName,
} from "./color-utils";

describe("genoma color-utils", () => {
  it("parses rgb colors", () => {
    expect(parseColorToHex("rgb(228, 26, 28)")).toBe("#E41A1C");
  });

  it("rejects tailwind boilerplate vars", () => {
    expect(isBoilerplateCssVarName("tw-ring-offset-color")).toBe(true);
    expect(scoreBrandCssVarName("brand-primary")).toBeGreaterThan(50);
  });

  it("ranks brand colors above tailwind neutrals", () => {
    const ranked = rankPaletteColors([
      { hex: "#FFFFFF", varName: "tw-ring-offset-color", provenance: { type: "css_var", detail: "tw" }, weight: 0.5 },
      { hex: "#E41A1C", varName: "brand-primary", provenance: { type: "css_var", detail: "brand" }, weight: 0.5 },
    ]);
    expect(ranked[0]?.hex).toBe("#E41A1C");
  });

  it("sanitizes invalid font families", () => {
    expect(sanitizeFontFamily("var(--major-font)")).toBeNull();
    expect(sanitizeFontFamily("Helvetica Neue")).toBe("Helvetica Neue");
  });

  it("prioritizes linked google fonts over css noise", () => {
    const merged = mergeFontFamilies(["DM Sans", "Inter"], ["var(--major-font)", "Arial"]);
    expect(merged[0]).toBe("DM Sans");
    expect(merged).not.toContain("var(--major-font)");
  });
});
