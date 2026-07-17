import { describe, expect, it } from "vitest";
import { imageBBoxFromCtm, rotationDegFromCtm } from "./pdf-document-images";
import { buildDesignerPagesFromPdfDocument } from "@/app/spaces/pdf-scan/pdf-scan-to-designer";
import type { PdfDocumentLayoutOutput } from "./pdf-scan-types";

describe("pdf document image CTM math", () => {
  it("maps unit square through translate+scale CTM to page bbox", () => {
    const ctm = [100, 0, 0, 50, 10, 20];
    const box = imageBBoxFromCtm(ctm);
    expect(box.x1).toBeCloseTo(10);
    expect(box.y1).toBeCloseTo(20);
    expect(box.x2).toBeCloseTo(110);
    expect(box.y2).toBeCloseTo(70);
  });

  it("reads rotation from CTM", () => {
    const deg = rotationDegFromCtm([0, 1, -1, 0, 0, 0]);
    expect(Math.abs(Math.abs(deg) - 90)).toBeLessThan(0.2);
  });
});

describe("document clip → Designer", () => {
  it("emits clippingContainer with mask + content", () => {
    const output: PdfDocumentLayoutOutput = {
      kind: "pdf_document_layout",
      jobId: "j",
      mode: "document",
      dpi: 150,
      pageCount: 1,
      fidelity: {
        mode: "document",
        textFieldCount: 0,
        pathCount: 2,
        imageLayerCount: 0,
        fontsMissing: [],
        notes: [],
      },
      pages: [
        {
          pageNumber: 1,
          widthPx: 400,
          heightPx: 600,
          widthPt: 200,
          heightPt: 300,
          objects: [
            {
              type: "clip",
              id: "clip1",
              maskD: "M 0 0 L 100 0 L 100 80 Z",
              maskX: 10,
              maskY: 20,
              maskW: 100,
              maskH: 80,
              content: [
                {
                  type: "path",
                  id: "c1",
                  d: "M 0 0 L 50 0 L 50 40 Z",
                  x: 20,
                  y: 30,
                  w: 50,
                  h: 40,
                  fill: "#00ff00",
                  stroke: "none",
                  strokeWidth: 0,
                },
              ],
            },
          ],
        },
      ],
    };
    const pages = buildDesignerPagesFromPdfDocument(output, "p");
    expect(pages[0]!.objects?.[0]).toMatchObject({ type: "clippingContainer" });
  });

  it("emits groupContainer for transparency groups", () => {
    const output: PdfDocumentLayoutOutput = {
      kind: "pdf_document_layout",
      jobId: "j2",
      mode: "document",
      dpi: 150,
      pageCount: 1,
      fidelity: {
        mode: "document",
        textFieldCount: 0,
        pathCount: 1,
        imageLayerCount: 0,
        groupCount: 1,
        softMaskHits: 0,
        fontsMissing: [],
        notes: [],
      },
      pages: [
        {
          pageNumber: 1,
          widthPx: 400,
          heightPx: 600,
          widthPt: 200,
          heightPt: 300,
          objects: [
            {
              type: "group",
              id: "g1",
              kind: "transparency",
              opacity: 0.8,
              blendMode: "multiply",
              children: [
                {
                  type: "path",
                  id: "gp1",
                  d: "M 0 0 L 40 0 L 40 20 Z",
                  x: 10,
                  y: 10,
                  w: 40,
                  h: 20,
                  fill: "#0000ff",
                  stroke: "none",
                  strokeWidth: 0,
                },
              ],
            },
          ],
        },
      ],
    };
    const pages = buildDesignerPagesFromPdfDocument(output, "p");
    expect(pages[0]!.objects?.[0]).toMatchObject({ type: "groupContainer", blendMode: "multiply" });
  });

  it("emits groupContainer with nested image children", () => {
    const output: PdfDocumentLayoutOutput = {
      kind: "pdf_document_layout",
      jobId: "j3",
      mode: "document",
      dpi: 150,
      pageCount: 1,
      fidelity: {
        mode: "document",
        textFieldCount: 0,
        pathCount: 0,
        imageLayerCount: 1,
        groupCount: 1,
        fontsMissing: [],
        notes: [],
      },
      pages: [
        {
          pageNumber: 1,
          widthPx: 400,
          heightPx: 600,
          widthPt: 200,
          heightPt: 300,
          objects: [
            {
              type: "group",
              id: "p1_g1",
              kind: "form",
              children: [
                {
                  type: "image",
                  id: "img1",
                  src: "data:image/png;base64,xx",
                  x: 20,
                  y: 30,
                  w: 80,
                  h: 60,
                },
              ],
            },
          ],
        },
      ],
    };
    const pages = buildDesignerPagesFromPdfDocument(output, "p");
    const group = pages[0]!.objects?.[0] as { type?: string; children?: Array<{ type?: string }> };
    expect(group).toMatchObject({ type: "groupContainer" });
    expect(group.children?.[0]).toMatchObject({ type: "image" });
  });

  it("emits layerMask on softmask groupContainer", () => {
    const output: PdfDocumentLayoutOutput = {
      kind: "pdf_document_layout",
      jobId: "j4",
      mode: "document",
      dpi: 150,
      pageCount: 1,
      fidelity: {
        mode: "document",
        textFieldCount: 0,
        pathCount: 1,
        imageLayerCount: 0,
        groupCount: 1,
        fontsMissing: [],
        notes: [],
      },
      pages: [
        {
          pageNumber: 1,
          widthPx: 200,
          heightPx: 200,
          widthPt: 100,
          heightPt: 100,
          objects: [
            {
              type: "group",
              id: "sm1",
              kind: "softmask",
              softMask: true,
              layerMask: {
                src: "https://example.com/mask.png",
                pixelW: 40,
                pixelH: 40,
                subtype: "Luminosity",
              },
              children: [
                {
                  type: "path",
                  id: "p1",
                  d: "M 0 0 L 40 0 L 40 40 Z",
                  x: 10,
                  y: 10,
                  w: 40,
                  h: 40,
                  fill: "#111",
                  stroke: "none",
                  strokeWidth: 0,
                },
              ],
            },
          ],
        },
      ],
    };
    const pages = buildDesignerPagesFromPdfDocument(output, "p");
    expect(pages[0]!.objects?.[0]).toMatchObject({
      type: "groupContainer",
      layerMask: { src: "https://example.com/mask.png", pixelW: 40, pixelH: 40, enabled: true },
    });
  });
});
