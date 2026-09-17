import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { clampExtractArea, extractOrientedRegion } from "./oriented-extract";

describe("clampExtractArea", () => {
  it("acota un recorte que se sale 1 px", () => {
    const out = clampExtractArea({ x: 90, y: 0, width: 20, height: 40 }, 100, 40);
    expect(out).toEqual({ x: 90, y: 0, width: 10, height: 40 });
  });

  it("rechaza lienzos minúsculos", () => {
    expect(clampExtractArea({ x: 0, y: 0, width: 8, height: 8 }, 4, 4)).toBeNull();
  });
});

describe("extractOrientedRegion", () => {
  it("recorta con el tamaño ya rotado (EXIF orientation 6)", async () => {
    const stored = await sharp({
      create: { width: 60, height: 40, channels: 3, background: "#336699" },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const result = await extractOrientedRegion(stored, { x: 0, y: 0, width: 40, height: 60 });
    expect(result.fullWidth).toBe(40);
    expect(result.fullHeight).toBe(60);
    expect(result.nativeCrop).toEqual({ x: 0, y: 0, width: 40, height: 60 });
    const meta = await sharp(result.png).metadata();
    expect([meta.width, meta.height]).toEqual([40, 60]);
  });

  it("no lanza extract_area si el recorte se redondea fuera", async () => {
    const png = await sharp({
      create: { width: 100, height: 80, channels: 3, background: "#112233" },
    })
      .png()
      .toBuffer();
    const result = await extractOrientedRegion(png, { x: 92, y: 70, width: 20, height: 20 });
    expect(result.nativeCrop.x + result.nativeCrop.width).toBeLessThanOrEqual(100);
    expect(result.nativeCrop.y + result.nativeCrop.height).toBeLessThanOrEqual(80);
  });
});
