import { describe, expect, it, vi } from "vitest";

vi.mock("sharp", () => ({
  default: vi.fn(() => ({
    rotate: vi.fn(() => ({
      png: vi.fn(() => ({
        toBuffer: vi.fn(async () => Buffer.from("png-page")),
      })),
    })),
    metadata: vi.fn(async () => ({ width: 800, height: 600 })),
  })),
}));

vi.mock("@/lib/brain/pdf-page-render", () => ({
  renderPdfPagesAt: vi.fn(async () => [
    { pageNumber: 1, pngBuffer: Buffer.from("pdf-page"), width: 1200, height: 900 },
  ]),
}));

import { buildLogoAdjustPagePayload } from "./brand-kit-logo-adjust-page";

describe("buildLogoAdjustPagePayload", () => {
  it("renders raster brand board as single page", async () => {
    const payload = await buildLogoAdjustPagePayload({
      source: { buffer: Buffer.from("jpeg-bytes"), kind: "raster" },
      pageNumber: 1,
      bboxPage: [0.1, 0.1, 0.4, 0.3],
    });

    expect(payload.sourceKind).toBe("raster");
    expect(payload.width).toBe(800);
    expect(payload.page).toBe(1);
  });

  it("renders pdf page by number", async () => {
    const payload = await buildLogoAdjustPagePayload({
      source: { buffer: Buffer.from("%PDF"), kind: "pdf" },
      pageNumber: 2,
      bboxPage: [0.1, 0.1, 0.4, 0.3],
    });

    expect(payload.sourceKind).toBe("pdf");
    expect(payload.width).toBe(1200);
    expect(payload.page).toBe(2);
  });
});
