import { describe, expect, it, vi } from "vitest";

vi.mock("./logo-detect", () => ({
  detectBrandKitLogosFromPdfBuffer: vi.fn(async () => ({
    pageCount: 10,
    ambiguousPrimary: false,
    logos: [
      {
        buffer: Buffer.from("fake-png"),
        variant: "positive" as const,
        confidence: 0.9,
        pageNumber: 1,
        evidenceDetail: "marca 78% · inv 82 · pos 71",
        slot: "primary" as const,
        brandBehavior: {
          invariance: 0.82,
          structuralPosition: 0.71,
          interDocument: 1,
          scaleSubordination: 0.88,
          total: 0.78,
        },
        visualTiebreak: 0.85,
        logoNess: {
          distinctColors: 2,
          tonalEntropy: 0.5,
          inkDensity: 0.12,
          containsFace: false,
          geometricEdges: true,
          width: 120,
          height: 48,
          simpleSolidShape: false,
          dominantFillShare: 0.4,
        },
        logoPHash: "old",
      },
    ],
  })),
}));

vi.mock("@/lib/brain/pdf-logo-pipeline", () => ({
  computeLogoPHash: vi.fn(async () => "1".repeat(1024)),
}));

vi.mock("sharp", () => {
  const refinedBuffer = Buffer.from("trimmed-png");
  const chain = {
    trim: () => chain,
    png: () => chain,
    metadata: async () => ({ width: 120, height: 48 }),
    toBuffer: async () => refinedBuffer,
  };
  return { default: () => chain };
});

import { extractLogoFromPdf } from "./logo";

describe("extractLogoFromPdf", () => {
  it("rankea por brandBehaviorScore y conserva pHash", async () => {
    const { logos, primaryLogos } = await extractLogoFromPdf(Buffer.from("pdf"), { maxPages: 3 });
    expect(logos).toHaveLength(1);
    expect(primaryLogos).toHaveLength(1);
    expect(logos[0].logoPHash).toHaveLength(1024);
    expect(logos[0].brandBehavior?.total).toBeGreaterThan(0.5);
    expect(logos[0].slot).toBe("primary");
    expect(logos[0].buffer.toString()).toBe("trimmed-png");
  });
});
