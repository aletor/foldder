import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  parseGenomaPdfVisionJson,
  getOrRunGenomaPdfVisionPass,
  typographyGuessFromVisionPass,
} from "./pdf-vision-pass";
import { clearPdfVisionCacheForTests, getCachedPdfVisionPass, pdfVisionCacheKey } from "./pdf-vision-cache";
import type { GenomaPdfVisionResult, GenomaVisionPageImage } from "./pdf-vision-types";

const mockPage: GenomaVisionPageImage = {
  mimeType: "image/png",
  base64: "aGk=",
  pageNumber: 1,
  width: 800,
  height: 600,
};

describe("parseGenomaPdfVisionJson", () => {
  it("parsea logo, paleta, tipografía y visual", () => {
    const parsed = parseGenomaPdfVisionJson({
      logo: {
        emitter: {
          page: 1,
          bbox: { x: 0.1, y: 0.05, width: 0.2, height: 0.08 },
          polarity: "light_mark",
          isEmitterLogo: true,
        },
      },
      palette: [
        { role: "primario", approxHex: "#001848", isBrandColor: true, source: "brand" },
        { role: "secundario", approxHex: "#501000", isBrandColor: false, source: "photo" },
      ],
      typography: { primaryFamily: "Montserrat", primaryWeights: ["Bold"] },
      visual: [{ category: "people", description: "Retratos corporativos" }],
    });
    expect(parsed?.logo?.emitter?.polarity).toBe("light_mark");
    expect(parsed?.palette).toHaveLength(1);
    expect(parsed?.palette[0]?.approxHex).toBe("#001848");
    expect(parsed?.typography?.primaryFamily).toBe("Montserrat");
    expect(parsed?.visual[0]?.category).toBe("people");
  });
});

describe("getOrRunGenomaPdfVisionPass", () => {
  beforeEach(() => {
    clearPdfVisionCacheForTests();
  });

  it("un solo pase por documento — cache por contentSha256", async () => {
    const invokeVision = vi.fn(async (): Promise<GenomaPdfVisionResult> => ({
      version: "2026-07-06-unified-1",
      palette: [{ role: "primario", approxHex: "#001848", isBrandColor: true }],
      visual: [],
      confidence: 0.5,
      provider: "mock",
    }));

    const input = {
      buffer: Buffer.from("pdf-fixture"),
      contentSha256: "abc123deadbeef",
      pageImagesOverride: [mockPage],
      invokeVision,
    };

    const first = await getOrRunGenomaPdfVisionPass(input);
    const second = await getOrRunGenomaPdfVisionPass(input);

    expect(first?.palette[0]?.approxHex).toBe("#001848");
    expect(second).toEqual(first);
    expect(invokeVision).toHaveBeenCalledTimes(1);
    expect(getCachedPdfVisionPass(pdfVisionCacheKey(input.contentSha256))).toEqual(first);
  });

  it("no cachea fallos — reintenta tras null", async () => {
    const invokeVision = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        version: "2026-07-06-unified-1",
        palette: [{ role: "primario", approxHex: "#8a91eb", isBrandColor: true }],
        visual: [],
        confidence: 0.5,
        provider: "mock",
      } satisfies GenomaPdfVisionResult);

    const input = {
      buffer: Buffer.from("pdf-fixture"),
      contentSha256: "retry-null-cache",
      pageImagesOverride: [mockPage],
      invokeVision,
    };

    const first = await getOrRunGenomaPdfVisionPass(input);
    const second = await getOrRunGenomaPdfVisionPass(input);

    expect(first).toBeNull();
    expect(second?.palette[0]?.approxHex).toBe("#8a91eb");
    expect(invokeVision).toHaveBeenCalledTimes(2);
    expect(getCachedPdfVisionPass(pdfVisionCacheKey(input.contentSha256))).toEqual(second);
  });
});

describe("typographyGuessFromVisionPass", () => {
  it("convierte hint de tipografía en guess", () => {
    const guess = typographyGuessFromVisionPass({
      primaryFamily: "Helvetica Neue",
      primaryWeights: ["Bold"],
    });
    expect(guess?.primary?.family).toBe("Helvetica Neue");
  });
});
