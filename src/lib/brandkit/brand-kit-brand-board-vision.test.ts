import { describe, expect, it } from "vitest";
import { parseBrandBoardVisionResponse } from "./brand-kit-brand-board-vision-schema";

describe("parseBrandBoardVisionResponse", () => {
  it("parsea respuesta tipo Qwords Systems", () => {
    const parsed = parseBrandBoardVisionResponse({
      brandName: "Qwords Systems",
      documentType: "brand_board",
      palette: [
        { name: "Porcelain", hex: "#F4F5F6", role: "background" },
        { name: "Cello", hex: "#224365", role: "primary" },
        { name: "bad", hex: "224365", role: "primary" },
      ],
      typography: [
        { family: "Geometric Sans Bold", role: "display", sampleText: "Qwords Systems" },
        { family: "Geometric Sans Regular", role: "body", sampleText: "Systems" },
      ],
      logos: [
        {
          box_2d: [40, 620, 280, 980],
          variant: "full",
          brand_text: "Qwords Systems",
          is_primary: true,
          is_complete: true,
          confidence: 0.96,
          context: "hero_panel_top_right",
        },
        {
          box_2d: [300, 300, 700, 700],
          variant: "isotipo",
          brand_text: null,
          is_primary: false,
          is_complete: false,
          confidence: 0.55,
          context: "wireframe_construction",
        },
      ],
    });

    expect(parsed?.brandName).toBe("Qwords Systems");
    expect(parsed?.palette).toHaveLength(2);
    expect(parsed?.palette[0]?.hex).toBe("#f4f5f6");
    expect(parsed?.typography).toHaveLength(2);
    expect(parsed?.logos[0]?.is_primary).toBe(true);
    expect(parsed?.logos[0]?.box_2d).toEqual([40, 620, 280, 980]);
  });

  it("rechaza JSON inválido", () => {
    expect(parseBrandBoardVisionResponse(null)).toBeNull();
    expect(parseBrandBoardVisionResponse({ palette: "nope" })).toEqual({
      brandName: undefined,
      documentType: undefined,
      palette: [],
      typography: [],
      logos: [],
    });
  });
});
