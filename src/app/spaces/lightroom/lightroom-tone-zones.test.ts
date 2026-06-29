import { describe, expect, it } from "vitest";
import { applyToneZonesLinear, zoneWeight } from "./lightroom-tone-zones";

const M = 2.5;

describe("lightroom-tone-zones", () => {
  it("zoneWeight peaks in expected luminance bands", () => {
    expect(zoneWeight(0.02 * M, M, "blacks")).toBeGreaterThan(0.5);
    expect(zoneWeight(0.25 * M, M, "shadows")).toBeGreaterThan(0.5);
    expect(zoneWeight(0.9 * M, M, "highlights")).toBeGreaterThan(0.5);
    expect(zoneWeight(0.95 * M, M, "whites")).toBeGreaterThan(0.5);
  });

  it("negative highlights compress bright pixels", () => {
    const bright: [number, number, number] = [2.0, 2.0, 2.0];
    const [r] = applyToneZonesLinear(...bright, M, -50, 0, 0, 0);
    expect(r).toBeLessThan(bright[0]);
    expect(r).toBeGreaterThan(0.5);
  });

  it("positive shadows lift dark pixels", () => {
    const dark: [number, number, number] = [0.05, 0.05, 0.05];
    const [r] = applyToneZonesLinear(...dark, M, 0, 40, 0, 0);
    expect(r).toBeGreaterThan(dark[0]);
  });

  it("preserves non-negative channels", () => {
    const [r, g, b] = applyToneZonesLinear(0.1, 0.2, 0.3, M, -80, 60, 20, -15);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(g).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThanOrEqual(0);
  });
});
