import { describe, expect, it } from "vitest";

import { parseReferenceImageForGemini } from "./parse-reference-image";

describe("parseReferenceImageForGemini", () => {
  it("converts percent-encoded SVG data URLs to PNG for Gemini", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#000"/><circle cx="4" cy="4" r="3" fill="#fff"/></svg>`;
    const result = await parseReferenceImageForGemini(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);

    expect(result?.mimeType).toBe("image/png");
    expect(result?.data).toBeTruthy();
    expect(Buffer.from(result!.data, "base64").subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  });

  it("keeps base64 raster data URLs as their original mime type", async () => {
    const data = Buffer.from("fake-png").toString("base64");
    const result = await parseReferenceImageForGemini(`data:image/png;base64,${data}`);

    expect(result).toEqual({ data, mimeType: "image/png" });
  });
});
