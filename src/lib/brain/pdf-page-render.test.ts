import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { bgraBitmapToPng } from "./pdf-page-render";

describe("bgraBitmapToPng", () => {
  it("respeta RGBA de pdfium (REVERSE_BYTE_ORDER) sin permutar R↔B", async () => {
    const data = new Uint8Array([0x10, 0x20, 0x60, 255]);
    const png = await bgraBitmapToPng(data, 1, 1);
    const { data: px } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(px[0]).toBe(0x10);
    expect(px[1]).toBe(0x20);
    expect(px[2]).toBe(0x60);
  });
});
