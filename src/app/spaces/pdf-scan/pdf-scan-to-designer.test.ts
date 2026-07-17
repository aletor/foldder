import { describe, expect, it } from "vitest";
import type {
  PdfDocumentLayoutOutput,
  PdfScanImageAsset,
  PdfScanLayoutOutput,
} from "@/lib/pdf-scan/pdf-scan-types";
import {
  isPdfDocumentLayoutOutput,
  isPdfScanAnyLayoutOutput,
  isPdfScanLayoutOutput,
} from "@/lib/pdf-scan/pdf-scan-types";
import {
  buildDesignerPagesFromPdfDocument,
  buildDesignerPagesFromPdfScan,
  buildMediaListFromPdfScanImages,
} from "./pdf-scan-to-designer";

const sampleTexts: PdfScanLayoutOutput = {
  kind: "pdf_scan_layout",
  jobId: "job_1",
  mode: "texts",
  dpi: 150,
  pageCount: 1,
  pages: [
    {
      pageNumber: 1,
      widthPx: 800,
      heightPx: 1100,
      widthPt: 400,
      heightPt: 550,
      backgroundUrl: "https://example.com/bg.png",
      backgroundS3Key: "bg.png",
      textSpans: [
        {
          id: "t1",
          page: 1,
          text: "Hola",
          x: 40,
          y: 60,
          w: 120,
          h: 24,
          fontSize: 18,
        },
      ],
    },
  ],
};

const sampleDocument: PdfDocumentLayoutOutput = {
  kind: "pdf_document_layout",
  jobId: "job_2",
  mode: "document",
  dpi: 150,
  pageCount: 1,
  fidelity: {
    mode: "document",
    textFieldCount: 1,
    pathCount: 1,
    imageLayerCount: 0,
    fontsMissing: [],
    notes: [],
  },
  pages: [
    {
      pageNumber: 1,
      widthPx: 800,
      heightPx: 1100,
      widthPt: 400,
      heightPt: 550,
      objects: [
        {
          type: "path",
          id: "p1",
          d: "M 10 10 L 100 10 L 100 50 Z",
          x: 10,
          y: 10,
          w: 90,
          h: 40,
          fill: "#ff0000",
          stroke: "none",
          strokeWidth: 0,
        },
        {
          type: "text",
          id: "t1",
          text: "Editable",
          x: 20,
          y: 80,
          w: 200,
          h: 30,
          fontSize: 16,
        },
      ],
    },
  ],
};

describe("pdf-scan-to-designer", () => {
  it("recognizes both layout kinds", () => {
    expect(isPdfScanLayoutOutput(sampleTexts)).toBe(true);
    expect(isPdfDocumentLayoutOutput(sampleDocument)).toBe(true);
    expect(isPdfScanAnyLayoutOutput(sampleDocument)).toBe(true);
    expect(isPdfScanLayoutOutput({ jobId: "x", background: { url: "u" } })).toBe(false);
  });

  it("builds texts mode pages with locked background", () => {
    const pages = buildDesignerPagesFromPdfScan(sampleTexts, "pref");
    expect(pages).toHaveLength(1);
    expect(pages[0].objects?.[0]).toMatchObject({ type: "image", locked: true });
    expect(pages[0].objects?.[1]).toMatchObject({ type: "text", text: "Hola" });
  });

  it("builds document mode pages with path + text, no full-bleed bg", () => {
    const pages = buildDesignerPagesFromPdfDocument(sampleDocument, "pref");
    expect(pages).toHaveLength(1);
    // Triángulo → path local + intrínsecos (no rect)
    expect(pages[0].objects?.[0]).toMatchObject({
      type: "path",
      closed: true,
      svgPathIntrinsicW: 90,
      svgPathIntrinsicH: 40,
    });
    expect(pages[0].objects?.[1]).toMatchObject({ type: "text", text: "Editable", locked: false });
  });

  it("emits Freehand rect for axis-aligned filled backgrounds", () => {
    const output: PdfDocumentLayoutOutput = {
      ...sampleDocument,
      jobId: "job_rect",
      pages: [
        {
          pageNumber: 1,
          widthPx: 300,
          heightPx: 200,
          widthPt: 300,
          heightPt: 200,
          objects: [
            {
              type: "path",
              id: "bg",
              d: "M 0 0 L 300 0 L 300 200 L 0 200 Z",
              x: 0,
              y: 0,
              w: 300,
              h: 200,
              fill: "#0d408c",
              stroke: "none",
              strokeWidth: 0,
            },
          ],
        },
      ],
    };
    const pages = buildDesignerPagesFromPdfDocument(output, "r");
    expect(pages[0]!.objects?.[0]).toMatchObject({
      type: "rect",
      x: 0,
      y: 0,
      width: 300,
      height: 200,
    });
  });

  it("builds media_list from extracted images", () => {
    const images: PdfScanImageAsset[] = [
      {
        id: "img1",
        page: 1,
        width: 100,
        height: 80,
        thumbUrl: "https://example.com/t.png",
        url: "https://example.com/i.png",
        s3Key: "i.png",
        contentHash: "abc",
      },
    ];
    const list = buildMediaListFromPdfScanImages({
      nodeId: "n1",
      jobId: "job_1",
      title: "doc.pdf",
      images,
    });
    expect(list.kind).toBe("media_list");
    expect(list.sourceNodeType).toBe("pdfScan");
    expect(list.items).toHaveLength(1);
  });
});
