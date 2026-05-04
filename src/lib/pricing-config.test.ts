import { describe, expect, it } from "vitest";

import { estimateGeminiImageGenerationUsd } from "./pricing-config";

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
    expect(estimateGeminiImageGenerationUsd("pro3", "2k")).toBe(0.12);
    expect(estimateGeminiImageGenerationUsd("flash25", "2k")).toBe(0.02);
  });
});
