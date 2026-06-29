import { describe, expect, it } from "vitest";
import { computeRgbHistogram, histogramToPath } from "./lightroom-histogram";

describe("lightroom-histogram", () => {
  it("computes histogram from RGBA pixels", () => {
    const pixels = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
    const { r, g, b, luma } = computeRgbHistogram(pixels, 2, 1);
    expect(r[255]).toBe(1);
    expect(g[255]).toBe(1);
    expect(b[0]).toBe(2);
    expect(luma.length).toBe(256);
  });

  it("histogramToPath returns closed area", () => {
    const hist = new Uint32Array(256);
    hist[128] = 10;
    const d = histogramToPath(hist, 100, 50);
    expect(d.startsWith("M 0 50")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
  });
});
