import { describe, expect, it } from "vitest";
import {
  applyWbMultipliers,
  sampleLinearWindow,
  wbMultipliersFromLinearRgb,
  wbMultipliersFromSliders,
  wbSlidersFromLinearSample,
  wbSlidersFromMultipliers,
} from "./lightroom-wb-eyedropper";

describe("lightroom-wb-eyedropper", () => {
  it("wbMultipliersFromLinearRgb neutralizes warm cast", () => {
    const { mR, mG, mB } = wbMultipliersFromLinearRgb(0.8, 0.5, 0.4);
    const out = applyWbMultipliers(0.8, 0.5, 0.4, mR, mG, mB);
    expect(out.r).toBeCloseTo(out.g, 3);
    expect(out.b).toBeCloseTo(out.g, 3);
  });

  it("wbSlidersFromMultipliers inverts shader multipliers", () => {
    const target = wbMultipliersFromSliders(25, -12);
    const { temp, tint } = wbSlidersFromMultipliers(target.mR, target.mG, target.mB);
    const roundTrip = wbMultipliersFromSliders(temp, tint);
    expect(roundTrip.mR).toBeCloseTo(target.mR, 2);
    expect(roundTrip.mG).toBeCloseTo(target.mG, 2);
    expect(roundTrip.mB).toBeCloseTo(target.mB, 2);
  });

  it("sampleLinearWindow averages 5x5 window", () => {
    const w = 10;
    const h = 10;
    const rgba = new Float32Array(w * h * 4);
    for (let i = 0; i < w * h; i += 1) {
      rgba[i * 4] = 1;
      rgba[i * 4 + 1] = 0.5;
      rgba[i * 4 + 2] = 0.25;
    }
    const s = sampleLinearWindow(rgba, w, h, 0.5, 0.5, 2);
    expect(s?.r).toBeCloseTo(1, 4);
    expect(s?.g).toBeCloseTo(0.5, 4);
    expect(s?.b).toBeCloseTo(0.25, 4);
  });

  it("wbSlidersFromLinearSample returns finite sliders for neutral gray", () => {
    const { temp, tint } = wbSlidersFromLinearSample(0.18, 0.18, 0.18);
    expect(Math.abs(temp)).toBeLessThanOrEqual(140);
    expect(Math.abs(tint)).toBeLessThanOrEqual(140);
    expect(Math.abs(temp)).toBeLessThan(5);
    expect(Math.abs(tint)).toBeLessThan(5);
  });
});
