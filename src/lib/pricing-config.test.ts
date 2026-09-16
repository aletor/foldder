import { describe, expect, it } from "vitest";

import { estimateGeminiImageGenerationUsd, estimateOpenAiImageGenerationUsd, estimateOpenAiImageUsageUsd } from "./pricing-config";

describe("estimateGeminiImageGenerationUsd", () => {
  it("prices Gemini 3.1 Flash image generations by output resolution", () => {
    expect(estimateGeminiImageGenerationUsd("flash31", "0.5k")).toBe(0.045);
    expect(estimateGeminiImageGenerationUsd("flash31", "512")).toBe(0.045);
    expect(estimateGeminiImageGenerationUsd("flash31", "1k")).toBe(0.067);
    expect(estimateGeminiImageGenerationUsd("flash31", "2k")).toBe(0.101);
    expect(estimateGeminiImageGenerationUsd("flash31", "4k")).toBe(0.151);
  });

  it("supports full Gemini model ids and keeps legacy model fallbacks", () => {
    expect(estimateGeminiImageGenerationUsd("gemini-3.1-flash-image-preview", "2k")).toBe(0.101);
    expect(estimateGeminiImageGenerationUsd("pro3", "1k")).toBe(0.12);
    expect(estimateGeminiImageGenerationUsd("pro3", "2k")).toBe(0.134);
    expect(estimateGeminiImageGenerationUsd("pro3", "4k")).toBe(0.24);
    expect(estimateGeminiImageGenerationUsd("flash25", "2k")).toBe(0.02);
  });
});

describe("estimateOpenAiImageGenerationUsd", () => {
  it("uses official Images 2.5 output tokens scaled by pixels, not the old $0.09 Media band", () => {
    const medium = estimateOpenAiImageGenerationUsd("2k", "medium", "16:9");
    const high = estimateOpenAiImageGenerationUsd("2k", "high", "16:9");
    const max = estimateOpenAiImageGenerationUsd("2k", "max", "16:9");
    expect(medium).toBeCloseTo(0.0463, 3);
    expect(high).toBeCloseTo(0.1852, 3);
    expect(max).toBeCloseTo(0.7408, 3);
    expect(max).toBeGreaterThan(0.5);
    expect(medium).toBeLessThan(0.06);
  });

  it("prices explicit high quality above medium at the same size", () => {
    const medium = estimateOpenAiImageGenerationUsd("2k", "medium", "16:9");
    const high = estimateOpenAiImageGenerationUsd("2k", "high", "16:9");
    expect(high).toBeGreaterThan(medium);
  });

  it("prices Máxima at 4× Alta (7024/1756 output tokens)", () => {
    const high = estimateOpenAiImageGenerationUsd("2k", "high", "16:9");
    const max = estimateOpenAiImageGenerationUsd("2k", "max", "16:9");
    expect(max).toBeGreaterThan(high);
    expect(max).toBeCloseTo(high * (7024 / 1756), 5);
  });

  it("scales ChatGPT cost when the aspect uses more pixels than 16:9", () => {
    const wide = estimateOpenAiImageGenerationUsd("2k", "medium", "16:9");
    const square = estimateOpenAiImageGenerationUsd("2k", "medium", "1:1");
    expect(square).toBeGreaterThan(wide);
  });
});

describe("estimateOpenAiImageUsageUsd", () => {
  it("bills 1024 Máxima from official output tokens at $30/1M", () => {
    expect(
      estimateOpenAiImageUsageUsd({
        output_tokens: 7024,
        input_tokens_details: { text_tokens: 0, image_tokens: 0 },
      }),
    ).toBe(0.21072);
  });
});
