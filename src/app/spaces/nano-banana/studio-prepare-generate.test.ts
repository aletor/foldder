import { describe, expect, it } from "vitest";
import { shouldUsePaidAreaAnalysis } from "./studio-prepare-generate";
import { createStudioCard } from "./studio-types";

describe("shouldUsePaidAreaAnalysis", () => {
  const localChange = {
    ...createStudioCard(0),
    description: "Poner un sombrero",
    paintData: "data:image/png;base64,mask",
  };

  it("permite el análisis al generar una edición por zonas", () => {
    expect(
      shouldUsePaidAreaAnalysis({
        baseImage: "https://example.com/base.png",
        cards: [localChange],
      }),
    ).toBe(true);
  });

  it("nunca analiza al construir una vista previa local", () => {
    expect(
      shouldUsePaidAreaAnalysis({
        allowPaidAnalyze: false,
        baseImage: "https://example.com/base.png",
        cards: [localChange],
      }),
    ).toBe(false);
  });
});
