import { describe, expect, it } from "vitest";
import { isNearWhiteHex, parsePdfRgbColor } from "./pdf-scan-color";
import { extractPdfDocumentPaths } from "./pdf-document-paths";
import {
  makeFullPageBackgroundPdf,
  makeSolidRectPdf,
} from "./pdf-scan-corpus-fixtures";

describe("parsePdfRgbColor", () => {
  it("accepts pdf.js hex string args", () => {
    expect(parsePdfRgbColor(["#1a4cd9"])).toBe("#1a4cd9");
    expect(parsePdfRgbColor(["#ABC"])).toBe("#aabbcc");
    expect(parsePdfRgbColor(["ff8800"])).toBe("#ff8800");
  });

  it("accepts 0–1 RGB triples", () => {
    expect(parsePdfRgbColor([0.1, 0.3, 0.85])).toBe("#1a4dd9");
  });

  it("accepts 0–255 RGB triples", () => {
    expect(parsePdfRgbColor([26, 76, 217])).toBe("#1a4cd9");
  });

  it("falls back to black", () => {
    expect(parsePdfRgbColor([])).toBe("#000000");
  });
});

describe("isNearWhiteHex", () => {
  it("detects near-white", () => {
    expect(isNearWhiteHex("#ffffff")).toBe(true);
    expect(isNearWhiteHex("#fafafa")).toBe(true);
    expect(isNearWhiteHex("#1a4cd9")).toBe(false);
  });
});

describe("extractPdfDocumentPaths colors + backgrounds", () => {
  it("keeps solid-rect fill color from pdf.js hex", async () => {
    const { paths } = await extractPdfDocumentPaths(makeSolidRectPdf(), { dpi: 72, maxPages: 1 });
    expect(paths.length).toBeGreaterThanOrEqual(1);
    // pdf.js DeviceRGB → #1a4cd9 (no Math.round idéntico a 0.1/0.3/0.85)
    expect(paths[0]!.fill).toBe("#1a4cd9");
  }, 20_000);

  it("keeps full-page colored background as a path", async () => {
    const { paths } = await extractPdfDocumentPaths(makeFullPageBackgroundPdf(), {
      dpi: 72,
      maxPages: 1,
    });
    expect(paths.length).toBeGreaterThanOrEqual(2);
    const fills = paths.map((p) => p.fill);
    expect(fills).toContain("#0d408c");
    expect(fills).toContain("#f2bf26");
    const bg = paths.find((p) => p.fill === "#0d408c");
    expect(bg).toBeTruthy();
    expect(bg!.w * bg!.h).toBeGreaterThan(300 * 200 * 0.9);
  }, 20_000);
});
