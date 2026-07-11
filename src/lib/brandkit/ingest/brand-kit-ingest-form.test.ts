import { describe, expect, it } from "vitest";
import { parseBrandKitIngestPaidOpts, BRAND_KIT_INGEST_ALLOW_PAID_FIELD } from "./brand-kit-ingest-form";

describe("parseBrandKitIngestPaidOpts", () => {
  it("requiere allowPaidAnalysis explícito", () => {
    const empty = parseBrandKitIngestPaidOpts(new FormData());
    expect(empty.allowPaidAnalysis).toBe(false);

    const fd = new FormData();
    fd.append(BRAND_KIT_INGEST_ALLOW_PAID_FIELD, "1");
    fd.append("paidAnalysisOperationId", "brandKit:ingest:abc");
    fd.append("paidAnalysisKind", "pdf");
    const parsed = parseBrandKitIngestPaidOpts(fd);
    expect(parsed.allowPaidAnalysis).toBe(true);
    expect(parsed.paidAnalysisOperationId).toBe("brandKit:ingest:abc");
    expect(parsed.paidAnalysisKind).toBe("pdf");
  });
});
