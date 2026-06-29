import { describe, expect, it } from "vitest";
import { parseCubeLut, sampleCubeLut3d } from "./lightroom-cube-lut";

const MINI_CUBE = `TITLE "test"
LUT_3D_SIZE 2
0 0 0
1 0 0
0 1 0
1 1 0
0 0 1
1 0 1
0 1 1
1 1 1
`;

describe("lightroom-cube-lut", () => {
  it("parses LUT_3D_SIZE and rgb triplets", () => {
    const lut = parseCubeLut(MINI_CUBE, "test.cube");
    expect(lut.size).toBe(2);
    expect(lut.rgb.length).toBe(2 * 2 * 2 * 3);
    expect(lut.name).toBe("test");
  });

  it("sampleCubeLut3d returns corners", () => {
    const lut = parseCubeLut(MINI_CUBE);
    const black = sampleCubeLut3d(lut, 0, 0, 0);
    const white = sampleCubeLut3d(lut, 1, 1, 1);
    expect(black[0]).toBeCloseTo(0, 2);
    expect(white[0]).toBeCloseTo(1, 2);
    expect(white[2]).toBeCloseTo(1, 2);
  });
});
