import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/genoma/logo-intake/batch-store", () => ({
  saveBatchDocs: vi.fn(),
}));

vi.mock("@/lib/genoma/logo-intake/crop", () => ({
  renderCandidateAdjusted: vi.fn(async () => ({
    png: Buffer.from("png"),
    width: 400,
    height: 200,
  })),
}));

vi.mock("@/lib/genoma/logo-intake/pipeline", () => ({
  runLogoIntakePipeline: vi.fn(async () => ({
    batchId: "batch-test",
    best: {
      id: "pdf0:1:0",
      docId: "pdf0",
      docName: "deck.pdf",
      page: 1,
      bboxPage: [0.05, 0.04, 0.21, 0.11],
      cropPng: Buffer.from("jpeg").toString("base64"),
      cropMime: "image/jpeg",
      cropWidthPx: 180,
      cropHeightPx: 72,
      pHash: "hash1",
      model: {
        isDocumentIssuerLogo: true,
        isComplete: true,
        cutEdges: false,
        variant: "full",
        brandText: "Qwords",
        variantLabel: null,
        isProhibited: false,
        confidence: 0.9,
      },
      quality: {
        total: 82,
        resolutionPts: 20,
        sharpnessPts: 18,
        completePts: 16,
        noCutPts: 16,
        confidencePts: 12,
      },
    },
    lowQuality: false,
    alternatives: [],
    groups: [],
    semanticPalette: undefined,
    palettePending: false,
    timings: { renderMs: 1, visionMs: 2, cropMs: 3, hiResMs: 4, totalMs: 10 },
    visionCalls: 1,
  })),
}));

vi.mock("./upload-genoma-file", () => ({
  uploadGenomaIngestFile: vi.fn(async () => ({
    url: "https://cdn.example/logo.png",
    fileId: "file-1",
  })),
}));

vi.mock("sharp", () => ({
  default: vi.fn(() => ({
    png: vi.fn(() => ({
      toBuffer: vi.fn(async () => Buffer.from("png")),
    })),
    metadata: vi.fn(async () => ({ width: 180, height: 72 })),
  })),
}));

import { runLogoIntakePipeline } from "@/lib/genoma/logo-intake/pipeline";
import { deckLogoVisionPageNumbers } from "./page-vision-pass-selection";
import {
  extractLogoCandidatesFromPdfLogoIntake,
  paletteSignalsFromLogoIntakeSemantic,
} from "./ingest-logo-intake-bridge";

describe("extractLogoCandidatesFromPdfLogoIntake", () => {
  it("runs logo-intake with deck page selection and maps candidates", async () => {
    const result = await extractLogoCandidatesFromPdfLogoIntake({
      buffer: Buffer.from("%PDF"),
      fileName: "Investor Deck V1.pdf",
      contentSha256: "sha-deck",
      userEmail: "test@local.foldder",
      totalPages: 16,
      scope: "deck",
    });

    expect(runLogoIntakePipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        userEmail: "test@local.foldder",
        selectPages: expect.any(Function),
      }),
    );

    const selectPages = vi.mocked(runLogoIntakePipeline).mock.calls[0]?.[0]?.selectPages;
    expect(selectPages?.(16, { docId: "pdf0", docName: "x", buffer: Buffer.alloc(0), kind: "pdf" })).toEqual(
      deckLogoVisionPageNumbers(16),
    );

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.value.sourcePageNumber).toBe(1);
    expect(result.candidates[0]?.provenance.detail).toContain("logo-intake");
    expect(result.visionDetail).toContain("logo-intake");
  });
});

describe("paletteSignalsFromLogoIntakeSemantic", () => {
  it("maps semantic palette entries to ingest signals", () => {
    const signals = paletteSignalsFromLogoIntakeSemantic(
      {
        entries: [
          {
            hex: "#AABBCC",
            role: "primary",
            pages: [1, 2],
            score: 0.85,
            regionKind: "logo",
            prominence: 1,
            recurrence: 1,
            share: 0.4,
          },
        ],
        samplingMs: 5,
        semanticChromaticCount: 1,
      },
      "sha-manual",
    );

    expect(signals).toHaveLength(1);
    expect(signals[0]?.hex).toBe("#aabbcc");
    expect(signals[0]?.provenance.detail).toContain("logo-intake");
  });
});
