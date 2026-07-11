import { describe, expect, it } from "vitest";
import { mergeFontBinariesIntoUsage } from "./font-binary-extract";

describe("mergeFontBinariesIntoUsage", () => {
  it("solo cuenta pesos con binario extraído", () => {
    const binaries = new Map([
      [
        "Fractul::Regular",
        {
          family: "Fractul",
          weight: "Regular",
          embedStatus: "embedded_extracted" as const,
          dataUrl: "data:font/woff2;base64,abc",
        },
      ],
      [
        "Fractul::Bold",
        {
          family: "Fractul",
          weight: "Bold",
          embedStatus: "identified_only" as const,
        },
      ],
    ]);

    const merged = mergeFontBinariesIntoUsage("Fractul", ["Regular", "Bold", "Light"], binaries);
    expect(merged.embedStatus).toBe("embedded_extracted");
    expect(merged.extractedWeights).toEqual(["Regular"]);
    expect(Object.keys(merged.specimenFontFaces)).toEqual(["Regular"]);
  });

  it("Type 3 / sin binario → identified_only", () => {
    const binaries = new Map([
      [
        "Fractul::Regular",
        {
          family: "Fractul",
          weight: "Regular",
          embedStatus: "identified_only" as const,
        },
      ],
    ]);
    const merged = mergeFontBinariesIntoUsage("Fractul", ["Regular"], binaries);
    expect(merged.embedStatus).toBe("identified_only");
    expect(merged.extractedWeights).toEqual([]);
  });
});
