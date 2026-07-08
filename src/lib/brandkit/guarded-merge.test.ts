import { describe, expect, it } from "vitest";
import { defaultProjectAssets, normalizeProjectAssets } from "@/app/spaces/project-assets-metadata";
import { LEGACY_BRANDKIT_RUNTIME_FIXTURE } from "./fixtures/legacy-brandkit-assets.fixture";
import {
  applyGuardedAnalyzeMerge,
  applyGuardedAssetMerge,
  applyTypographyLlmSynthesisSidecar,
  markSidecarValidatedOnManualWrite,
} from "./guarded-merge";
import {
  createValidatedMeta,
  emptyBrandKitBoardMeta,
  getMeta,
  patchMeta,
} from "./interpretation";

describe("T3 — guardedMerge servidor (analyze)", () => {
  it("propone cambios en raw cuando sidecar no está validated", () => {
    const previous = normalizeProjectAssets(LEGACY_BRANDKIT_RUNTIME_FIXTURE);
    const candidateStrategy = {
      ...previous.strategy,
      languageTraits: ["nuevo", "tono", "analizado"],
    };
    const result = applyGuardedAnalyzeMerge({
      previous,
      candidateStrategy,
      candidateCorporateContext: "Contexto corporativo del PDF",
      options: { sourceId: "pdf-1", evidenceKind: "pdf-llm" },
    });
    expect(result.assets.knowledge.corporateContext).toContain("Contexto corporativo");
    expect(result.assets.strategy.languageTraits).toEqual(["nuevo", "tono", "analizado"]);
    expect(getMeta(result.boardMeta, "messages.tagline").status).toBe("proposed");
    expect(getMeta(result.boardMeta, "tone").status).toBe("proposed");
  });

  it("candidateBrand escribe logo y paleta en assets", () => {
    const previous = normalizeProjectAssets(defaultProjectAssets());
    const result = applyGuardedAnalyzeMerge({
      previous,
      candidateStrategy: previous.strategy,
      candidateCorporateContext: "Marca premium",
      candidateBrand: {
        logoPositive: "brain/brand/logos/test/positive-p1.png",
        colorPrimary: "#112233",
        colorSecondary: "#AABBCC",
        colorAccent: "#FF5500",
      },
      options: { sourceId: "pdf-brand", evidenceKind: "pdf-embedded" },
    });
    expect(result.assets.brand.logoPositive).toContain("positive-p1.png");
    expect(result.assets.brand.colorPrimary).toBe("#112233");
    expect(getMeta(result.boardMeta, "logo.primary").status).toBe("proposed");
    expect(getMeta(result.boardMeta, "palette.colorPrimary").status).toBe("proposed");
  });

  it("validated impide overwrite raw y levanta conflict", () => {
    const previous = normalizeProjectAssets({
      ...LEGACY_BRANDKIT_RUNTIME_FIXTURE,
      brainMeta: {
        ...LEGACY_BRANDKIT_RUNTIME_FIXTURE.brainMeta,
        boardMeta: patchMeta(emptyBrandKitBoardMeta(), "messages.tagline", createValidatedMeta()),
      },
    });
    const result = applyGuardedAnalyzeMerge({
      previous,
      candidateStrategy: previous.strategy,
      candidateCorporateContext: "Tagline distinta del análisis",
      options: { sourceId: "pdf-2", evidenceKind: "pdf-llm" },
    });
    expect(result.assets.knowledge.corporateContext).toContain("Marca orientada");
    expect(getMeta(result.boardMeta, "messages.tagline").status).toBe("conflict");
    expect(result.conflictsRaised).toContain("messages.tagline");
  });
});

describe("T8 — conflicto tipográfico / tagline", () => {
  it("tone validated + candidato distinto ⇒ conflict sin pisar traits", () => {
    let boardMeta = patchMeta(emptyBrandKitBoardMeta(), "tone", createValidatedMeta());
    boardMeta = markSidecarValidatedOnManualWrite(boardMeta, "tone");
    const previous = normalizeProjectAssets({
      ...defaultProjectAssets(),
      strategy: {
        ...defaultProjectAssets().strategy,
        languageTraits: ["uno", "dos", "tres"],
      },
      brainMeta: { ...defaultProjectAssets().brainMeta, boardMeta },
    });
    const candidate = normalizeProjectAssets({
      ...previous,
      strategy: {
        ...previous.strategy,
        languageTraits: ["formal", "premium", "serio"],
      },
    });
    const result = applyGuardedAssetMerge(previous, candidate, {
      sourceId: "analyze-tone",
      evidenceKind: "pdf-llm",
    });
    expect(result.assets.strategy.languageTraits).toEqual(["uno", "dos", "tres"]);
    expect(getMeta(result.boardMeta, "tone").status).toBe("conflict");
    expect(result.conflictsRaised).toContain("tone");
  });
});

describe("brandLocked — sin escrituras raw en marca", () => {
  it("allowBrandWrites false mantiene raw y registra sidecar", () => {
    const previous = normalizeProjectAssets(LEGACY_BRANDKIT_RUNTIME_FIXTURE);
    const candidate = normalizeProjectAssets({
      ...previous,
      brand: {
        ...previous.brand,
        colorPrimary: "#ABCDEF",
      },
    });
    const result = applyGuardedAssetMerge(previous, candidate, {
      sourceId: "locked-1",
      evidenceKind: "manual",
      allowBrandWrites: false,
    });
    expect(result.assets.brand.colorPrimary).toBe("#112233");
    expect(result.blockedKeys).toContain("palette.colorPrimary");
    expect(getMeta(result.boardMeta, "palette.colorPrimary").status).toBe("proposed");
  });
});

describe("typography llm-synthesis sidecar", () => {
  it("marca typography.primary como proposed con evidencia llm-synthesis", () => {
    const seeded = patchMeta(emptyBrandKitBoardMeta(), "typography.primary", {
      status: "proposed",
      confidence: 0.75,
      evidence: [{ sourceId: "pdf-1", kind: "pdf-llm", confidence: 0.75, extractedAt: "2026-01-01T00:00:00.000Z" }],
      proposedAt: "2026-01-01T00:00:00.000Z",
    });
    const boardMeta = applyTypographyLlmSynthesisSidecar(seeded, {
      sourceId: "typography-vision-test",
    });
    expect(getMeta(boardMeta, "typography.primary").status).toBe("proposed");
    expect(getMeta(boardMeta, "typography.primary").evidence[0]?.kind).toBe("llm-synthesis");
  });
});
