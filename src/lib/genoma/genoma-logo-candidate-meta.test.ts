import { describe, expect, it } from "vitest";
import { logoCandidateMeta } from "./genoma-logo-candidate-meta";
import type { Candidate, LogoValue } from "./genoma-types";

describe("genoma-logo-candidate-meta", () => {
  it("expone método, score y página", () => {
    const candidate: Candidate<LogoValue> = {
      score: 0.86,
      provenance: { type: "pdf_xobject", detail: "visión PDF · pág. 2" },
      rankSignals: ["logo principal"],
      value: {
        assetId: "x",
        previewUrl: "x",
        format: "png",
        width: 120,
        height: 40,
        background: "transparent",
        variants: [],
        detectionMethod: "vision_bbox",
        sourcePageNumber: 2,
        totalDocPages: 12,
      },
    };
    const meta = logoCandidateMeta(candidate);
    expect(meta.methodLabel).toBe("visión IA");
    expect(meta.scorePercent).toBe(86);
    expect(meta.pageLabel).toBe("pág. 2 de 12");
    expect(meta.explanation.length).toBeGreaterThan(0);
  });
});
