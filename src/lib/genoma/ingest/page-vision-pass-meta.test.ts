import { describe, expect, it } from "vitest";
import {
  pageVisionPassBadgeLabel,
  pageVisionPassMetaFromAudit,
  skippedPageVisionPassMeta,
} from "./page-vision-pass-meta";
import type { PageVisionPassRunAudit } from "./page-vision-pass-runner";

function mockAudit(partial: Partial<PageVisionPassRunAudit>): PageVisionPassRunAudit {
  return {
    version: "2026-07-06-page-structured-3",
    dpi: 144,
    contentSha256: "abc",
    fileName: "catalogo26.pdf",
    totalPages: 130,
    selectedPages: [1, 2, 3],
    pages: [],
    generatedAt: "2026-07-06T12:00:00.000Z",
    ...partial,
  } as PageVisionPassRunAudit;
}

describe("page-vision-pass-meta", () => {
  it("badge muestra análisis v2 con contador", () => {
    const meta = pageVisionPassMetaFromAudit(
      mockAudit({
        pages: [
          { pageNumber: 1, cacheKey: "a", ok: true, rejected: [], warnings: [], retried: false, result: undefined },
          { pageNumber: 2, cacheKey: "b", ok: true, rejected: [], warnings: [], retried: false, result: undefined },
        ],
      }),
    );
    expect(pageVisionPassBadgeLabel(meta)).toBe("análisis v2 · 2 pág.");
  });

  it("skipped por flag muestra sin análisis v2", () => {
    const meta = skippedPageVisionPassMeta({ skipReason: "flag_disabled" });
    expect(pageVisionPassBadgeLabel(meta)).toBe("sin análisis v2");
  });
});
