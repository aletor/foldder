import { describe, expect, it } from "vitest";
import type { PageVisionLogoInstance } from "../ingest/page-vision-pass-schema";
import {
  pickBestLogoLabDocumentCandidate,
  scoreLogoLabDocumentCandidate,
  type LogoLabDocumentCandidate,
  type LogoLabRefinePayload,
} from "./pick-best-logo";

function instance(overrides: Partial<PageVisionLogoInstance> = {}): PageVisionLogoInstance {
  return {
    variant: "horizontal",
    onBackground: "claro",
    textInLogo: "Acme",
    isComplete: true,
    cutEdges: [],
    confidence: 0.9,
    bbox: [0.1, 0.1, 0.25, 0.18],
    ...overrides,
  };
}

function refine(overrides: Partial<LogoLabRefinePayload> = {}): LogoLabRefinePayload {
  return {
    seedBbox: [0.1, 0.1, 0.25, 0.18],
    refinedBbox: [0.1, 0.1, 0.25, 0.18],
    method: "pdf_object",
    logoCropBase64: "x".repeat(500),
    ...overrides,
  };
}

function candidate(
  overrides: Partial<LogoLabDocumentCandidate> & Pick<LogoLabDocumentCandidate, "pageNumber" | "index">,
): LogoLabDocumentCandidate {
  return {
    instance: instance(),
    refine: refine(),
    ...overrides,
  };
}

describe("scoreLogoLabDocumentCandidate", () => {
  it("penaliza bboxes enormes (falso positivo tipo footer completo)", () => {
    const compact = scoreLogoLabDocumentCandidate(
      candidate({
        pageNumber: 1,
        index: 0,
        refine: refine({ refinedBbox: [0.8, 0.86, 0.95, 0.9] }),
      }),
    );
    const huge = scoreLogoLabDocumentCandidate(
      candidate({
        pageNumber: 1,
        index: 1,
        refine: refine({ refinedBbox: [0, 0.82, 1, 0.98] }),
      }),
    );
    expect(compact).toBeGreaterThan(huge);
  });

  it("prefiere pdf_object y mayor confianza", () => {
    const strong = scoreLogoLabDocumentCandidate(
      candidate({
        pageNumber: 1,
        index: 0,
        instance: instance({ confidence: 0.95 }),
        refine: refine({ method: "pdf_object" }),
      }),
    );
    const weak = scoreLogoLabDocumentCandidate(
      candidate({
        pageNumber: 5,
        index: 0,
        instance: instance({ confidence: 0.6, isComplete: false }),
        refine: refine({ method: "seed_only" }),
      }),
    );
    expect(strong).toBeGreaterThan(weak);
  });
});

describe("pickBestLogoLabDocumentCandidate", () => {
  it("elige el mejor entre varios rescatados del documento", () => {
    const best = pickBestLogoLabDocumentCandidate([
      candidate({
        pageNumber: 130,
        index: 0,
        instance: instance({ confidence: 0.95 }),
        refine: refine({ refinedBbox: [0, 0.82, 1, 0.98], method: "pdf_object", logoCropBase64: "x".repeat(500) }),
      }),
      candidate({
        pageNumber: 1,
        index: 0,
        instance: instance({ confidence: 0.93 }),
        refine: refine({
          refinedBbox: [0.12, 0.08, 0.28, 0.16],
          method: "pdf_object",
          logoCropBase64: "x".repeat(500),
        }),
      }),
    ]);
    expect(best?.pageNumber).toBe(1);
  });

  it("ignora candidatos sin crop", () => {
    const best = pickBestLogoLabDocumentCandidate([
      candidate({ pageNumber: 1, index: 0, refine: null }),
      candidate({
        pageNumber: 2,
        index: 0,
        refine: refine({ logoCropBase64: "x".repeat(500) }),
      }),
    ]);
    expect(best?.pageNumber).toBe(2);
  });

  it("ignora candidatos con bbox degenerado", () => {
    const best = pickBestLogoLabDocumentCandidate([
      candidate({
        pageNumber: 1,
        index: 0,
        refine: refine({
          refinedBbox: [0, 0, 0.002, 0.25],
          logoCropBase64: "x".repeat(500),
        }),
      }),
      candidate({
        pageNumber: 2,
        index: 0,
        refine: refine({ refinedBbox: [0.12, 0.08, 0.28, 0.16], logoCropBase64: "x".repeat(500) }),
      }),
    ]);
    expect(best?.pageNumber).toBe(2);
  });
});
