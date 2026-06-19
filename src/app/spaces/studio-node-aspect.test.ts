import { describe, expect, it } from "vitest";
import { resolveAspectLockedNodeFrame } from "./studio-node-aspect";

describe("resolveAspectLockedNodeFrame", () => {
  it("sizes preview area to content aspect after chrome (16:9)", () => {
    const chromeHeight = 72;
    const frame = resolveAspectLockedNodeFrame({
      contentWidth: 16,
      contentHeight: 9,
      minWidth: 200,
      maxWidth: 960,
      minHeight: 120,
      maxHeight: 2200,
      chromeHeight,
    });

    const previewHeight = frame.height - chromeHeight;
    const previewRatio = frame.width / previewHeight;
    expect(previewRatio).toBeCloseTo(16 / 9, 2);
  });

  it("respects max height by shrinking width", () => {
    const frame = resolveAspectLockedNodeFrame({
      contentWidth: 16,
      contentHeight: 9,
      minWidth: 200,
      maxWidth: 960,
      minHeight: 120,
      maxHeight: 400,
      chromeHeight: 80,
    });

    expect(frame.height).toBeLessThanOrEqual(400);
    const previewRatio = frame.width / (frame.height - 80);
    expect(previewRatio).toBeCloseTo(16 / 9, 2);
  });
});
