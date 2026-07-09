import { beforeEach, describe, expect, it, vi } from "vitest";

const nivel1Enabled = vi.hoisted(() => ({ value: false }));

const mockAuditWithLogo = {
  version: "genoma-page-vision-pass-v1",
  dpi: 144,
  contentSha256: "sha-deck",
  fileName: "Investor Deck V1.pdf",
  totalPages: 16,
  selectedPages: [1],
  pages: [
    {
      pageNumber: 1,
      cacheKey: "k1",
      ok: true,
      result: {
        version: "v1",
        page: 1,
        logoInstances: [
          {
            bbox: [0.05, 0.04, 0.21, 0.11],
            variant: "horizontal",
            onBackground: "oscuro",
            confidence: 0.9,
            isComplete: true,
          },
        ],
        brandNameEvidence: [],
        typographyRoles: [],
        images: [],
        brandSurfaces: [],
        visualDna: {
          sujeto: "unknown",
          ropa: "unknown",
          lugar: "unknown",
          animo: "unknown",
          estiloArtistico: "unknown",
          encuadre: "unknown",
          luzTratamiento: "unknown",
          paletaAprox: [],
          texturas: "unknown",
          vozVisual: "unknown",
        },
        esFotoDeProducto: false,
      },
      rejected: [],
      warnings: [],
      retried: false,
    },
  ],
  generatedAt: new Date().toISOString(),
};

vi.mock("./ingest/paid-operations-server", () => ({
  bufferContentSha256: () => "sha-deck-full",
}));

vi.mock("@/lib/brain/pdf-brand-extract", () => ({
  countPdfPagesInBuffer: vi.fn(async () => 16),
}));

vi.mock("./ingest/genoma-source-pdf-store", () => ({
  persistGenomaSourcePdf: vi.fn(async () => "genoma/sources/sha-deck/sha-deck-full.pdf"),
}));

vi.mock("./ingest/page-vision-pass-nivel1-runner", () => ({
  isPageVisionNivel1Enabled: () => nivel1Enabled.value,
  runPageVisionPassNivel1ForPdf: vi.fn(async () => mockAuditWithLogo),
}));

vi.mock("./ingest/page-vision-pass-runner", () => ({
  runPageVisionPassForPdf: vi.fn(async () => mockAuditWithLogo),
}));

vi.mock("./ingest/page-vision-pass-apply", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./ingest/page-vision-pass-apply")>();
  return {
    ...actual,
    buildProvisionalLogoCandidatesFromPageVision: vi.fn(async () => [
      {
        pageNumber: 1,
        slot: "primary" as const,
        imageUrl: "data:image/png;base64,ZmFrZQ==",
        signature: "sig-1",
        candidate: {
          value: {
            imageUrl: "data:image/png;base64,ZmFrZQ==",
            sourcePageNumber: 1,
            sourceBbox: { x: 0.05, y: 0.04, width: 0.16, height: 0.07 },
          },
          score: 0.9,
          provenance: { type: "pdf_xobject", detail: "test" },
        },
      },
    ]),
  };
});

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

import { runPageVisionPassNivel1ForPdf } from "./ingest/page-vision-pass-nivel1-runner";
import { runPageVisionPassForPdf } from "./ingest/page-vision-pass-runner";
import { extractLogoCandidatesFromDeckPdf } from "./genoma-pdf-logo-vision";

describe("extractLogoCandidatesFromDeckPdf", () => {
  beforeEach(() => {
    nivel1Enabled.value = false;
    vi.clearAllMocks();
  });

  it("uses page vision pass with deck page selection", async () => {
    const result = await extractLogoCandidatesFromDeckPdf({
      buffer: Buffer.from("%PDF"),
      fileName: "Investor Deck V1.pdf",
      userEmail: "test@local.foldder",
    });

    expect(runPageVisionPassForPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        forcedPageNumbers: [1, 2, 16],
        selectionScope: "deck-logo-cover",
      }),
    );
    expect(result?.candidates).toHaveLength(1);
    expect(result?.candidates[0]?.value.detectionMethod).toBe("vision_bbox");
    expect(result?.candidates[0]?.value.sourcePageNumber).toBe(1);
  });

  it("uses nivel1 batch when enabled", async () => {
    nivel1Enabled.value = true;

    await extractLogoCandidatesFromDeckPdf({
      buffer: Buffer.from("%PDF"),
      fileName: "Investor Deck V1.pdf",
      userEmail: "test@local.foldder",
    });

    expect(runPageVisionPassNivel1ForPdf).toHaveBeenCalledWith(
      expect.objectContaining({ forcedPageNumbers: [1, 2, 16] }),
    );
    expect(runPageVisionPassForPdf).not.toHaveBeenCalled();
  });
});
