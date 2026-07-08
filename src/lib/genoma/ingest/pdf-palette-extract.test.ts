import { describe, expect, it } from "vitest";
import {
  hexExistsInRender,
  rankPaletteWithVision,
} from "./pdf-palette-vision";
import type { GenomaPdfVisionResult } from "./pdf-vision-types";

describe("extractPdfPaletteForGenome — paleta en render", () => {
  it("con visión, colores devueltos existen en render", async () => {
    const renderColors = new Map([
      ["#001848", 200],
      ["#8090d0", 50],
    ]);
    const vision: GenomaPdfVisionResult = {
      version: "test",
      palette: [{ role: "primario", approxHex: "#001848", isBrandColor: true }],
      visual: [],
      confidence: 0.5,
      provider: "mock",
    };
    const ranked = rankPaletteWithVision(renderColors, vision);
    for (const sw of ranked.palette) {
      expect(hexExistsInRender(renderColors, sw.hex)).toBe(true);
    }
  });
});
