import { describe, expect, it } from "vitest";
import {
  isBrandBoardFilename,
  isLikelyBrandBoardImage,
  triageImageKind,
} from "../genoma-brand-board-image-detect";
import { triageGenomaFilename } from "./triage";

describe("triageGenomaFilename brand board", () => {
  it("clasifica brand board por nombre", () => {
    expect(triageGenomaFilename("qwords-brand-board.png", "image/png").kind).toBe("brand_board_image");
    expect(triageGenomaFilename("moodboard-final.jpg", "image/jpeg").kind).toBe("brand_board_image");
  });

  it("no confunde brand board con logo suelto", () => {
    expect(triageImageKind("brand-logo.png")).toBe("logo_image");
    expect(triageImageKind("brand-board.png")).toBe("brand_board_image");
    expect(triageImageKind("hero-photo.jpg")).toBe("gallery_image");
  });

  it("conserva reglas previas", () => {
    expect(triageGenomaFilename("brand-logo.png", "image/png").kind).toBe("logo_image");
    expect(triageGenomaFilename("hero-photo.jpg", "image/jpeg").kind).toBe("gallery_image");
    expect(triageGenomaFilename("manual-marca.pdf", "application/pdf").kind).toBe("brand_document");
  });
});

describe("isLikelyBrandBoardImage", () => {
  it("detecta collage grande con texto", () => {
    expect(
      isLikelyBrandBoardImage("screenshot.png", {
        width: 1600,
        height: 1200,
        area: 1_920_000,
        textPresenceScore: 0.42,
        visualDensityScore: 0.55,
      }),
    ).toBe(true);
  });

  it("rechaza thumbs pequeños", () => {
    expect(
      isLikelyBrandBoardImage("thumb.png", {
        width: 320,
        height: 240,
        area: 76_800,
        textPresenceScore: 0.5,
        visualDensityScore: 0.6,
      }),
    ).toBe(false);
  });

  it("acepta por filename aunque sea pequeño", () => {
    expect(isBrandBoardFilename("client-brand-guide.png")).toBe(true);
  });
});
