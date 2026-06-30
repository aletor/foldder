import { describe, expect, it } from "vitest";
import {
  textForeignObjectFirstBaselineOffset,
  textForeignObjectLineBaselineY,
} from "./text-foreign-object-baseline";

describe("text-foreign-object-baseline", () => {
  const base = {
    y: 100,
    fontSize: 48,
    lineHeight: 1.25,
    fontFamily: "Arial",
    fontWeight: 700,
    fontStyle: "italic" as const,
    textMode: "area" as const,
  };

  it("approx offset when canvas metrics are unavailable", () => {
    const offset = textForeignObjectFirstBaselineOffset(base);
    expect(offset).toBe(4 + (base.fontSize * (base.lineHeight - 1)) / 2 + base.fontSize * 0.8);
  });

  it("first baseline sits above y + pad + fontSize when line-height > 1", () => {
    const legacy = base.y + 4 + base.fontSize;
    const aligned = textForeignObjectLineBaselineY(base, 0);
    expect(aligned).toBeLessThan(legacy);
  });

  it("advances by line-height pixels per line index", () => {
    const first = textForeignObjectLineBaselineY(base, 0);
    const second = textForeignObjectLineBaselineY(base, 1);
    expect(second - first).toBeCloseTo(base.fontSize * base.lineHeight, 5);
  });
});
