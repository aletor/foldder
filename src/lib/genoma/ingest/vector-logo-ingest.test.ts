import { describe, expect, it } from "vitest";
import { emptyGenome, crownedCandidates, getTrait, addCandidate, createTrait, upsertTrait } from "../model/trait";
import {
  autoCrownRasterLogoPrimary,
  crownVectorLogoIntoGenome,
  hasCrownedLogoPrimary,
} from "./vector-logo-ingest";
import { BRAND_BEHAVIOR_PRIMARY } from "../extractors/brand-behavior";
import { createCandidate, signal } from "../model/evidence";
import { BRAND_LOGO_MARK_FILENAME } from "../fixtures/brandkit-paths";
import type { LogoValue } from "../model/trait-values";

const MINIMAL_SVG = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40"><rect width="100" height="40" fill="#000"/></svg>`,
  "utf8",
);

describe("crownVectorLogoIntoGenome (T-vección)", () => {
  it("corona logo.primary con vectorUrl sin modal", async () => {
    const source = {
      id: "src_test",
      kind: "image" as const,
      label: BRAND_LOGO_MARK_FILENAME,
      addedAt: new Date().toISOString(),
    };
    const result = await crownVectorLogoIntoGenome({
      svgBuffer: MINIMAL_SVG,
      label: BRAND_LOGO_MARK_FILENAME,
      genomeInput: emptyGenome(),
      source,
      signalDetail: "SVG de marca aportado",
      userSupplied: true,
    });
    const trait = getTrait(result.genome, "logo.primary");
    expect(trait).toBeDefined();
    const crowned = crownedCandidates(trait!);
    expect(crowned).toHaveLength(1);
    expect(crowned[0].status).toBe("crowned");
    expect(crowned[0].derived?.vectorUrl).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(result.prompts).toHaveLength(0);
  });
});

describe("autoCrownRasterLogoPrimary", () => {
  it("corona candidato primary cuando brandBehavior supera umbral", () => {
    let genome = emptyGenome();
    const candidate = createCandidate<LogoValue>({
      value: { imageUrl: "data:image/png;base64,abc", variant: "positive", label: "logo" },
      signals: [signal("recurrence", { scale: 0.9 })],
      signature: "phash_primary",
      sourceRefs: ["src_pdf"],
    });
    genome = {
      ...genome,
      traits: {
        ...genome.traits,
        "logo.primary": addCandidate(createTrait("logo.primary"), candidate),
      },
    };

    const next = autoCrownRasterLogoPrimary(genome, {
      buffer: Buffer.from("x"),
      variant: "positive",
      confidence: 0.9,
      pageNumber: 1,
      logoPHash: "phash_primary",
      slot: "primary",
      brandBehavior: {
        invariance: 0.8,
        structuralPosition: 0.7,
        interDocument: 1,
        scaleSubordination: 0.9,
        total: BRAND_BEHAVIOR_PRIMARY + 0.1,
      },
    });

    expect(hasCrownedLogoPrimary(next)).toBe(true);
    expect(crownedCandidates(getTrait(next, "logo.primary")!)[0]?.id).toBe(candidate.id);
  });

  it("no corona si brandBehavior está por debajo del umbral", () => {
    let genome = emptyGenome();
    const candidate = createCandidate<LogoValue>({
      value: { imageUrl: "data:image/png;base64,abc", variant: "positive", label: "logo" },
      signals: [signal("recurrence", { scale: 0.4 })],
      signature: "phash_low",
      sourceRefs: ["src_pdf"],
    });
    genome = upsertTrait(genome, addCandidate(createTrait("logo.primary"), candidate));

    const next = autoCrownRasterLogoPrimary(genome, {
      buffer: Buffer.from("x"),
      variant: "positive",
      confidence: 0.4,
      pageNumber: 1,
      logoPHash: "phash_low",
      slot: "primary",
      brandBehavior: {
        invariance: 0.2,
        structuralPosition: 0.3,
        interDocument: 0.5,
        scaleSubordination: 0,
        total: 0.3,
      },
    });

    expect(hasCrownedLogoPrimary(next)).toBe(false);
  });
});
