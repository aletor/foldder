import { describe, expect, it } from "vitest";
import type { Candidate, LogoValue } from "./genoma-types";
import { bboxIoU } from "./genoma-bbox-iou";
import { mergeLogoCandidatesByIoU } from "./merge-logo-candidates";

function candidate(
  overrides: Partial<LogoValue> & { score?: number },
): Candidate<LogoValue> {
  const { score = 0.8, ...value } = overrides;
  return {
    score,
    provenance: { type: "pdf_xobject", detail: "test" },
    value: {
      assetId: "a",
      previewUrl: "a",
      format: "png",
      width: 100,
      height: 40,
      background: "transparent",
      variants: [],
      ...value,
    } as LogoValue,
  };
}

describe("mergeLogoCandidatesByIoU", () => {
  it("deduplica candidatos con bbox solapado en la misma página", () => {
    const vision = candidate({
      score: 0.82,
      detectionMethod: "vision_bbox",
      sourcePdfSha256: "sha",
      sourcePageNumber: 1,
      sourceBbox: { x: 0.1, y: 0.1, width: 0.3, height: 0.2 },
    });
    const heuristic = candidate({
      score: 0.75,
      detectionMethod: "heuristic",
      sourcePdfSha256: "sha",
      sourcePageNumber: 1,
      sourceBbox: { x: 0.11, y: 0.11, width: 0.28, height: 0.18 },
    });
    const merged = mergeLogoCandidatesByIoU([vision, heuristic]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.score).toBeGreaterThan(0.82);
    expect(merged[0]?.rankSignals).toContain("varios métodos coinciden");
  });

  it("conserva candidatos en páginas distintas", () => {
    const a = candidate({
      sourcePdfSha256: "sha",
      sourcePageNumber: 1,
      sourceBbox: { x: 0.1, y: 0.1, width: 0.2, height: 0.1 },
    });
    const b = candidate({
      sourcePdfSha256: "sha",
      sourcePageNumber: 2,
      sourceBbox: { x: 0.1, y: 0.1, width: 0.2, height: 0.1 },
    });
    expect(mergeLogoCandidatesByIoU([a, b])).toHaveLength(2);
  });
});

describe("bboxIoU", () => {
  it("returns 1 for identical boxes", () => {
    const box: [number, number, number, number] = [0.1, 0.1, 0.5, 0.4];
    expect(bboxIoU(box, box)).toBeCloseTo(1);
  });
});
