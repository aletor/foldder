import { describe, expect, it } from "vitest";
import {
  applyBaseProfileRgb,
  buildBaseProfileLut,
  canonLikeBaseCurve,
  float32ToHalf,
  LINEAR_HDR_MAX,
  linearToSrgbChannel,
} from "./lightroom-base-curve";

describe("lightroom-base-curve", () => {
  it("canonLikeBaseCurve lifts midtones and rolls off highlights", () => {
    expect(canonLikeBaseCurve(0)).toBe(0);
    expect(canonLikeBaseCurve(0.18)).toBeGreaterThan(0.12);
    expect(canonLikeBaseCurve(2.5)).toBeLessThan(2.5);
    expect(canonLikeBaseCurve(2.5)).toBeGreaterThan(1.0);
  });

  it("buildBaseProfileLut spans LINEAR_HDR_MAX domain", () => {
    const lut = buildBaseProfileLut();
    expect(lut.length).toBe(1024 * 4);
    expect(lut[0]).toBe(0);
    const last = lut[(1024 - 1) * 4] ?? 0;
    expect(last).toBeGreaterThan(0.5);
    expect(last).toBeLessThan(LINEAR_HDR_MAX);
  });

  it("applyBaseProfileRgb preserves channels independently", () => {
    const [r, g, b] = applyBaseProfileRgb(0.5, 0.2, 1.2);
    expect(r).toBeGreaterThan(g);
    expect(b).toBeGreaterThan(r);
  });

  it("linearToSrgbChannel matches sRGB OETF at black and mid", () => {
    expect(linearToSrgbChannel(0)).toBe(0);
    expect(linearToSrgbChannel(0.18)).toBeGreaterThan(0.4);
    expect(linearToSrgbChannel(0.18)).toBeLessThan(0.5);
  });

  it("float32ToHalf round-trips small values", () => {
    expect(float32ToHalf(0)).toBe(0);
    expect(float32ToHalf(1)).toBeGreaterThan(0);
  });
});
