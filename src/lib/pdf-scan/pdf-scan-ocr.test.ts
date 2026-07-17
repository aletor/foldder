import { describe, expect, it } from "vitest";
import {
  looksLikeScannedPdf,
  pageNeedsOcr,
  parseOcrBlocksJson,
} from "./pdf-scan-ocr-heuristics";
import type { PdfScanTextSpan } from "./pdf-scan-types";

describe("pdf-scan-ocr heuristics", () => {
  it("detects scan-like PDFs with few native spans", () => {
    expect(looksLikeScannedPdf({ pageCount: 3, textSpanCount: 0 })).toBe(true);
    expect(looksLikeScannedPdf({ pageCount: 3, textSpanCount: 2 })).toBe(true);
    expect(looksLikeScannedPdf({ pageCount: 2, textSpanCount: 40 })).toBe(false);
  });

  it("pageNeedsOcr when empty or tiny text", () => {
    expect(pageNeedsOcr([])).toBe(true);
    const tiny: PdfScanTextSpan[] = [
      { id: "a", page: 1, x: 0, y: 0, w: 10, h: 10, text: "ok", fontSize: 12 },
    ];
    expect(pageNeedsOcr(tiny)).toBe(true);
    const rich: PdfScanTextSpan[] = [
      {
        id: "b",
        page: 1,
        x: 0,
        y: 0,
        w: 100,
        h: 20,
        text: "Este párrafo tiene texto nativo suficiente para no disparar OCR.",
        fontSize: 12,
      },
    ];
    expect(pageNeedsOcr(rich)).toBe(false);
  });

  it("parseOcrBlocksJson maps normalized coords to px", () => {
    const spans = parseOcrBlocksJson(
      {
        blocks: [
          { text: "Hola  mundo", x: 0.1, y: 0.2, w: 0.5, h: 0.05 },
          { text: "  ", x: 0, y: 0, w: 0.1, h: 0.1 },
        ],
      },
      1000,
      2000,
    );
    expect(spans).toHaveLength(1);
    expect(spans[0]!.text).toBe("Hola mundo");
    expect(spans[0]!.x).toBeCloseTo(100);
    expect(spans[0]!.y).toBeCloseTo(400);
    expect(spans[0]!.w).toBeCloseTo(500);
  });
});
