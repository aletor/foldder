import { describe, expect, it } from "vitest";
import { openAiImageSizePixelFactor, resolveOpenAiImageSize } from "./openai-image-size";

describe("resolveOpenAiImageSize", () => {
  it("maps the five Image Creation formats at 2K", () => {
    expect(resolveOpenAiImageSize("16:9", "2k")).toBe("2560x1440");
    expect(resolveOpenAiImageSize("9:16", "2k")).toBe("1440x2560");
    expect(resolveOpenAiImageSize("4:3", "2k")).toBe("2560x1920");
    expect(resolveOpenAiImageSize("3:4", "2k")).toBe("1920x2560");
    expect(resolveOpenAiImageSize("1:1", "2k")).toBe("2560x2560");
  });
});

describe("openAiImageSizePixelFactor", () => {
  it("keeps 16:9 as the 1× reference and charges more pixels for 1:1", () => {
    expect(openAiImageSizePixelFactor("16:9", "2k")).toBe(1);
    expect(openAiImageSizePixelFactor("1:1", "2k")).toBeGreaterThan(1);
  });
});
