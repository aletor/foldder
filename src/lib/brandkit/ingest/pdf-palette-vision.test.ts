import { describe, expect, it } from "vitest";
import {
  hexExistsInRender,
  nearestRenderHex,
  rankPaletteWithVision,
} from "./pdf-palette-vision";
import type { BrandKitPdfVisionResult } from "./pdf-vision-types";

describe("rankPaletteWithVision", () => {
  it("asigna roles desde visión y mapea al hex más cercano del render", () => {
    const renderColors = new Map<string, number>([
      ["#501000", 12000],
      ["#001848", 450],
      ["#384ba5", 120],
      ["#8a91eb", 80],
      ["#ffffff", 9000],
    ]);

    const vision: BrandKitPdfVisionResult = {
      version: "test",
      palette: [
        { role: "primario", approxHex: "#001848", isBrandColor: true },
        { role: "secundario", approxHex: "#384ba5", isBrandColor: true },
        { role: "acento", approxHex: "#8a91eb", isBrandColor: true },
      ],
      visual: [],
      confidence: 0.6,
      provider: "mock",
    };

    const ranked = rankPaletteWithVision(renderColors, vision, { detailPrefix: "render + visión" });
    expect(ranked.palette.some((c) => c.role === "primario" && c.hex === "#001848")).toBe(true);
    expect(ranked.palette.some((c) => c.role === "secundario")).toBe(true);
    expect(ranked.palette.every((c) => renderColors.has(c.hex) || c.detail.includes("visión"))).toBe(true);
    expect(ranked.palette.some((c) => c.hex === "#501000")).toBe(false);
    expect(ranked.usedVisionRoles).toBe(true);
  });

  it("discrepancia operador/render: solo hex presentes en render", () => {
    const renderColors = new Map([["#001848", 100]]);
    expect(hexExistsInRender(renderColors, "#001848")).toBe(true);
    expect(hexExistsInRender(renderColors, "#501000")).toBe(false);
    expect(nearestRenderHex("#001850", renderColors)?.hex).toBe("#001848");
  });

  it("sin visión cae en ranking determinista", () => {
    const renderColors = new Map([
      ["#501000", 500],
      ["#183078", 100],
    ]);
    const ranked = rankPaletteWithVision(renderColors, null);
    expect(ranked.palette[0]?.hex).toBe("#501000");
    expect(ranked.usedVisionRoles).toBe(false);
  });

  it("fallback determinista usa render antes que operadores", async () => {
    const { rankPdfPaletteColors } = await import("@/lib/brain/pdf-brand-extract");
    const renderColors = new Map([["#183078", 100]]);
    const operatorColors = new Map([["#501000", 9999]]);

    const fromRender = rankPdfPaletteColors(renderColors, { detailPrefix: "render cuantizado" });
    expect(fromRender.length).toBeGreaterThan(0);
    expect(fromRender.some((c) => c.hex === "#183078")).toBe(true);
    expect(fromRender.some((c) => c.hex === "#501000")).toBe(false);

    const fromOperator = rankPdfPaletteColors(operatorColors);
    expect(fromOperator.some((c) => c.hex === "#501000")).toBe(true);

    const emptyRender = rankPdfPaletteColors(new Map(), { detailPrefix: "render cuantizado" });
    expect(emptyRender).toHaveLength(0);
  });
});
