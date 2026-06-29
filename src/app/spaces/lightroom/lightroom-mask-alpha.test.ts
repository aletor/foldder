import { describe, expect, it } from "vitest";
import {
  combineAlphaValues,
  renderLinearGradientAlpha,
  renderLuminanceRangeAlpha,
} from "./lightroom-mask-alpha";
import { defaultLinearMask } from "./lightroom-mask-types";

describe("lightroom-mask-alpha", () => {
  it("combineAlphaValues supports add/subtract/intersect", () => {
    expect(combineAlphaValues(0, 0.5, "add", true)).toBe(0.5);
    expect(combineAlphaValues(0.8, 0.3, "add", false)).toBeCloseTo(1);
    expect(combineAlphaValues(0.8, 0.3, "subtract", false)).toBeCloseTo(0.5);
    expect(combineAlphaValues(0.8, 0.3, "intersect", false)).toBeCloseTo(0.3);
  });

  it("renderLinearGradientAlpha produces gradient", () => {
    const alpha = renderLinearGradientAlpha(64, 64, defaultLinearMask());
    expect(alpha[0]).toBeLessThan(alpha[32 * 64 + 63] ?? 0);
  });

  it("renderLuminanceRangeAlpha selects mid tones", () => {
    const rgba = new Uint8ClampedArray(4 * 4);
    for (let i = 0; i < 16; i += 1) {
      const v = i * 16;
      rgba[i * 4] = v;
      rgba[i * 4 + 1] = v;
      rgba[i * 4 + 2] = v;
      rgba[i * 4 + 3] = 255;
    }
    const alpha = renderLuminanceRangeAlpha(4, 4, {
      type: "luminanceRange",
      id: "test",
      min: 20,
      max: 80,
      smoothness: 0.05,
      invert: false,
      combine: "add",
    }, rgba);
    expect(Math.max(...alpha)).toBeGreaterThan(0.2);
    expect(alpha[0]).toBeLessThan(0.1);
  });

  it("buildMaskLayerAlpha applies inverted and amount", async () => {
    const { buildMaskLayerAlpha } = await import("./lightroom-mask-alpha");
    const { createMaskLayer, createMaskPrimitive } = await import("./lightroom-mask-types");
    const layer = createMaskLayer("Máscara 1");
    layer.masks = [createMaskPrimitive("radial", "add")];

    const full = await buildMaskLayerAlpha(layer, 32, 32);
    const half = await buildMaskLayerAlpha({ ...layer, amount: 50 }, 32, 32);
    const inverted = await buildMaskLayerAlpha({ ...layer, inverted: true }, 32, 32);

    let sumFull = 0;
    let sumHalf = 0;
    for (let i = 0; i < full.length; i += 1) {
      sumFull += full[i] ?? 0;
      sumHalf += half[i] ?? 0;
      expect(inverted[i]).toBe(255 - (full[i] ?? 0));
    }
    expect(sumHalf).toBeGreaterThan(sumFull * 0.48);
    expect(sumHalf).toBeLessThan(sumFull * 0.52);
  });
});
