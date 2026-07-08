import { describe, expect, it } from "vitest";
import { parseGenomaIngestPaidOpts, GENOMA_INGEST_ALLOW_PAID_FIELD } from "./genoma-ingest-form";

describe("parseGenomaIngestPaidOpts", () => {
  it("requiere allowPaidAnalysis explícito", () => {
    const empty = parseGenomaIngestPaidOpts(new FormData());
    expect(empty.allowPaidAnalysis).toBe(false);

    const fd = new FormData();
    fd.append(GENOMA_INGEST_ALLOW_PAID_FIELD, "1");
    fd.append("paidAnalysisOperationId", "genoma:ingest:abc");
    fd.append("paidAnalysisKind", "pdf");
    const parsed = parseGenomaIngestPaidOpts(fd);
    expect(parsed.allowPaidAnalysis).toBe(true);
    expect(parsed.paidAnalysisOperationId).toBe("genoma:ingest:abc");
    expect(parsed.paidAnalysisKind).toBe("pdf");
  });
});
