import { describe, expect, it } from "vitest";
import type { ContentDna, SafeCreativeRules } from "./brain-creative-memory-types";
import { mergeContentDnaWithPriority } from "./brain-merge-content-dna-priority";
import { mergeSafeCreativeRulesWithPriority } from "./brain-merge-safe-creative-rules-priority";
import { enrichStrategyCreativeMemory } from "./brain-strategy-creative-enrich";
import { defaultProjectAssets } from "@/app/spaces/project-assets-metadata";
import { buildBrainRuntimeContext } from "./brain-runtime-context";

function baseContentDna(over: Partial<ContentDna> = {}): ContentDna {
  return {
    audienceProfiles: [],
    contentPillars: [],
    topics: [],
    trendOpportunities: [],
    preferredFormats: [],
    articleStructures: [],
    forbiddenClaims: [],
    approvedClaims: [],
    writingDo: [],
    writingAvoid: [],
    narrativeAngles: [],
    evidence: [],
    confidence: 0.5,
    ...over,
  };
}

function baseSafe(over: Partial<SafeCreativeRules> = {}): SafeCreativeRules {
  return {
    schemaVersion: "1.0.0",
    visualAbstractionRules: [],
    imageGenerationAvoid: [],
    writingClaimRules: [],
    brandSafetyRules: [],
    legalOrComplianceWarnings: [],
    canUse: [],
    shouldAvoid: [],
    doNotGenerate: [],
    evidence: [],
    ...over,
  };
}

describe("mergeContentDnaWithPriority", () => {
  it("A: manual existente no es sustituido por incoming mock (pilares)", () => {
    const existing = baseContentDna({
      contentPillars: ["Pilar manual A", "Pilar manual B"],
      confidence: 0.8,
      evidence: [{ id: "e-man", sourceType: "manual", reason: "editor", confidence: 0.9 }],
    });
    const incoming = baseContentDna({
      contentPillars: ["Mock pillar X", "Mock pillar Y"],
      topics: ["only-mock-topic"],
      confidence: 0.2,
    });
    const out = mergeContentDnaWithPriority({
      existingContentDna: existing,
      incomingContentDna: incoming,
      sourceContext: { incomingOrigin: "mock", existingOrigin: "manual" },
    });
    expect(out.contentPillars[0]).toBe("Pilar manual A");
    expect(out.contentPillars).toContain("Pilar manual B");
    expect(out.contentPillars).not.toContain("Mock pillar X");
  });

  it("B: vacío se completa con incoming fiable", () => {
    const incoming = baseContentDna({
      contentPillars: ["Nuevo pilar"],
      topics: ["Tema único"],
      confidence: 0.72,
      evidence: [{ id: "d1", sourceType: "document", reason: "core", confidence: 0.7 }],
    });
    const out = mergeContentDnaWithPriority({
      existingContentDna: undefined,
      incomingContentDna: incoming,
      sourceContext: { incomingOrigin: "remote_ai" },
    });
    expect(out.contentPillars).toEqual(["Nuevo pilar"]);
    expect(out.topics).toContain("Tema único");
  });

  it("C: narrativeAngles fuertes conservan orden frente a autofill débil", () => {
    const existing = baseContentDna({
      narrativeAngles: ["Ángulo editorial A", "Ángulo editorial B"],
      confidence: 0.75,
      evidence: [{ id: "d2", sourceType: "document", reason: "x", confidence: 0.72 }],
    });
    const incoming = baseContentDna({
      narrativeAngles: ["Inferido Z", "Inferido W"],
      confidence: 0.35,
    });
    const out = mergeContentDnaWithPriority({
      existingContentDna: existing,
      incomingContentDna: incoming,
      sourceContext: { incomingOrigin: "mock", existingOrigin: "remote_ai" },
    });
    expect(out.narrativeAngles[0]).toBe("Ángulo editorial A");
    expect(out.narrativeAngles[1]).toBe("Ángulo editorial B");
  });

  it("D: approvedClaims + evidence conservan entradas previas", () => {
    const existing = baseContentDna({
      approvedClaims: ["Claim con respaldo"],
      evidence: [{ id: "keep-me", sourceType: "manual", reason: "legal", confidence: 0.95 }],
      confidence: 0.7,
    });
    const incoming = baseContentDna({
      approvedClaims: ["Otro claim"],
      evidence: [{ id: "new-ev", sourceType: "analysis", reason: "inferido", confidence: 0.4 }],
    });
    const out = mergeContentDnaWithPriority({
      existingContentDna: existing,
      incomingContentDna: incoming,
      sourceContext: { incomingOrigin: "mock", existingOrigin: "manual" },
    });
    expect(out.approvedClaims[0]).toBe("Claim con respaldo");
    expect(out.evidence.map((e) => e.id)).toContain("keep-me");
    expect(out.evidence.map((e) => e.id)).toContain("new-ev");
  });

  it("E: forbiddenClaims se acumula sin perder previas", () => {
    const existing = baseContentDna({ forbiddenClaims: ["nunca X"] });
    const incoming = baseContentDna({ forbiddenClaims: ["nunca Y"] });
    const out = mergeContentDnaWithPriority({
      existingContentDna: existing,
      incomingContentDna: incoming,
      sourceContext: { incomingOrigin: "remote_ai" },
    });
    expect(out.forbiddenClaims).toContain("nunca X");
    expect(out.forbiddenClaims).toContain("nunca Y");
  });

  it("I: no duplica listas (case-insensitive)", () => {
    const existing = baseContentDna({ topics: ["Alpha"] });
    const incoming = baseContentDna({ topics: ["alpha", "Beta"] });
    const out = mergeContentDnaWithPriority({
      existingContentDna: existing,
      incomingContentDna: incoming,
      sourceContext: { incomingOrigin: "remote_ai" },
    });
    expect(out.topics.filter((t) => t.toLowerCase() === "alpha")).toHaveLength(1);
    expect(out.topics).toContain("Beta");
  });
});

describe("mergeSafeCreativeRulesWithPriority", () => {
  it("F: doNotGenerate gana sobre canUse (filtrado)", () => {
    const existing = baseSafe({
      doNotGenerate: ["no promocionar alcohol"],
      canUse: ["tono cercano", "promocionar alcohol barato"],
    });
    const incoming = baseSafe({
      canUse: ["promocionar alcohol barato", "otro uso"],
    });
    const out = mergeSafeCreativeRulesWithPriority({
      existingSafeCreativeRules: existing,
      incomingSafeCreativeRules: incoming,
      sourceContext: { incomingOrigin: "remote_ai" },
    });
    expect(out.doNotGenerate.join(" ")).toContain("alcohol");
    expect(out.canUse.some((c) => c.toLowerCase().includes("alcohol"))).toBe(false);
  });

  it("G: restrictivas no desaparecen si incoming no las trae", () => {
    const existing = baseSafe({
      doNotGenerate: ["no clonar"],
      shouldAvoid: ["celebridades"],
      imageGenerationAvoid: ["marca X"],
    });
    const incoming = baseSafe({ doNotGenerate: [], shouldAvoid: [], imageGenerationAvoid: [] });
    const out = mergeSafeCreativeRulesWithPriority({
      existingSafeCreativeRules: existing,
      incomingSafeCreativeRules: incoming,
      sourceContext: { incomingOrigin: "remote_ai" },
    });
    expect(out.doNotGenerate).toContain("no clonar");
    expect(out.shouldAvoid).toContain("celebridades");
    expect(out.imageGenerationAvoid).toContain("marca X");
  });

  it("H: mock no sustituye protectedReferencePolicy fuerte", () => {
    const longPolicy =
      "Política fuerte del proyecto: referencias solo como abstracción de estilo, sin copiar piezas de terceros.";
    const existing = baseSafe({
      protectedReferencePolicy: longPolicy,
      evidence: [{ id: "m1", sourceType: "manual", reason: "policy" }],
    });
    const incoming = baseSafe({
      protectedReferencePolicy: "Relajar todo",
    });
    const out = mergeSafeCreativeRulesWithPriority({
      existingSafeCreativeRules: existing,
      incomingSafeCreativeRules: incoming,
      sourceContext: { incomingOrigin: "mock", existingOrigin: "manual" },
    });
    expect(out.protectedReferencePolicy).toContain("abstracción");
    expect(out.protectedReferencePolicy).not.toBe("Relajar todo");
  });
});

describe("enrichStrategyCreativeMemory + runtime guionista", () => {
  it("J: runtime guionista recibe contentDna y safeCreativeRules fusionados", () => {
    const assets = defaultProjectAssets();
    const strategy = {
      ...assets.strategy,
      contentDna: baseContentDna({
        contentPillars: ["Manual pillar"],
        confidence: 0.82,
        evidence: [{ id: "man-1", sourceType: "manual", reason: "user", confidence: 0.9 }],
      }),
      safeCreativeRules: baseSafe({
        doNotGenerate: ["no IP"],
        protectedReferencePolicy: "Solo estilo abstracto reutilizable.",
      }),
    };
    const merged = enrichStrategyCreativeMemory(strategy, {
      knowledgeDocuments: [],
      corporateContext: "",
      incomingCreativeSignalOrigins: { contentDna: "mock", safeCreativeRules: "mock" },
    });
    const ctx = buildBrainRuntimeContext({
      assets: { ...assets, strategy: merged },
      targetNodeType: "guionista",
      useCase: "article_generation",
    });
    expect(ctx.contentDna?.contentPillars).toContain("Manual pillar");
    expect(ctx.safeCreativeRules?.doNotGenerate.join(" ")).toMatch(/no IP/);
    expect(ctx.guionistaPack?.contentPillars).toContain("Manual pillar");
  });
});
