import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  applyFallbackObjects,
  approxSsimLuma,
  documentObjectsToSvg,
  findHighErrorTiles,
  meanAbsErrorRgb,
  mergeFidelityBoxes,
  softMaskGroupBoxes,
  stripInvalidXmlChars,
} from "./pdf-document-fidelity";
import type { PdfDocumentObject } from "./pdf-scan-types";
import { buildDesignerPagesFromPdfDocument } from "@/app/spaces/pdf-scan/pdf-scan-to-designer";
import type { PdfDocumentLayoutOutput } from "./pdf-scan-types";

async function solidRgba(color: { r: number; g: number; b: number }, w = 64, h = 64): Promise<Buffer> {
  const png = await sharp({
    create: { width: w, height: h, channels: 3, background: color },
  })
    .png()
    .toBuffer();
  const raw = await sharp(png).ensureAlpha().raw().toBuffer();
  return raw as Buffer;
}

describe("pdf-document-fidelity metrics", () => {
  it("stripInvalidXmlChars removes NUL", () => {
    expect(stripInvalidXmlChars("a\u0000b")).toBe("ab");
  });

  it("identical buffers → MAE 0 and high SSIM", async () => {
    const a = await solidRgba({ r: 40, g: 80, b: 120 });
    expect(meanAbsErrorRgb(a, a)).toBe(0);
    expect(approxSsimLuma(a, a, 64, 64)).toBeGreaterThan(0.99);
  });

  it("different solids → high MAE and lower SSIM", async () => {
    const a = await solidRgba({ r: 0, g: 0, b: 0 });
    const b = await solidRgba({ r: 255, g: 255, b: 255 });
    expect(meanAbsErrorRgb(a, b)).toBeGreaterThan(200);
    expect(approxSsimLuma(a, b, 64, 64)).toBeLessThan(0.2);
  });

  it("finds error tiles where a patch differs", async () => {
    const base = Buffer.alloc(32 * 32 * 4, 255);
    const dirty = Buffer.from(base);
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        const i = (y * 32 + x) * 4;
        dirty[i] = 0;
        dirty[i + 1] = 0;
        dirty[i + 2] = 0;
      }
    }
    const regions = findHighErrorTiles({ a: base, b: dirty, width: 32, height: 32, tile: 16, maeThreshold: 10 });
    expect(regions.length).toBeGreaterThan(0);
    expect(regions.some((r) => r.x < 16 && r.y < 16)).toBe(true);
  });

  it("merges adjacent boxes", () => {
    const merged = mergeFidelityBoxes([
      { x: 0, y: 0, w: 10, h: 10, mae: 40, reason: "tile_mae" },
      { x: 10, y: 0, w: 10, h: 10, mae: 50, reason: "tile_mae" },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.w).toBe(20);
  });

  it("softMaskGroupBoxes extracts softmask bboxes", () => {
    const objects: PdfDocumentObject[] = [
      {
        type: "group",
        id: "g1",
        kind: "softmask",
        softMask: true,
        children: [
          {
            type: "path",
            id: "p1",
            d: "M 0 0 L 20 0 L 20 10 Z",
            x: 5,
            y: 8,
            w: 20,
            h: 10,
            fill: "#f00",
            stroke: "none",
            strokeWidth: 0,
          },
        ],
      },
    ];
    const boxes = softMaskGroupBoxes(objects);
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toMatchObject({ x: 5, y: 8, w: 20, h: 10, reason: "softmask" });
  });

  it("documentObjectsToSvg includes paths and text", () => {
    const svg = documentObjectsToSvg({
      width: 100,
      height: 80,
      imageDataUrls: {},
      objects: [
        {
          type: "path",
          id: "p",
          d: "M 1 1 L 10 1 L 10 10 Z",
          x: 1,
          y: 1,
          w: 9,
          h: 9,
          fill: "#00ff00",
          stroke: "none",
          strokeWidth: 0,
        },
        {
          type: "text",
          id: "t",
          text: "Hola & mundo",
          x: 2,
          y: 20,
          w: 40,
          h: 12,
          fontSize: 12,
        },
      ],
    });
    expect(svg).toContain("<path");
    expect(svg).toContain("Hola &amp; mundo");
  });

  it("documentObjectsToSvg strips NUL so sharp/XML can parse", () => {
    const svg = documentObjectsToSvg({
      width: 100,
      height: 80,
      imageDataUrls: {},
      objects: [
        {
          type: "path",
          id: "p\u0000bad",
          d: "M 1 1 L 10\u0000 1 L 10 10 Z",
          x: 1,
          y: 1,
          w: 9,
          h: 9,
          fill: "#00ff00",
          stroke: "none",
          strokeWidth: 0,
        },
        {
          type: "text",
          id: "t",
          text: "Hola\u0000mundo",
          x: 2,
          y: 20,
          w: 40,
          h: 12,
          fontSize: 12,
        },
      ],
    });
    expect(svg).not.toMatch(/\u0000/);
    expect(svg).toContain("Holamundo");
  });

  it("applyFallbackObjects removes covered softmask groups and appends fallback image", () => {
    const objects: PdfDocumentObject[] = [
      {
        type: "group",
        id: "g1",
        kind: "softmask",
        softMask: true,
        children: [
          {
            type: "path",
            id: "p1",
            d: "M 0 0 L 40 0 L 40 40 Z",
            x: 0,
            y: 0,
            w: 40,
            h: 40,
            fill: "#0f0",
            stroke: "none",
            strokeWidth: 0,
          },
        ],
      },
    ];
    const next = applyFallbackObjects({
      objects,
      fallbacks: [
        {
          id: "fallback_p1_0",
          src: "data:image/png;base64,xx",
          box: { x: 0, y: 0, w: 40, h: 40, mae: 255, reason: "softmask" },
        },
      ],
    });
    expect(next.some((o) => o.type === "group")).toBe(false);
    expect(next.some((o) => o.type === "image" && o.fallback)).toBe(true);
  });

  it("Designer emit locks fallback images", () => {
    const output: PdfDocumentLayoutOutput = {
      kind: "pdf_document_layout",
      jobId: "j",
      mode: "document",
      dpi: 150,
      pageCount: 1,
      fidelity: {
        mode: "document",
        textFieldCount: 0,
        pathCount: 0,
        imageLayerCount: 1,
        fontsMissing: [],
        notes: [],
        qaScore: 0.9,
        fallbackRegionCount: 1,
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
              type: "image",
              id: "fallback_p1_0",
              src: "data:image/png;base64,xx",
              x: 10,
              y: 10,
              w: 50,
              h: 40,
              fallback: true,
            },
          ],
        },
      ],
    };
    const pages = buildDesignerPagesFromPdfDocument(output, "n");
    expect(pages[0]!.objects?.[0]).toMatchObject({
      type: "image",
      name: "Fallback raster",
      locked: true,
    });
  });
});
