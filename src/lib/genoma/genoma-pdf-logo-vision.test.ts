import { beforeEach, describe, expect, it, vi } from "vitest";

const logoIntakeEnabled = vi.hoisted(() => ({ value: false }));

vi.mock("./ingest/paid-operations-server", () => ({
  bufferContentSha256: () => "sha-deck-full",
}));

vi.mock("@/lib/brain/pdf-brand-extract", () => ({
  countPdfPagesInBuffer: vi.fn(async () => 16),
}));

vi.mock("./ingest/genoma-source-pdf-store", () => ({
  persistGenomaSourcePdf: vi.fn(async () => "genoma/sources/sha-deck/sha-deck-full.pdf"),
}));

vi.mock("./ingest/page-vision-pass-apply", () => ({
  buildProvisionalLogoCandidatesFromPageVision: vi.fn(async () => []),
  pageVisionAuditHasLogos: () => false,
}));

vi.mock("./ingest/ingest-logo-heuristic", () => ({
  buildHeuristicLogoCandidatesFromPdfCover: vi.fn(async () => []),
}));

vi.mock("./ingest/upload-genoma-file", () => ({
  uploadGenomaIngestFile: vi.fn(async () => ({
    url: "https://cdn.example/logo-p1.png",
    fileId: "upload-1",
  })),
}));

vi.mock("sharp", () => ({
  default: vi.fn(() => ({
    metadata: vi.fn(async () => ({ width: 180, height: 72 })),
  })),
}));

vi.mock("./ingest/ingest-logo-intake-bridge", () => ({
  isGenomaLogoIntakePdfEnabled: () => logoIntakeEnabled.value,
  extractLogoCandidatesFromPdfLogoIntake: vi.fn(async () => ({
    candidates: [
      {
        value: {
          assetId: "https://cdn.example/logo-intake.png",
          previewUrl: "https://cdn.example/logo-intake.png",
          format: "png",
          width: 200,
          height: 100,
          background: "transparent",
          variants: [],
          sourcePageNumber: 1,
          sourceBbox: { x: 0.1, y: 0.1, width: 0.3, height: 0.2 },
          sourceDocName: "Investor Deck V1.pdf",
          sourcePdfSha256: "sha-deck-full",
          totalDocPages: 16,
          detectionMethod: "vision_bbox",
        },
        score: 0.9,
        provenance: { type: "pdf_xobject", detail: "logo-intake · pág. 1" },
      },
    ],
    semanticPalette: undefined,
    visionDetail: "1 candidatos · logo-intake · 1 pág.",
    proposal: null,
  })),
  paletteSignalsFromLogoIntakeSemantic: vi.fn(() => []),
}));

vi.mock("./rank-pdf-pages-for-logo", () => ({
  rankDeckPdfPagesForLogoVision: vi.fn(async () => [1, 2, 16]),
}));

vi.mock("./ingest/page-vision-pass-nivel1-runner", () => ({
  isPageVisionNivel1Enabled: () => false,
  runPageVisionPassNivel1ForPdf: vi.fn(async () => ({ pages: [] })),
}));

vi.mock("./ingest/page-vision-pass-runner", () => ({
  runPageVisionPassForPdf: vi.fn(async () => ({ pages: [] })),
}));

import { runPageVisionPassForPdf } from "./ingest/page-vision-pass-runner";
import {
  extractLogoCandidatesFromPdfLogoIntake,
} from "./ingest/ingest-logo-intake-bridge";
import { extractLogoCandidatesFromDeckPdf } from "./genoma-pdf-logo-vision";

describe("extractLogoCandidatesFromDeckPdf", () => {
  beforeEach(() => {
    logoIntakeEnabled.value = false;
    vi.clearAllMocks();
  });

  it("uses logo-intake pipeline when GENOMA_LOGO_INTAKE_PDF=1", async () => {
    logoIntakeEnabled.value = true;

    const result = await extractLogoCandidatesFromDeckPdf({
      buffer: Buffer.from("%PDF"),
      fileName: "Investor Deck V1.pdf",
      userEmail: "test@local.foldder",
    });

    expect(extractLogoCandidatesFromPdfLogoIntake).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "deck",
        totalPages: 16,
      }),
    );
    expect(runPageVisionPassForPdf).toHaveBeenCalled();
    expect(result?.candidates).toHaveLength(1);
    expect(result?.candidates[0]?.provenance.detail).toContain("logo-intake");
  });

  it("uses page vision pass when logo-intake flag is off", async () => {
    vi.mocked(runPageVisionPassForPdf).mockResolvedValueOnce({
      version: "genoma-page-vision-pass-v1",
      dpi: 144,
      contentSha256: "sha-deck",
      fileName: "Investor Deck V1.pdf",
      totalPages: 16,
      selectedPages: [1],
      pages: [],
      generatedAt: new Date().toISOString(),
    });

    await extractLogoCandidatesFromDeckPdf({
      buffer: Buffer.from("%PDF"),
      fileName: "Investor Deck V1.pdf",
      userEmail: "test@local.foldder",
    });

    expect(extractLogoCandidatesFromPdfLogoIntake).not.toHaveBeenCalled();
    expect(runPageVisionPassForPdf).toHaveBeenCalled();
  });
});
