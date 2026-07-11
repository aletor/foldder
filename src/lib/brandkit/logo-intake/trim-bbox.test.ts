import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { trimBBoxPageFromPage } from "@/lib/brandkit/logo-intake/crop";

describe("trimBBoxPageFromPage", () => {
  it("reduce bbox cuando hay margen uniforme alrededor del contenido", async () => {
    const pageWidth = 400;
    const pageHeight = 200;
    const logo = await sharp({
      create: {
        width: 80,
        height: 40,
        channels: 4,
        background: { r: 20, g: 40, b: 200, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const pagePng = await sharp({
      create: {
        width: pageWidth,
        height: pageHeight,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite([{ input: logo, left: 120, top: 60 }])
      .png()
      .toBuffer();

    const loose: [number, number, number, number] = [0.25, 0.2, 0.55, 0.7];
    const { bboxPage, trimmed } = await trimBBoxPageFromPage({
      pagePng,
      pageWidth,
      pageHeight,
      bboxPage: loose,
    });

    expect(trimmed).toBe(true);
    expect(bboxPage[2] - bboxPage[0]).toBeLessThan(loose[2] - loose[0]);
    expect(bboxPage[3] - bboxPage[1]).toBeLessThan(loose[3] - loose[1]);
  });
});
