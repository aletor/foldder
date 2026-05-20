import { describe, expect, it } from "vitest";

import { detectAdvancedImageArtifactsInImageData } from "./artifact-detector";

function imageData(width: number, height: number, draw: (data: Uint8ClampedArray) => void): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 120;
    data[i + 1] = 120;
    data[i + 2] = 120;
    data[i + 3] = 255;
  }
  draw(data);
  return { colorSpace: "srgb", data, height, width } as ImageData;
}

describe("advanced-image-artifact-detector", () => {
  it("flags long saturated UI-like selection lines", () => {
    const data = imageData(160, 120, (pixels) => {
      for (let x = 20; x < 140; x += 1) {
        for (let y = 42; y < 46; y += 1) {
          const offset = (y * 160 + x) * 4;
          pixels[offset] = 255;
          pixels[offset + 1] = 0;
          pixels[offset + 2] = 0;
        }
      }
    });

    const result = detectAdvancedImageArtifactsInImageData(data);

    expect(result.contaminated).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.7);
    expect(result.suspectColors).toContain("#ff0000");
  });

  it("does not flag small saturated photographic accents", () => {
    const data = imageData(160, 120, (pixels) => {
      for (let x = 80; x < 88; x += 1) {
        for (let y = 60; y < 68; y += 1) {
          const offset = (y * 160 + x) * 4;
          pixels[offset] = 255;
          pixels[offset + 1] = 0;
          pixels[offset + 2] = 0;
        }
      }
    });

    const result = detectAdvancedImageArtifactsInImageData(data);

    expect(result.contaminated).toBe(false);
  });
});
