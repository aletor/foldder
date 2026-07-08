import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { synthesizeTypographyFromPdfRenders, type TypographyVisionInvoker } from "./pdf-typography-vision-fallback";
import { extractBrandKitFromPdfBuffer } from "./pdf-brand-extract";

const ATRES_PDF = path.join(process.cwd(), "fixtures/brandkit/einf_2023_atresmedia.pdf");
const hasAtresFixture = fs.existsSync(ATRES_PDF);

describe("pdf-typography-vision-fallback", () => {
  it("mock invoker returns typography as llm-synthesis", async () => {
    const mockInvoker: TypographyVisionInvoker = async () => ({
      typography: {
        primary: { family: "Brand Sans", weights: ["Regular", "Bold"] },
      },
      confidence: 0.42,
      evidenceKind: "llm-synthesis",
      provider: "mock",
    });
    const result = await synthesizeTypographyFromPdfRenders({
      buffer: Buffer.alloc(0),
      pageImagesOverride: [{ mimeType: "image/png", base64: "aGk=", pageNumber: 1 }],
      invokeVision: mockInvoker,
    });
    expect(result?.typography.primary?.family).toBe("Brand Sans");
    expect(result?.evidenceKind).toBe("llm-synthesis");
  });
});

describe.skipIf(!hasAtresFixture)("T-fonts-atres — no usa vision si pdf.js encuentra fuentes", () => {
  it("Atresmedia usa pdf-embedded, no llm-synthesis", async () => {
    let visionCalls = 0;
    const buffer = fs.readFileSync(ATRES_PDF);
    const extracted = await extractBrandKitFromPdfBuffer(buffer, "einf_2023_atresmedia.pdf", {
      maxPages: 12,
      typographyVisionInvoker: async () => {
        visionCalls += 1;
        return null;
      },
    });
    expect(extracted.typography.primary?.family).toBe("Montserrat");
    expect(extracted.typographySource).toBe("pdf-embedded");
    expect(visionCalls).toBe(0);
  });
});
