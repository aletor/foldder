import { describe, expect, it } from "vitest";
import {
  SHAPE_CREATION_DEFAULT_COLOR,
  resolvePenClosedFillHex,
  resolveShapeCreationFillHex,
  resolveStrokeOnlyCreationHex,
  resolveStrokeOnlyCreationWidth,
  resolveTextCreationFillHex,
} from "./shape-creation-colors";

describe("shape-creation-colors", () => {
  it("uses dark gray fill for shapes when both swatches are empty", () => {
    expect(resolveShapeCreationFillHex("none", "none", 2)).toBe(SHAPE_CREATION_DEFAULT_COLOR);
    expect(resolveShapeCreationFillHex("none", "none", 0)).toBe(SHAPE_CREATION_DEFAULT_COLOR);
  });

  it("keeps hollow shapes when only fill is empty", () => {
    expect(resolveShapeCreationFillHex("none", "#ff0000", 2)).toBe("none");
  });

  it("uses stroke gray for pen/line when both swatches are empty", () => {
    expect(resolveStrokeOnlyCreationHex("none", "none", 2)).toBe(SHAPE_CREATION_DEFAULT_COLOR);
    expect(resolveStrokeOnlyCreationWidth("none", 0)).toBe(2);
  });

  it("falls back to fill color for stroke-only tools when stroke is empty", () => {
    expect(resolveStrokeOnlyCreationHex("#aabbcc", "none", 2)).toBe("#aabbcc");
  });

  it("does not apply default gray fill on closed pen paths", () => {
    expect(resolvePenClosedFillHex("none")).toBe("none");
    expect(resolvePenClosedFillHex("#aabbcc")).toBe("#aabbcc");
  });

  it("matches text creation fallback rules", () => {
    expect(resolveTextCreationFillHex("none", "none", 2)).toBe(SHAPE_CREATION_DEFAULT_COLOR);
    expect(resolveTextCreationFillHex("none", "#ff0000", 2)).toBe("#ff0000");
    expect(resolveTextCreationFillHex("#00ff00", "none", 2)).toBe("#00ff00");
  });
});
