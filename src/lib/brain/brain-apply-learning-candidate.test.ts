import { describe, expect, it } from "vitest";
import { defaultProjectAssets, normalizeProjectAssets } from "@/app/spaces/project-assets-metadata";
import { applyLearningCandidateToProjectAssets, inferStrategyWriteTarget } from "./brain-apply-learning-candidate";
import type { StoredLearningCandidate } from "./learning-candidate-schema";

function row(partial: Partial<StoredLearningCandidate>): StoredLearningCandidate {
  return {
    id: partial.id ?? "lc-1",
    projectId: partial.projectId ?? "p1",
    status: partial.status ?? "PENDING_REVIEW",
    candidate: partial.candidate!,
    sourceSessionIds: partial.sourceSessionIds ?? [],
    createdAt: partial.createdAt ?? "2026-01-01T00:00:00.000Z",
    ...(partial.workspaceId ? { workspaceId: partial.workspaceId } : {}),
    ...(partial.nodeId ? { nodeId: partial.nodeId } : {}),
    ...(partial.telemetryNodeType ? { telemetryNodeType: partial.telemetryNodeType } : {}),
    ...(partial.decisionTraceId ? { decisionTraceId: partial.decisionTraceId } : {}),
    ...(partial.decisionTrace ? { decisionTrace: partial.decisionTrace } : {}),
  };
}

describe("inferStrategyWriteTarget", () => {
  it("detecta tono", () => {
    expect(inferStrategyWriteTarget("tone_notes").kind).toBe("languageTraits");
  });
  it("detecta embudo", () => {
    expect(inferStrategyWriteTarget("funnel_awareness").kind).toBe("funnelMessages");
  });
  it("topic libre sin alias → unknown", () => {
    const r = inferStrategyWriteTarget("nota");
    expect(r.kind).toBe("unknown");
  });
});

describe("applyLearningCandidateToProjectAssets", () => {
  const base = () => normalizeProjectAssets(defaultProjectAssets());

  it("DISMISS no cambia assets", () => {
    const assets = base();
    const r = row({
      candidate: {
        type: "BRAND_DNA",
        scope: "BRAND",
        topic: "tone",
        value: "X",
        confidence: 1,
        reasoning: "y".repeat(20),
        evidence: { sourceNodeIds: ["n"], sourceNodeTypes: ["DESIGNER"] },
      },
    });
    const out = applyLearningCandidateToProjectAssets(assets, r, "DISMISS");
    expect(out.applied).toBe(false);
    expect(out.changedPaths).toHaveLength(0);
    expect(out.nextAssets.strategy.decisionTraces).toBeUndefined();
  });

  it("VISUAL_MEMORY + PROMOTE añade confirmedVisualPatterns", () => {
    const assets = base();
    const r = row({
      candidate: {
        type: "VISUAL_MEMORY",
        scope: "PROJECT",
        topic: "visual_direction",
        value: "Priorizar luz natural lateral",
        confidence: 0.8,
        reasoning: "y".repeat(20),
        evidence: { sourceNodeIds: ["n"], sourceNodeTypes: ["DESIGNER"] },
      },
    });
    const out = applyLearningCandidateToProjectAssets(assets, r, "PROMOTE_TO_DNA");
    expect(out.applied).toBe(true);
    expect(out.changedPaths.some((p) => p.includes("confirmedVisualPatterns"))).toBe(true);
    expect(out.nextAssets.strategy.visualReferenceAnalysis?.confirmedVisualPatterns?.[0]).toContain("luz natural");
  });

  it("BRAND_DNA tono actualiza languageTraits", () => {
    const assets = base();
    const r = row({
      candidate: {
        type: "BRAND_DNA",
        scope: "BRAND",
        topic: "tone",
        value: "Cercano y directo",
        confidence: 0.9,
        reasoning: "y".repeat(20),
        evidence: { sourceNodeIds: ["n"], sourceNodeTypes: ["DESIGNER"] },
      },
    });
    const out = applyLearningCandidateToProjectAssets(assets, r, "PROMOTE_TO_DNA");
    expect(out.applied).toBe(true);
    expect(out.nextAssets.strategy.languageTraits).toContain("Cercano y directo");
  });

  it("evita duplicados en languageTraits", () => {
    const assets = base();
    assets.strategy.languageTraits = ["Cercano y directo"];
    const r = row({
      candidate: {
        type: "BRAND_DNA",
        scope: "BRAND",
        topic: "tone",
        value: "Cercano y directo",
        confidence: 0.9,
        reasoning: "y".repeat(20),
        evidence: { sourceNodeIds: ["n"], sourceNodeTypes: ["DESIGNER"] },
      },
    });
    const out = applyLearningCandidateToProjectAssets(assets, r, "PROMOTE_TO_DNA");
    expect(out.nextAssets.strategy.languageTraits.filter((x) => x === "Cercano y directo").length).toBe(1);
  });

  it("KEEP_IN_PROJECT escribe projectOnlyMemories", () => {
    const assets = base();
    const r = row({
      candidate: {
        type: "PROJECT_MEMORY",
        scope: "PROJECT",
        topic: "nota",
        value: "Solo para este proyecto",
        confidence: 0.5,
        reasoning: "y".repeat(20),
        evidence: { sourceNodeIds: ["n"], sourceNodeTypes: ["DESIGNER"] },
      },
    });
    const out = applyLearningCandidateToProjectAssets(assets, r, "KEEP_IN_PROJECT");
    expect(out.applied).toBe(true);
    expect(out.nextAssets.knowledge.projectOnlyMemories?.[0]?.value).toContain("Solo para este proyecto");
  });

  it("BRAND_DNA topic visual_direction añade a confirmedVisualPatterns", () => {
    const assets = base();
    const r = row({
      candidate: {
        type: "BRAND_DNA",
        scope: "BRAND",
        topic: "visual_direction",
        value: "Priorizar interiores con luz natural",
        confidence: 0.9,
        reasoning: "y".repeat(20),
        evidence: { sourceNodeIds: ["n"], sourceNodeTypes: ["DESIGNER"] },
      },
    });
    const out = applyLearningCandidateToProjectAssets(assets, r, "PROMOTE_TO_DNA");
    expect(out.applied).toBe(true);
    expect(out.nextAssets.strategy.visualReferenceAnalysis?.confirmedVisualPatterns?.some((p) => p.includes("luz natural"))).toBe(
      true,
    );
  });

  it("BRAND_DNA con topic no canónico no muta estrategia en PROMOTE", () => {
    const assets = base();
    const r = row({
      candidate: {
        type: "BRAND_DNA",
        scope: "BRAND",
        topic: "nota",
        value: "Algo",
        confidence: 0.9,
        reasoning: "y".repeat(20),
        evidence: { sourceNodeIds: ["n"], sourceNodeTypes: ["DESIGNER"] },
      },
    });
    const out = applyLearningCandidateToProjectAssets(assets, r, "PROMOTE_TO_DNA");
    expect(out.applied).toBe(false);
    expect(out.warnings.some((w) => w.includes("no canónico"))).toBe(true);
  });

  it("SAVE_AS_CONTEXT escribe contextualMemories", () => {
    const assets = base();
    const r = row({
      candidate: {
        type: "OUTLIER",
        scope: "WORKSPACE",
        topic: "ctx",
        value: "Competidor X menciona precio bajo",
        confidence: 0.4,
        reasoning: "y".repeat(20),
        evidence: { sourceNodeIds: ["n"], sourceNodeTypes: ["DESIGNER"] },
      },
    });
    const out = applyLearningCandidateToProjectAssets(assets, r, "SAVE_AS_CONTEXT");
    expect(out.applied).toBe(true);
    expect(out.nextAssets.knowledge.contextualMemories?.[0]?.isOutlier).toBe(false);
  });

  it("al resolver aprendizaje persistido, guarda traces con persist_immediately", () => {
    const assets = base();
    const r = row({
      id: "lc-persist-1",
      nodeId: "designer-1",
      telemetryNodeType: "DESIGNER",
      decisionTraceId: "bdt_pending_1",
      decisionTrace: {
        id: "bdt_pending_1",
        kind: "learning_candidate",
        createdAt: "2026-01-02T00:00:00.000Z",
        persistenceIntent: "pending_review",
        inputs: [{ id: "candidate_topic", kind: "candidate", label: "PROJECT_MEMORY / tone" }],
        outputSummary: { summary: "Se detectan ajustes consistentes." },
        confidence: 0.71,
      },
      candidate: {
        type: "PROJECT_MEMORY",
        scope: "PROJECT",
        topic: "project_memory",
        value: "Mantener tono breve en este proyecto.",
        confidence: 0.71,
        reasoning: "y".repeat(20),
        evidence: { sourceNodeIds: ["designer-1"], sourceNodeTypes: ["DESIGNER"] },
      },
    });
    const out = applyLearningCandidateToProjectAssets(assets, r, "KEEP_IN_PROJECT");
    const traces = out.nextAssets.strategy.decisionTraces ?? [];
    expect(out.applied).toBe(true);
    expect(traces.length).toBeGreaterThan(0);
    const promotedCandidate = traces.find((t) => t.id === "bdt_pending_1");
    expect(promotedCandidate?.persistenceIntent).toBe("persist_immediately");
    const resolutionTrace = traces.find((t) => t.kind === "merge_resolution");
    expect(resolutionTrace?.persistenceIntent).toBe("persist_immediately");
  });
});
