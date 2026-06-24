import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { fillMaskedFromNearestBoundary, maskedRegionMostlyWhite } from "./prefill";

async function makeScene(w: number, h: number): Promise<{ rgb: Buffer; mask: Buffer }> {
  const rgb = await sharp({
    create: { width: w, height: h, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite([
      {
        input: {
          create: { width: 120, height: h, channels: 3, background: { r: 20, g: 120, b: 40 } },
        },
        left: 120,
        top: 0,
      },
    ])
    .png()
    .toBuffer();

  const mask = await sharp({
    create: { width: w, height: h, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite([
      {
        input: {
          create: { width: 120, height: h, channels: 3, background: { r: 255, g: 255, b: 255 } },
        },
        left: 0,
        top: 0,
      },
    ])
    .grayscale()
    .png()
    .toBuffer();

  return { rgb, mask };
}

describe("generative-fill prefill", () => {
  it("fills white margin from adjacent green background", async () => {
    const w = 240;
    const h = 80;
    const { rgb, mask } = await makeScene(w, h);
    const { rgb: filled, filledRatio } = await fillMaskedFromNearestBoundary(rgb, mask, w, h);
    expect(filledRatio).toBeGreaterThan(0.99);

    const { data } = await sharp(filled).raw().toBuffer({ resolveWithObject: true });
    const idx = (40 * w + 10) * 3;
    expect(data[idx]).toBe(20);
    expect(data[idx + 1]).toBe(120);
    expect(data[idx + 2]).toBe(40);
  });

  it("detects mostly white masked regions", async () => {
    const w = 240;
    const h = 80;
    const { rgb, mask } = await makeScene(w, h);
    expect(await maskedRegionMostlyWhite(rgb, mask, w, h)).toBe(true);
  });
});
