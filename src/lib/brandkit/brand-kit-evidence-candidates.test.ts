import { describe, expect, it } from "vitest";
import { buildCopyUnits } from "./crawl/copy-units";
import {
  formatEvidenceCandidatesForLlm,
  resolveEvidenceIds,
  selectEvidenceCandidates,
} from "./brand-kit-evidence-candidates";

describe("brandKit evidence candidates", () => {
  it("selects weighted evidence with stable ids", () => {
    const units = buildCopyUnits([
      {
        url: "https://example.com/",
        html: `
          <html><head><meta property="og:description" content="Somos directores de cine frustrados." /></head>
          <body><h1>Alima</h1><p>Hacemos cine y publicidad con narrativa.</p></body></html>
        `,
        cssTexts: [],
      },
    ]);

    const candidates = selectEvidenceCandidates(units, 20, 2);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].id).toBe("ev_01");
    expect(formatEvidenceCandidatesForLlm(candidates)).toContain("ev_01");
  });

  it("resolves evidenceIds to real quotes", () => {
    const candidates = [
      {
        id: "ev_01",
        quote: "Hacemos cine y publicidad",
        role: "hero" as const,
        sourceUrl: "https://example.com/",
        weight: 1,
      },
      {
        id: "ev_02",
        quote: "Somos directores de cine frustrados",
        role: "about" as const,
        sourceUrl: "https://example.com/about",
        weight: 0.9,
      },
    ];
    const resolved = resolveEvidenceIds(["ev_02", "ev_99"], candidates);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].quote).toBe("Somos directores de cine frustrados");
  });
});
