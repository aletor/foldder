import { describe, expect, it } from "vitest";
import { librawRgbToImageData, librawRgbToLinearFloat, normalizeLinearScenePeak, scale16To8 } from "./lightroom-canvas";

function installImageDataMock(): () => void {
  const original = globalThis.ImageData;
  class MockImageData {
    width: number;
    height: number;
    data: Uint8ClampedArray;
    colorSpace = "srgb";

    constructor(data: Uint8ClampedArray, width: number, height?: number) {
      this.data = data;
      this.width = width;
      this.height = height ?? Math.floor(data.length / (4 * width));
    }
  }
  globalThis.ImageData = MockImageData as unknown as typeof ImageData;
  return () => {
    globalThis.ImageData = original;
  };
}

describe("lightroom-canvas", () => {
  it("scale16To8 maps 16-bit to 8-bit", () => {
    expect(scale16To8(0)).toBe(0);
    expect(scale16To8(256)).toBe(1);
    expect(scale16To8(65535)).toBe(255);
  });

  it("librawRgbToImageData packs RGB8 into RGBA", () => {
    const width = 2;
    const height = 1;
    const data = new Uint8Array([255, 0, 0, 0, 255, 0]);
    const restore = installImageDataMock();
    try {
      const imageData = librawRgbToImageData({
        width,
        height,
        colors: 3,
        bits: 8,
        data,
      });
      expect(imageData.width).toBe(2);
      expect(imageData.height).toBe(1);
      expect(Array.from(imageData.data.slice(0, 4))).toEqual([255, 0, 0, 255]);
      expect(Array.from(imageData.data.slice(4, 8))).toEqual([0, 255, 0, 255]);
    } finally {
      restore();
    }
  });

  it("librawRgbToImageData scales RGB16", () => {
    const restore = installImageDataMock();
    try {
      const imageData = librawRgbToImageData({
        width: 1,
        height: 1,
        colors: 3,
        bits: 16,
        data: new Uint16Array([512, 1024, 2048]),
      });
      expect(Array.from(imageData.data.slice(0, 3))).toEqual([2, 4, 8]);
      expect(imageData.data[3]).toBe(255);
    } finally {
      restore();
    }
  });

  it("librawRgbToLinearFloat maps 16-bit without 8-bit clip", () => {
    const { data, width, height } = librawRgbToLinearFloat({
      width: 1,
      height: 1,
      colors: 3,
      bits: 16,
      data: new Uint16Array([65535, 40000, 20000]),
    });
    expect(width).toBe(1);
    expect(height).toBe(1);
    expect(data[0]).toBeCloseTo(1.0, 3);
    expect(data[1]).toBeCloseTo(40000 / 65535, 3);
    expect(data[2]).toBeCloseTo(20000 / 65535, 3);
    expect(data[3]).toBe(1);
  });

  it("normalizeLinearScenePeak scales brightest channel to target", () => {
    const rgba = new Float32Array([0.1, 0.2, 0.05, 1, 0.5, 0.25, 0.125, 1]);
    normalizeLinearScenePeak(rgba, 1.0);
    expect(rgba[4]).toBeCloseTo(1.0, 4);
    expect(rgba[0]).toBeCloseTo(0.2, 4);
  });

  it("librawRgbToLinearFloat optional white level scale", () => {
    const { data } = librawRgbToLinearFloat(
      {
        width: 1,
        height: 1,
        colors: 3,
        bits: 16,
        data: new Uint16Array([4096, 2048, 1024]),
      },
      { whiteLevel: 4096 },
    );
    expect(data[0]).toBeCloseTo(1, 3);
    expect(data[1]).toBeCloseTo(0.5, 3);
    expect(data[2]).toBeCloseTo(0.25, 3);
  });
});
