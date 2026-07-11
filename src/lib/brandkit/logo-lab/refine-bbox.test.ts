import { describe, expect, it } from "vitest";
import { isRefinedBBoxPlausible } from "./refine-bbox";

describe("isRefinedBBoxPlausible", () => {
  it("rechaza uniones que cubren casi todo el footer", () => {
    const seed = [0.808, 0.864, 0.949, 0.894] as const;
    const huge = [0, 0.82, 1, 0.98] as const;
    expect(isRefinedBBoxPlausible(seed, huge)).toBe(false);
  });

  it("acepta un snap compacto cerca de la semilla", () => {
    const seed = [0.808, 0.864, 0.949, 0.894] as const;
    const tight = [0.805, 0.862, 0.952, 0.896] as const;
    expect(isRefinedBBoxPlausible(seed, tight)).toBe(true);
  });
});
