import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  bboxIfCornerFormat,
  expandNormalizedBbox,
  trimRgbaToOpaqueBounds,
  visionBboxCandidates,
  VISION_LOGO_MIN_PIXELS_KEPT_PCT,
} from "./vision-logo-bbox";

describe("vision-logo-bbox", () => {
  it("expande el bbox con margen extra abajo", () => {
    const expanded = expandNormalizedBbox({ x: 0.1, y: 0.1, width: 0.2, height: 0.1 });
    expect(expanded.x).toBeLessThan(0.1);
    expect(expanded.y).toBeLessThan(0.1);
    expect(expanded.width).toBeGreaterThan(0.2);
    expect(expanded.height).toBeGreaterThan(0.12);
  });

  it("no interpreta xywh OARO como corner x1/y1", () => {
    const corner = bboxIfCornerFormat({ x: 0.05, y: 0.03, width: 0.15, height: 0.05 });
    expect(corner).toBeNull();
    expect(visionBboxCandidates({ x: 0.05, y: 0.03, width: 0.15, height: 0.05 })).toHaveLength(1);
  });

  it("interpreta x0,y0,x1,y1 almacenados en width/height", () => {
    const corner = bboxIfCornerFormat({ x: 0.05, y: 0.05, width: 0.35, height: 0.25 });
    expect(corner).toEqual({ x: 0.05, y: 0.05, width: 0.3, height: 0.2 });
  });

  it("genera candidatos expandidos xywh y corner", () => {
    const candidates = visionBboxCandidates({ x: 0.05, y: 0.05, width: 0.35, height: 0.25 });
    expect(candidates.length).toBe(2);
  });

  it("umbral mínimo de píxeles conservados es 2%", () => {
    expect(VISION_LOGO_MIN_PIXELS_KEPT_PCT).toBe(2);
  });

  it("trimRgbaToOpaqueBounds recorta al contenido opaco con padding", async () => {
    const wide = await sharp({
      create: { width: 200, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([
        {
          input: await sharp({
            create: { width: 80, height: 20, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
          })
            .png()
            .toBuffer(),
          left: 40,
          top: 70,
        },
      ])
      .png()
      .toBuffer();

    const trimmed = await trimRgbaToOpaqueBounds(wide, 4);
    const meta = await sharp(trimmed).metadata();
    expect(meta.width).toBeLessThanOrEqual(90);
    expect(meta.height).toBeLessThanOrEqual(30);
    expect((meta.height ?? 0)).toBeLessThan(50);
  });
});
