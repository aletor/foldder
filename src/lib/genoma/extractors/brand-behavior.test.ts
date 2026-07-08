import { describe, expect, it } from "vitest";
import sharp from "sharp";
import type { RenderedPdfPage } from "@/lib/brain/pdf-page-render";
import {
  BRAND_BEHAVIOR_DISCARD,
  BRAND_BEHAVIOR_PRIMARY,
  BRAND_SCALE_HARD_MAX,
  buildBrandCorpusFromGenome,
  classifyBrandBehaviorSlot,
  compareBrandCandidates,
  computeBrandBehaviorScore,
  scoreBrandBehavior,
  scoreInvariance,
  scoreInterDocumentPersistence,
  scoreScaleSubordination,
  scoreStructuralPosition,
  type RegionSampleLike,
} from "./brand-behavior";
import { emptyGenome } from "../model/trait";
import { createCandidate, signal } from "../model/evidence";
import { upsertTrait, addCandidate, createTrait } from "../model/trait";
import { visualTiebreakScore, measureLogoNess } from "./logo-ness";

const PAGE_W = 1000;
const PAGE_H = 800;

function mockPage(pageNumber: number): RenderedPdfPage {
  return {
    pageNumber,
    width: PAGE_W,
    height: PAGE_H,
    pngBuffer: Buffer.alloc(0),
  };
}

function brandSample(page: number, overrides: Partial<RegionSampleLike> = {}): RegionSampleLike {
  return {
    pageNumber: page,
    region: "topLeft",
    bbox: { x: 24, y: 18, width: 72, height: 36 },
    signature: new Uint8Array([1, 1, 1, 0, 0, 0, 1, 1]),
    inkRatio: 0.12,
    ...overrides,
  };
}

function contentSample(page: number): RegionSampleLike {
  return brandSample(page, {
    region: "header",
    bbox: { x: 100, y: 200, width: 600, height: 400 },
    inkRatio: 0.85,
  });
}

describe("brand behavior model (T-comportamiento)", () => {
  const pages = Array.from({ length: 12 }, (_, i) => mockPage(i + 1));

  it("marca recurrente en esquina puntúa alto en invarianza y posición", () => {
    const cluster = Array.from({ length: 10 }, (_, i) => brandSample(i + 1));
    expect(scoreInvariance(cluster, pages)).toBeGreaterThan(0.55);
    expect(scoreStructuralPosition(cluster, pages)).toBeGreaterThan(0.5);
    expect(scoreScaleSubordination(cluster, pages)).toBeGreaterThan(0.8);
  });

  it("el slot primary exige brandBehaviorScore alto, no métricas visuales", () => {
    const highBehavior = computeBrandBehaviorScore({
      invariance: 0.85,
      structuralPosition: 0.75,
      interDocument: 0.5,
      scaleSubordination: 0.9,
    });
    expect(highBehavior).toBeGreaterThan(BRAND_BEHAVIOR_PRIMARY);
    expect(classifyBrandBehaviorSlot(highBehavior, 0, { invariance: 0.85 })).toBe("primary");
  });
});

describe("contenido recurrente (T-contenido-recurrente)", () => {
  const pages = Array.from({ length: 10 }, (_, i) => mockPage(i + 1));

  it("elemento grande en área de contenido puntúa cero en escala aunque recurra", () => {
    const cluster = Array.from({ length: 8 }, (_, i) => contentSample(i + 1));
    expect(scoreScaleSubordination(cluster, pages)).toBe(0);
    const areaRatio = (600 * 400) / (PAGE_W * PAGE_H);
    expect(areaRatio).toBeGreaterThan(BRAND_SCALE_HARD_MAX);
  });

  it("contenido recurrente no pasa el umbral de comportamiento de marca", () => {
    const cluster = Array.from({ length: 8 }, (_, i) => contentSample(i + 1));
    const partial = computeBrandBehaviorScore({
      invariance: scoreInvariance(cluster, pages),
      structuralPosition: scoreStructuralPosition(cluster, pages),
      interDocument: 1,
      scaleSubordination: scoreScaleSubordination(cluster, pages),
    });
    expect(partial).toBeLessThan(BRAND_BEHAVIOR_DISCARD);
  });
});

describe("persistencia inter-documento (T-inter-documento)", () => {
  it("misma firma en más documentos previos puntúa más que en uno solo", () => {
    const phash = "1".repeat(1024);
    const other = "0".repeat(1024);
    const corpusOne = {
      documentIds: new Set(["doc_a"]),
      signaturesByDocument: new Map([["doc_a", [other]]]),
    };
    const corpusTwo = {
      documentIds: new Set(["doc_a", "doc_b"]),
      signaturesByDocument: new Map([
        ["doc_a", [phash]],
        ["doc_b", [phash]],
      ]),
    };
    const onePriorMatch = scoreInterDocumentPersistence(phash, "doc_c", corpusOne);
    const twoPriorMatches = scoreInterDocumentPersistence(phash, "doc_c", corpusTwo);
    expect(twoPriorMatches).toBeGreaterThan(onePriorMatch);
    expect(onePriorMatch).toBeCloseTo(0.5, 1);
    expect(twoPriorMatches).toBeCloseTo(1, 1);
  });

  it("buildBrandCorpusFromGenome agrupa firmas por sourceRef", () => {
    let genome = emptyGenome();
    const candidate = createCandidate({
      value: { imageUrl: "x", variant: "positive", label: "logo" },
      signals: [signal("recurrence")],
      signature: "abc123",
      sourceRefs: ["src_deck"],
    });
    genome = upsertTrait(genome, addCandidate(createTrait("logo.primary"), candidate));
    const corpus = buildBrandCorpusFromGenome(genome);
    expect(corpus.signaturesByDocument.get("src_deck")).toContain("abc123");
  });
});

describe("desempate visual (T-desempate)", () => {
  const tiedBehavior = {
    invariance: 0.7,
    structuralPosition: 0.65,
    interDocument: 0.5,
    scaleSubordination: 0.85,
    total: computeBrandBehaviorScore({
      invariance: 0.7,
      structuralPosition: 0.65,
      interDocument: 0.5,
      scaleSubordination: 0.85,
    }),
  };

  it("empate en comportamiento lo resuelve visualTiebreakScore", () => {
    const a = { brandBehavior: tiedBehavior, visualTiebreak: 0.9 };
    const b = { brandBehavior: tiedBehavior, visualTiebreak: 0.4 };
    expect(compareBrandCandidates(a, b)).toBeLessThan(0);
  });

  it("logo multicolor con mejor comportamiento gana aunque visual sea peor", async () => {
    const photo = Buffer.alloc(160 * 160 * 3);
    for (let i = 0; i < photo.length; i += 1) photo[i] = Math.floor(Math.random() * 256);
    const noisy = await sharp(photo, { raw: { width: 160, height: 160, channels: 3 } }).png().toBuffer();
    const flat = await sharp({
      create: { width: 80, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    })
      .png()
      .toBuffer();
    const noisyMetrics = await measureLogoNess(noisy);
    const flatMetrics = await measureLogoNess(flat);
    expect(visualTiebreakScore(flatMetrics)).toBeGreaterThan(visualTiebreakScore(noisyMetrics));

    const brandWinner = {
      brandBehavior: { ...tiedBehavior, total: 0.72 },
      visualTiebreak: visualTiebreakScore(noisyMetrics),
    };
    const brandLoser = {
      brandBehavior: { ...tiedBehavior, total: 0.45 },
      visualTiebreak: visualTiebreakScore(flatMetrics),
    };
    expect(compareBrandCandidates(brandWinner, brandLoser)).toBeLessThan(0);
  });
});

describe("terceros (T-terceros)", () => {
  it("aparición única en grid no alcanza primary", () => {
    expect(classifyBrandBehaviorSlot(0.42, 0)).toBe("secondary");
    expect(classifyBrandBehaviorSlot(0.42, 0)).not.toBe("primary");
  });

  it("scoreBrandBehavior bajo en cluster de una sola página", () => {
    const pages = Array.from({ length: 17 }, (_, i) => mockPage(i + 1));
    const cluster = [brandSample(5, { signature: new Uint8Array([1, 0, 1, 0, 0, 1, 0, 1]) })];
    const behavior = scoreBrandBehavior(cluster, pages, "0".repeat(1024), "doc_x", undefined);
    expect(behavior.invariance).toBeLessThan(0.15);
    expect(classifyBrandBehaviorSlot(behavior.total, 0, behavior)).not.toBe("primary");
  });
});
