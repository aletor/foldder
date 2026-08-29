import { describe, expect, it } from "vitest";

import { estimateGeminiImageGenerationUsd, estimateOpenAiImageGenerationUsd } from "./pricing-config";

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
  it("keeps 16:9 at the previous resolution tiers", () => {
    expect(estimateOpenAiImageGenerationUsd("1k", "medium", "16:9")).toBe(0.05);
    expect(estimateOpenAiImageGenerationUsd("2k", "medium", "16:9")).toBe(0.09);
    expect(estimateOpenAiImageGenerationUsd("4k", "high", "16:9")).toBe(0.261);
  });

  it("scales ChatGPT cost when the aspect uses more pixels than 16:9", () => {
    const wide = estimateOpenAiImageGenerationUsd("2k", "medium", "16:9");
    const square = estimateOpenAiImageGenerationUsd("2k", "medium", "1:1");
    expect(square).toBeGreaterThan(wide);
  });
});
