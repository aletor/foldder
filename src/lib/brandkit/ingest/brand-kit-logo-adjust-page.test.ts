import { describe, expect, it, vi } from "vitest";

vi.mock("sharp", () => {
  const chain = {
    rotate: vi.fn(() => chain),
    png: vi.fn(() => chain),
    jpeg: vi.fn(() => chain),
    toBuffer: vi.fn(async () => Buffer.from("encoded")),
    metadata: vi.fn(async () => ({ width: 1000, height: 800 })),
  };
  return { default: vi.fn(() => chain) };
});

vi.mock("@/lib/brain/pdf-page-render", () => ({
  renderPdfPagesAt: vi.fn(async () => [
    { pageNumber: 1, pngBuffer: Buffer.from("pdf-page"), width: 1200, height: 900 },
  ]),
}));

vi.mock("@/lib/brandkit/ingest/brand-kit-source-pdf-store", () => ({
  loadBrandKitLogoAdjustPageCache: vi.fn(async () => null),
  persistBrandKitLogoAdjustPageCache: vi.fn(async () => undefined),
}));

import { buildLogoAdjustPagePayload } from "./brand-kit-logo-adjust-page";

describe("buildLogoAdjustPagePayload", () => {
  it("renders raster brand board as single page jpeg", async () => {
    const payload = await buildLogoAdjustPagePayload({
      source: { buffer: Buffer.from("jpeg-bytes"), kind: "raster" },
      pageNumber: 1,
      bboxPage: [0.1, 0.1, 0.4, 0.3],
    });

    expect(payload.sourceKind).toBe("raster");
    expect(payload.mime).toBe("image/jpeg");
    expect(payload.width).toBe(1000);
    expect(payload.page).toBe(1);
  });

  it("renders pdf page by number as jpeg", async () => {
    const payload = await buildLogoAdjustPagePayload({
      source: { buffer: Buffer.from("%PDF"), kind: "pdf" },
      pageNumber: 2,
      bboxPage: [0.1, 0.1, 0.4, 0.3],
    });

    expect(payload.sourceKind).toBe("pdf");
    expect(payload.mime).toBe("image/jpeg");
    expect(payload.width).toBe(1000);
    expect(payload.page).toBe(2);
  });
});
