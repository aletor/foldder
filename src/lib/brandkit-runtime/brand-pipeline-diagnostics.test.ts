import { describe, expect, it } from "vitest";
import {
  buildUploadCheckpoints,
  mergeBrandPipelineDiagnostics,
  resolvePdfBrandExtractSkipMotivo,
} from "./brand-pipeline-diagnostics";
import {
  PDF_BRAND_EXTRACT_VERSION,
  shouldSkipPdfBrandExtract,
} from "@/lib/brain/pdf-brand-extract";

describe("T-L0 — instrumentación pipeline marca", () => {
  it("mismo hash + versión ⇒ skip; bump de versión ⇒ no skip", () => {
    expect(
      shouldSkipPdfBrandExtract({
        contentSha256: "abc123",
        previousContentSha256: "abc123",
        previousBrandExtractVersion: PDF_BRAND_EXTRACT_VERSION,
      }),
    ).toBe(true);

    expect(
      shouldSkipPdfBrandExtract({
        contentSha256: "abc123",
        previousContentSha256: "abc123",
        previousBrandExtractVersion: "2026-07-05",
      }),
    ).toBe(false);
  });

  it("forceReextract ignora skip idempotente", () => {
    expect(
      shouldSkipPdfBrandExtract({
        contentSha256: "abc123",
        previousContentSha256: "abc123",
        previousBrandExtractVersion: PDF_BRAND_EXTRACT_VERSION,
        forceReextract: true,
      }),
    ).toBe(false);
    expect(
      resolvePdfBrandExtractSkipMotivo({ skip: false, forceReextract: true }),
    ).toBe("forzado");
  });

  it("upload dedupe detecta hash repetido", () => {
    const rows = buildUploadCheckpoints({
      existingDocs: [{ id: "old-1", contentSha256: "deadbeef" }],
      addedDocs: [{ id: "new-1", contentSha256: "deadbeef", name: "deck.pdf" }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.dedupe).toBe(true);
    expect(rows[0]?.dedupeDocId).toBe("old-1");
  });

  it("mergeBrandPipelineDiagnostics acumula checkpoints", () => {
    const merged = mergeBrandPipelineDiagnostics(undefined, {
      analyzeSkip: [
        {
          at: "2026-07-06T10:00:00.000Z",
          docId: "d1",
          skip: true,
          motivo: "hash+version",
          currentVersion: PDF_BRAND_EXTRACT_VERSION,
          contentSha256: "abc",
        },
      ],
    });
    expect(merged.analyzeSkip).toHaveLength(1);
    expect(merged.lastUpdatedAt).toBeTruthy();
  });
});
