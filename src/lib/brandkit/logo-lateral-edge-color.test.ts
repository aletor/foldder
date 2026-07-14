import { describe, expect, it } from "vitest";
import {
  lateralEdgeHexFromRgba,
  medianRgbFromSamples,
  sampleLateralEdgeRgbFromRgba,
} from "./logo-lateral-edge-color";

describe("logo-lateral-edge-color", () => {
  it("medianRgbFromSamples devuelve mediana por canal", () => {
    expect(
      medianRgbFromSamples([
        [10, 20, 30],
        [12, 22, 32],
        [200, 200, 200],
      ]),
    ).toBe("#0C1620");
  });

  it("sampleLateralEdgeRgbFromRgba lee bordes laterales", () => {
    const width = 10;
    const height = 4;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const edge = x === 0 || x === width - 1;
        data[i] = edge ? 20 : 250;
        data[i + 1] = edge ? 30 : 250;
        data[i + 2] = edge ? 40 : 250;
        data[i + 3] = 255;
      }
    }
    const samples = sampleLateralEdgeRgbFromRgba(data, width, height, { rowStride: 1 });
    expect(samples.length).toBeGreaterThan(0);
    expect(lateralEdgeHexFromRgba(data, width, height)).toBe("#141E28");
  });
});
