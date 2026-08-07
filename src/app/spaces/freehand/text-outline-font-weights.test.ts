import { describe, expect, it } from "vitest";
import { normalizePdfTextAlign, pickClosestFontWeights } from "./text-outline";

describe("pickClosestFontWeights", () => {
  it("prioritizes exact Light (300) over Regular", () => {
    expect(pickClosestFontWeights(300)[0]).toBe(300);
    expect(pickClosestFontWeights(300).slice(0, 3)).toEqual([300, 200, 400]);
  });

  it("keeps Book (450) closer to 400/500 than to 700", () => {
    const order = pickClosestFontWeights(450);
    expect(order[0]).toBe(450);
    expect(order.indexOf(400)).toBeLessThan(order.indexOf(700));
    expect(order.indexOf(500)).toBeLessThan(order.indexOf(700));
  });

  it("prioritizes Black (900) over Bold", () => {
    expect(pickClosestFontWeights(900)[0]).toBe(900);
    expect(pickClosestFontWeights(900).indexOf(900)).toBeLessThan(pickClosestFontWeights(900).indexOf(700));
  });
});

describe("normalizePdfTextAlign", () => {
  it("preserves right/center/justify", () => {
    expect(normalizePdfTextAlign("right")).toBe("right");
    expect(normalizePdfTextAlign("center")).toBe("center");
    expect(normalizePdfTextAlign("justify")).toBe("justify");
    expect(normalizePdfTextAlign("left")).toBe("left");
  });

  it("defaults unknown values to left", () => {
    expect(normalizePdfTextAlign(undefined)).toBe("left");
    expect(normalizePdfTextAlign(null)).toBe("left");
    expect(normalizePdfTextAlign("start")).toBe("left");
  });
});
