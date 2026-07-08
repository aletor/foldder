import { describe, expect, it, vi, beforeEach } from "vitest";
import { PDF_PAGE_RENDER_DEFAULT_DPI } from "@/lib/brain/pdf-page-render";

vi.mock("@/lib/genoma/ingest/genoma-source-pdf-store", () => ({
  loadGenomaSourcePdf: vi.fn(),
}));

vi.mock("@/lib/brain/pdf-page-render", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/brain/pdf-page-render")>();
  return {
    ...actual,
    renderPdfPageCrop: vi.fn(),
  };
});

vi.mock("sharp", () => ({
  default: vi.fn(() => ({
    metadata: vi.fn(async () => ({ width: 400, height: 120 })),
  })),
}));

import { loadGenomaSourcePdf } from "@/lib/genoma/ingest/genoma-source-pdf-store";
import { renderPdfPageCrop } from "@/lib/brain/pdf-page-render";
import {
  resolveHiResLogoRasterForVectorize,
  VECTORIZE_RERASTER_DPI,
} from "@/lib/genoma/ingest/vectorize-hires-raster";

describe("resolveHiResLogoRasterForVectorize", () => {
  beforeEach(() => {
    vi.mocked(loadGenomaSourcePdf).mockReset();
    vi.mocked(renderPdfPageCrop).mockReset();
  });

  it("usa fallback cuando falta vectorSource completo", async () => {
    const fallback = Buffer.from("lowres");
    const out = await resolveHiResLogoRasterForVectorize({
      userEmail: "u@test.com",
      fallbackBuffer: fallback,
    });
    expect(out.source).toBe("fallback_crop");
    expect(out.buffer).toBe(fallback);
    expect(loadGenomaSourcePdf).not.toHaveBeenCalled();
  });

  it("re-rasteriza desde PDF fuente a 600 DPI con bbox escalado", async () => {
    const fallback = Buffer.from("lowres");
    const hiRes = Buffer.from("hires");
    vi.mocked(loadGenomaSourcePdf).mockResolvedValue(Buffer.from("pdf"));
    vi.mocked(renderPdfPageCrop).mockResolvedValue(hiRes);

    const out = await resolveHiResLogoRasterForVectorize({
      userEmail: "u@test.com",
      fallbackBuffer: fallback,
      vectorSource: {
        sourceId: "src-1",
        contentSha256: "abc123",
        pageNumber: 2,
        bbox: { x: 100, y: 50, width: 200, height: 80 },
      },
    });

    expect(out.source).toBe("hi_res_pdf_crop");
    expect(out.buffer).toBe(hiRes);
    expect(out.dpi).toBe(VECTORIZE_RERASTER_DPI);
    expect(loadGenomaSourcePdf).toHaveBeenCalledWith("u@test.com", "abc123");

    const scale = VECTORIZE_RERASTER_DPI / PDF_PAGE_RENDER_DEFAULT_DPI;
    expect(renderPdfPageCrop).toHaveBeenCalledWith(
      expect.any(Buffer),
      2,
      {
        x: Math.round(100 * scale),
        y: Math.round(50 * scale),
        width: Math.round(200 * scale),
        height: Math.round(80 * scale),
      },
      VECTORIZE_RERASTER_DPI,
    );
  });

  it("cae a fallback si el PDF fuente no está en S3", async () => {
    const fallback = Buffer.from("lowres");
    vi.mocked(loadGenomaSourcePdf).mockResolvedValue(null);

    const out = await resolveHiResLogoRasterForVectorize({
      userEmail: "u@test.com",
      fallbackBuffer: fallback,
      vectorSource: {
        sourceId: "src-1",
        contentSha256: "missing",
        pageNumber: 1,
        bbox: { x: 10, y: 10, width: 40, height: 20 },
      },
    });

    expect(out.source).toBe("fallback_crop");
    expect(out.buffer).toBe(fallback);
  });
});
