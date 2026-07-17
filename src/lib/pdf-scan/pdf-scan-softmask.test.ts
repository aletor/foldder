import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { luminanceMaskPngFromPageCrop, attachSoftMaskUrls } from "./pdf-scan-softmask";
import { parseSoftMaskSubtype, applyPdfGState, createPdfGState } from "./pdf-scan-gstate";
import type { PdfDocumentObject } from "./pdf-scan-types";

describe("soft mask luminance", () => {
  it("parseSoftMaskSubtype reads Alpha/Luminosity", () => {
    expect(parseSoftMaskSubtype("None")).toBeNull();
    expect(parseSoftMaskSubtype({ type: "Alpha" })).toBe("Alpha");
    expect(parseSoftMaskSubtype({ type: "Luminosity" })).toBe("Luminosity");
  });

  it("applyPdfGState stores subtype", () => {
    const state = createPdfGState();
    applyPdfGState([[["SMask", { type: "Alpha" }]]], state);
    expect(state.softMask).toBe(true);
    expect(state.softMaskSubtype).toBe("Alpha");
  });

  it("luminanceMaskPngFromPageCrop marks dark content visible", async () => {
    // 2×1: black | white
    const src = await sharp(Buffer.from([0, 0, 0, 255, 255, 255]), {
      raw: { width: 2, height: 1, channels: 3 },
    })
      .png()
      .toBuffer();

    const mask = await luminanceMaskPngFromPageCrop(src);
    expect(mask.width).toBe(2);
    expect(mask.height).toBe(1);
    const raw = await sharp(mask.png).ensureAlpha().raw().toBuffer();
    // Black source → high visibility; white → low.
    expect(raw[0]!).toBeGreaterThan(raw[4]!);
  });

  it("attachSoftMaskUrls sets layerMask on matching groups", () => {
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
            d: "M 0 0 L 10 0 L 10 10 Z",
            x: 0,
            y: 0,
            w: 10,
            h: 10,
            fill: "#000",
            stroke: "none",
            strokeWidth: 0,
          },
        ],
      },
    ];
    const next = attachSoftMaskUrls(objects, [
      {
        groupId: "g1",
        mask: { src: "https://example/m.png", pixelW: 10, pixelH: 10, subtype: "Luminosity" },
      },
    ]);
    expect(next[0]).toMatchObject({
      type: "group",
      layerMask: { src: "https://example/m.png", pixelW: 10, pixelH: 10 },
    });
  });
});
