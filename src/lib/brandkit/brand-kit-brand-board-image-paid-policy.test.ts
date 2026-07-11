import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

const FIXTURE = path.join(__dirname, "fixtures", "qwords-brand-board.png");

const invokeBrandBoardVision = vi.fn(async () => ({
  result: {
    brandName: "Qwords Systems",
    palette: [{ hex: "#152033", role: "primary" as const }],
    typography: [{ family: "Geometric Sans", role: "display" as const }],
    logos: [],
  },
  model: "gemini-2.5-flash",
  estimatedCostUsd: 0.02,
}));

const invokeBrandBoardLogoFocusVision = vi.fn(async () => ({
  result: {
    brandName: "Qwords Systems",
    palette: [],
    typography: [],
    logos: [
      {
        box_2d: [40, 620, 280, 980],
        variant: "full" as const,
        is_primary: true,
        is_complete: true,
        confidence: 0.95,
      },
    ],
  },
  model: "gemini-2.5-flash",
  estimatedCostUsd: 0.012,
}));

vi.mock("./brand-kit-brand-board-vision", () => ({
  invokeBrandBoardVision: (...args: unknown[]) => invokeBrandBoardVision(...args),
  invokeBrandBoardLogoFocusVision: (...args: unknown[]) => invokeBrandBoardLogoFocusVision(...args),
}));

vi.mock("./ingest/upload-brand-kit-file", () => ({
  uploadBrandKitIngestFile: vi.fn(async () => ({
    key: "knowledge-files/u/brandKit/ingest/test.png",
    url: "/api/spaces/s3-file?key=knowledge-files%2Fu%2FbrandKit%2Fingest%2Ftest.png",
    fileId: "knowledge-files/u/brandKit/ingest/test.png",
  })),
}));

describe("extractBrandBoardVisualsFromImage paid policy", () => {
  beforeEach(() => {
    invokeBrandBoardVision.mockClear();
    invokeBrandBoardLogoFocusVision.mockClear();
  });

  it("hace una llamada Gemini si el primer pase basta", async () => {
    if (!fs.existsSync(FIXTURE)) return;

    invokeBrandBoardVision.mockResolvedValueOnce({
      result: {
        brandName: "Qwords Systems",
        palette: [{ hex: "#152033", role: "primary" as const }],
        typography: [],
        logos: [
          {
            box_2d: [40, 620, 280, 980],
            variant: "full" as const,
            is_primary: true,
            is_complete: true,
            confidence: 0.95,
          },
        ],
      },
      model: "gemini-2.5-flash",
      estimatedCostUsd: 0.02,
    });

    const { extractBrandBoardVisualsFromImage } = await import("./brand-kit-brand-board-image");
    const buffer = fs.readFileSync(FIXTURE);

    const result = await extractBrandBoardVisualsFromImage({
      buffer,
      fileName: "qwords-brand-board.png",
      mime: "image/png",
      userEmail: "test@example.com",
      visionEnabled: true,
      allowLogoFocusVision: true,
    });

    expect(invokeBrandBoardVision).toHaveBeenCalledTimes(1);
    expect(invokeBrandBoardLogoFocusVision).not.toHaveBeenCalled();
    expect(result.logoFocusVisionUsed).toBe(false);
  });

  it("segunda llamada solo con allowLogoFocusVision y sin logos tras el primer pase", async () => {
    if (!fs.existsSync(FIXTURE)) return;

    const { extractBrandBoardVisualsFromImage } = await import("./brand-kit-brand-board-image");
    const buffer = fs.readFileSync(FIXTURE);

    const withFocus = await extractBrandBoardVisualsFromImage({
      buffer,
      fileName: "qwords-brand-board.png",
      mime: "image/png",
      userEmail: "test@example.com",
      visionEnabled: true,
      allowLogoFocusVision: true,
    });

    expect(invokeBrandBoardVision).toHaveBeenCalledTimes(1);
    expect(invokeBrandBoardLogoFocusVision).toHaveBeenCalledTimes(1);
    expect(withFocus.logoFocusVisionUsed).toBe(true);

    invokeBrandBoardVision.mockClear();
    invokeBrandBoardLogoFocusVision.mockClear();

    await extractBrandBoardVisualsFromImage({
      buffer,
      fileName: "qwords-brand-board.png",
      mime: "image/png",
      userEmail: "test@example.com",
      visionEnabled: true,
      allowLogoFocusVision: false,
    });

    expect(invokeBrandBoardVision).toHaveBeenCalledTimes(1);
    expect(invokeBrandBoardLogoFocusVision).not.toHaveBeenCalled();
  });

  it("no llama Gemini con IA desactivada", async () => {
    if (!fs.existsSync(FIXTURE)) return;

    const { extractBrandBoardVisualsFromImage } = await import("./brand-kit-brand-board-image");
    const buffer = fs.readFileSync(FIXTURE);

    await extractBrandBoardVisualsFromImage({
      buffer,
      fileName: "qwords-brand-board.png",
      mime: "image/png",
      userEmail: "test@example.com",
      visionEnabled: false,
    });

    expect(invokeBrandBoardVision).not.toHaveBeenCalled();
    expect(invokeBrandBoardLogoFocusVision).not.toHaveBeenCalled();
  });
});
