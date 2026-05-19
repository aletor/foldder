import { describe, expect, it } from "vitest";

import {
  canvasToMasterPoint,
  computeContainedImageRect,
  isValidClosedLasso,
  masterBoxToCanvasBox,
  masterToCanvasPoint,
} from "./canvas-coordinate";

describe("advanced-image-canvas-coordinate", () => {
  it("computes the rendered image rect for object-contain layouts", () => {
    expect(computeContainedImageRect({ height: 800, width: 1200 }, { height: 1000, width: 1000 })).toEqual({
      height: 800,
      width: 800,
      x: 200,
      y: 0,
    });
  });

  it("converts points between canvas and immutable master coordinates", () => {
    const rect = { height: 500, width: 1000, x: 100, y: 50 };
    const master = { height: 1000, width: 2000 };
    const canvas = masterToCanvasPoint({ x: 1000, y: 500 }, rect, master);
    expect(canvas).toEqual({ x: 600, y: 300 });
    expect(canvasToMasterPoint(canvas, rect, master)).toEqual({ x: 1000, y: 500 });
  });

  it("keeps boxes stable through resize by deriving canvas geometry from master geometry", () => {
    const master = { height: 1000, width: 2000 };
    const box = { height: 100, width: 400, x: 800, y: 300 };

    expect(masterBoxToCanvasBox(box, { height: 500, width: 1000, x: 0, y: 0 }, master)).toEqual({
      height: 50,
      width: 200,
      x: 400,
      y: 150,
    });
    expect(masterBoxToCanvasBox(box, { height: 250, width: 500, x: 20, y: 10 }, master)).toEqual({
      height: 25,
      width: 100,
      x: 220,
      y: 85,
    });
  });

  it("validates freehand lasso minimum points and bbox", () => {
    const tiny = Array.from({ length: 20 }, (_, index) => ({ x: 10 + index * 0.5, y: 10 + index * 0.5 }));
    const valid = Array.from({ length: 24 }, (_, index) => ({
      x: index < 12 ? index * 10 : 110 - (index - 12) * 10,
      y: index < 12 ? 0 : 80,
    }));

    expect(isValidClosedLasso(tiny)).toBe(false);
    expect(isValidClosedLasso(valid)).toBe(true);
    expect(isValidClosedLasso(valid.slice(0, 10))).toBe(false);
  });
});
