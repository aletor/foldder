import { describe, expect, it } from "vitest";
import { sniffImageContentType, normalizeImageContentType } from "./genoma-remote-image";

describe("genoma-remote-image", () => {
  it("sniffs jpeg without relying on content-type header", () => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    expect(sniffImageContentType(buffer)).toBe("image/jpeg");
    expect(normalizeImageContentType("application/octet-stream", buffer)).toBe("image/jpeg");
  });

  it("sniffs png from magic bytes", () => {
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    expect(sniffImageContentType(buffer)).toBe("image/png");
  });
});
