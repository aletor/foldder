import { describe, expect, it } from "vitest";
import {
  mapPdfScanErrorMessage,
  sanitizePdfExtractedText,
  sanitizeSvgPathD,
  stripInvalidXmlChars,
} from "./pdf-scan-sanitize";

describe("pdf-scan-sanitize", () => {
  it("strips NUL and control chars", () => {
    expect(stripInvalidXmlChars("a\u0000b\u0007c")).toBe("abc");
  });

  it("sanitizePdfExtractedText flattens newlines and strips NUL", () => {
    expect(sanitizePdfExtractedText("uno\n\u0000dos")).toBe("uno dos");
  });

  it("sanitizeSvgPathD keeps path commands", () => {
    expect(sanitizeSvgPathD("M 1\u0000 2 L 3 4 Z")).toBe("M 1 2 L 3 4 Z");
  });

  it("mapPdfScanErrorMessage translates XML/NUL errors", () => {
    expect(
      mapPdfScanErrorMessage(
        new Error("Input buffer has corrupt header: glib: XML parse error: PCDATA invalid Char value 0"),
      ),
    ).toMatch(/vectoriales incompatibles|Textos editables/i);
  });
});
