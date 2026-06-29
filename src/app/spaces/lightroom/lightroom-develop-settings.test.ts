import { describe, expect, it } from "vitest";
import {
  applyParametricTone,
  buildToneCurveLuts,
  evaluateCurvePoints,
  packBasicUniforms,
  packRgbLutTextureData,
} from "./lightroom-adjustments-cpu";
import { EMPTY_DEVELOP_SETTINGS, isDevelopSettingsDefault, patchDevelopSettings } from "./lightroom-develop-settings";

describe("lightroom-develop-settings", () => {
  it("detects default settings", () => {
    expect(isDevelopSettingsDefault(EMPTY_DEVELOP_SETTINGS)).toBe(true);
    expect(
      isDevelopSettingsDefault(patchDevelopSettings(EMPTY_DEVELOP_SETTINGS, { basic: { exposure: 12 } })),
    ).toBe(false);
  });
});

describe("lightroom-adjustments-cpu", () => {
  it("evaluates curve points", () => {
    expect(evaluateCurvePoints(0.5, [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBeCloseTo(0.5);
    expect(evaluateCurvePoints(0.5, [{ x: 0, y: 0 }, { x: 1, y: 0.8 }])).toBeCloseTo(0.4);
  });

  it("builds master LUT with parametric tone", () => {
    const lut = buildToneCurveLuts({
      ...EMPTY_DEVELOP_SETTINGS.toneCurve,
      paramShadows: 40,
    });
    expect(lut.r[32]).toBeGreaterThan(32);
    const packed = packRgbLutTextureData(lut);
    expect(packed.length).toBe(256 * 4);
  });

  it("paramHighlights compresses bright end of LUT", () => {
    const neutral = buildToneCurveLuts(EMPTY_DEVELOP_SETTINGS.toneCurve);
    const recovered = buildToneCurveLuts({
      ...EMPTY_DEVELOP_SETTINGS.toneCurve,
      paramHighlights: -52,
    });
    expect(recovered.r[240]).toBeLessThan(neutral.r[240]!);
    expect(recovered.r[255]).toBeLessThan(neutral.r[255]!);
  });

  it("applyParametricTone lifts shadows", () => {
    expect(applyParametricTone(0.1, 50, 0, 0, 0)).toBeGreaterThan(0.1);
  });

  it("applyParametricTone compresses highlights", () => {
    expect(applyParametricTone(0.95, 0, 0, 0, -52)).toBeLessThan(0.95);
  });

  it("packs basic uniforms normalized", () => {
    const u = packBasicUniforms({ ...EMPTY_DEVELOP_SETTINGS.basic, exposure: 50 });
    expect(u[2]).toBe(0.5);
  });
});
