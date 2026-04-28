import { describe, expect, it } from "vitest";
import { defaultProjectAssets } from "@/app/spaces/project-assets-metadata";
import { buildBrainRuntimeContext } from "./brain-runtime-context";
import { markBrainStale, normalizeBrainMeta, touchBrainMetaAfterKnowledgeAnalysis } from "./brain-meta";
import { BRAIN_STALE_REASON } from "./brain-stale-reasons";
import { getBrainSignalPriority, mergeBrainSignalsWithPriority } from "./brain-merge-signals";
import type { ContentDna, SafeCreativeRules } from "./brain-creative-memory-types";
import { mergeFactsAndEvidenceWithPriority, mergeStringListsOrdered } from "./brain-merge-strategy-priority";

describe("Brain stale + runtime (guionista)", () => {
  it("markBrainStale then touchBrainMetaAfterKnowledgeAnalysis clears knowledge stale reasons", () => {
    let meta = normalizeBrainMeta(undefined);
    meta = markBrainStale(meta, [BRAIN_STALE_REASON.NEW_DOCUMENT_UPLOADED, BRAIN_STALE_REASON.URL_ADDED]);
    expect(meta.staleReasons).toContain(BRAIN_STALE_REASON.NEW_DOCUMENT_UPLOADED);
    meta = touchBrainMetaAfterKnowledgeAnalysis(meta, 2);
    expect(meta.staleReasons).not.toContain(BRAIN_STALE_REASON.NEW_DOCUMENT_UPLOADED);
    expect(meta.lastKnowledgeAnalysisAt).toBeTruthy();
    expect(meta.brainVersion).toBeGreaterThan(1);
  });

  it("mergeBrainSignalsWithPriority keeps manual over mock-tier priority", () => {
    const manualPri = getBrainSignalPriority("manual");
    const mockPri = getBrainSignalPriority("mock");
    expect(mergeBrainSignalsWithPriority("Manual claim", "Mock claim", manualPri, mockPri)).toBe("Manual claim");
    expect(mergeBrainSignalsWithPriority("Mock claim", "Manual claim", mockPri, manualPri)).toBe("Manual claim");
  });

  it("mergeStringListsOrdered keeps core (previous) entries ahead of autofill", () => {
    const merged = mergeStringListsOrdered(["Core A", "Core B"], ["Noise", "Core A"], 10);
    expect(merged[0]).toBe("Core A");
    expect(merged[1]).toBe("Core B");
    expect(merged).toContain("Noise");
  });

  it("mergeFactsAndEvidenceWithPriority does not replace verified fact with unverified autofill", () => {
    const prev = [
      {
        id: "f1",
        claim: "Same fact",
        strength: "media" as const,
        verified: true,
        interpreted: false,
        evidence: ["doc:1"],
        sourceDocIds: ["d1"],
      },
    ];
    const auto = [
      {
        id: "f2",
        claim: "Same fact",
        strength: "fuerte" as const,
        verified: false,
        interpreted: true,
        evidence: [],
        sourceDocIds: [],
      },
    ];
    const out = mergeFactsAndEvidenceWithPriority(prev, auto);
    expect(out).toHaveLength(1);
    expect(out[0].verified).toBe(true);
  });

  it("buildBrainRuntimeContext for guionista exposes contentDna and safeCreativeRules without raw document payloads", () => {
    const base = defaultProjectAssets();
    const contentDna: ContentDna = {
      audienceProfiles: [],
      contentPillars: ["Pillar 1"],
      topics: ["Topic A"],
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
    };
    const safeCreativeRules: SafeCreativeRules = {
      visualAbstractionRules: [],
      imageGenerationAvoid: [],
      writingClaimRules: [],
      brandSafetyRules: [],
      legalOrComplianceWarnings: [],
      canUse: [],
      shouldAvoid: [],
      doNotGenerate: ["clone competitor ads"],
      evidence: [],
    };
    const assets = {
      ...base,
      brainMeta: markBrainStale(normalizeBrainMeta(base.brainMeta), [BRAIN_STALE_REASON.NEW_DOCUMENT_UPLOADED]),
      knowledge: {
        ...base.knowledge,
        documents: [
          {
            id: "d1",
            name: "Secret.docx",
            size: 1,
            mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            status: "Analizado" as const,
            extractedContext: JSON.stringify({ huge: "x".repeat(5000) }),
          },
        ],
      },
      strategy: {
        ...base.strategy,
        contentDna,
        safeCreativeRules,
      },
    };
    const ctx = buildBrainRuntimeContext({
      assets,
      targetNodeType: "guionista",
      useCase: "article_generation",
    });
    expect(ctx.contentDna?.topics).toContain("Topic A");
    expect(ctx.safeCreativeRules?.doNotGenerate).toContain("clone competitor ads");
    const k = ctx.knowledge as Record<string, unknown>;
    expect(k).not.toHaveProperty("documents");
    expect(JSON.stringify(ctx)).not.toContain("x".repeat(200));
    expect(ctx.guionistaPack?.topics).toContain("Topic A");
  });
});
