import { describe, expect, it, vi, beforeEach } from "vitest";
import sharp from "sharp";
import { harvestLogoFromVisionHint } from "./logo-vision-harvest";
import { renderPdfPageCrop } from "@/lib/brain/pdf-page-render";
import type { RenderedPdfPage } from "@/lib/brain/pdf-page-render";

vi.mock("@/lib/brain/pdf-page-render", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/brain/pdf-page-render")>();
  return {
    ...actual,
    renderPdfPageCrop: vi.fn(async (_buf, _page, bbox) => {
      return sharp({
        create: {
          width: Math.max(40, bbox.width),
          height: Math.max(20, bbox.height),
          channels: 3,
          background: { r: 24, g: 36, b: 120 },
        },
      })
        .composite([
          {
            input: await sharp({
              create: {
                width: Math.max(20, Math.floor(bbox.width * 0.6)),
                height: Math.max(8, Math.floor(bbox.height * 0.5)),
                channels: 4,
                background: { r: 255, g: 255, b: 255, alpha: 1 },
              },
            })
              .png()
              .toBuffer(),
            left: 4,
            top: 4,
          },
        ])
        .png()
        .toBuffer();
    }),
  };
});

describe("harvestLogoFromVisionHint", () => {
  beforeEach(() => {
    vi.mocked(renderPdfPageCrop).mockImplementation(async (_buf, _page, bbox) => {
      return sharp({
        create: {
          width: Math.max(40, bbox.width),
          height: Math.max(20, bbox.height),
          channels: 3,
          background: { r: 24, g: 36, b: 120 },
        },
      })
        .composite([
          {
            input: await sharp({
              create: {
                width: Math.max(20, Math.floor(bbox.width * 0.6)),
                height: Math.max(8, Math.floor(bbox.height * 0.5)),
                channels: 4,
                background: { r: 255, g: 255, b: 255, alpha: 1 },
              },
            })
              .png()
              .toBuffer(),
            left: 4,
            top: 4,
          },
        ])
        .png()
        .toBuffer();
    });
  });

  it("logo claro sobre fondo oscuro — no vacío", async () => {
    const pagePng = await sharp({
      create: { width: 400, height: 300, channels: 3, background: { r: 24, g: 36, b: 120 } },
    })
      .png()
      .toBuffer();

    const pages: RenderedPdfPage[] = [
      {
        pageNumber: 1,
        width: 400,
        height: 300,
        pngBuffer: pagePng,
        originalWidthPt: 400,
        originalHeightPt: 300,
      },
    ];

    const harvested = await harvestLogoFromVisionHint(
      pages,
      Buffer.from("fake-pdf"),
      {
        page: 1,
        bbox: { x: 0.05, y: 0.05, width: 0.25, height: 0.15 },
        polarity: "light_mark",
        isEmitterLogo: true,
      },
      { paletteDarkHex: "#183078" },
    );

    expect(harvested.length).toBeGreaterThan(0);
    expect(harvested[0]?.variant).toBe("negative");
    expect(harvested[0]?.buffer.length).toBeGreaterThan(100);
    const meta = await sharp(harvested[0]!.buffer).metadata();
    expect((meta.width ?? 0)).toBeGreaterThan(10);
  });

  it("rechaza bbox vacío cuando el keying no conserva píxeles", async () => {
    vi.mocked(renderPdfPageCrop).mockImplementation(async (_buf, _page, bbox) =>
      sharp({
        create: {
          width: Math.max(40, bbox.width),
          height: Math.max(20, bbox.height),
          channels: 3,
          background: { r: 24, g: 36, b: 120 },
        },
      })
        .png()
        .toBuffer(),
    );
    const pagePng = await sharp({
      create: { width: 400, height: 300, channels: 3, background: { r: 24, g: 36, b: 120 } },
    })
      .png()
      .toBuffer();

    const pages: RenderedPdfPage[] = [
      {
        pageNumber: 1,
        width: 400,
        height: 300,
        pngBuffer: pagePng,
        originalWidthPt: 400,
        originalHeightPt: 300,
      },
    ];

    const harvested = await harvestLogoFromVisionHint(
      pages,
      Buffer.from("fake-pdf"),
      {
        page: 1,
        bbox: { x: 0.05, y: 0.03, width: 0.1, height: 0.05 },
        polarity: "light_mark",
        isEmitterLogo: true,
      },
    );

    expect(harvested).toHaveLength(0);
  });
});
