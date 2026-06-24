import { describe, expect, it } from "vitest";
import {
  buildMultiRectMask,
  expandRect,
  scaleSelectionsToCanvas,
  snapRectToPixels,
  unionSelectionBounds,
} from "@/lib/designer/generative-fill/mask";
import sharp from "sharp";

describe("generative-fill mask", () => {
  it("unionSelectionBounds wraps disjoint rects", () => {
    const u = unionSelectionBounds([
      { x: 10, y: 10, w: 20, h: 20 },
      { x: 200, y: 50, w: 30, h: 40 },
    ]);
    expect(u).toEqual({ x: 10, y: 10, w: 220, h: 80 });
  });

  it("buildMultiRectMask paints two white regions", async () => {
    const mask = await buildMultiRectMask(300, 200, [
      { x: 10, y: 10, w: 20, h: 20 },
      { x: 100, y: 80, w: 15, h: 15 },
    ]);
    const { data, info } = await sharp(mask).raw().toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(300);
    expect(info.height).toBe(200);
    const idxA = (10 * 300 + 10) * info.channels;
    const idxGap = (50 * 300 + 50) * info.channels;
    const idxB = (85 * 300 + 105) * info.channels;
    expect(data[idxA]).toBeGreaterThan(200);
    expect(data[idxGap]).toBeLessThan(20);
    expect(data[idxB]).toBeGreaterThan(200);
  });

  it("expandRect pads within canvas", () => {
    const e = expandRect({ x: 50, y: 50, w: 100, h: 80 }, 10, 400, 300);
    expect(e).toEqual({ x: 40, y: 40, w: 120, h: 100 });
  });

  it("scaleSelectionsToCanvas maps page coords to composite pixels", () => {
    const scaled = scaleSelectionsToCanvas(
      [{ x: 100, y: 50, w: 400, h: 900 }],
      1920,
      1080,
      3840,
      2160,
    );
    expect(scaled[0]).toEqual({ x: 200, y: 100, w: 800, h: 1800 });
  });

  it("scaleSelectionsToCanvas returns integer rects for sharp", () => {
    const scaled = scaleSelectionsToCanvas(
      [{ x: 100, y: 50, w: 333, h: 777 }],
      1920,
      1080,
      1921,
      1081,
    );
    for (const r of scaled) {
      expect(Number.isInteger(r.x)).toBe(true);
      expect(Number.isInteger(r.y)).toBe(true);
      expect(Number.isInteger(r.w)).toBe(true);
      expect(Number.isInteger(r.h)).toBe(true);
    }
  });

  it("snapRectToPixels rounds fractional dimensions", () => {
    expect(snapRectToPixels({ x: 10.2, y: 5.8, w: 459.40182054616383, h: 900.6 })).toEqual({
      x: 10,
      y: 6,
      w: 459,
      h: 901,
    });
  });
});
