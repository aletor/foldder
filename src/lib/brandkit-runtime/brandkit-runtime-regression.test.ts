import { describe, expect, it } from "vitest";
import { defaultProjectAssets, normalizeProjectAssets } from "@/app/spaces/project-assets-metadata";
import { buildBrainRuntimeContext } from "@/lib/brain/brain-runtime-context";
import { LEGACY_BRANDKIT_RUNTIME_FIXTURE } from "./fixtures/legacy-brandkit-assets.fixture";

const RUNTIME_NODE_TYPES = [
  "guionista",
  "designer",
  "nanoBanana",
  "geminiVideo",
  "cine",
  "photoroom",
] as const;

/** Campos volátiles que no deben entrar en regresión T1. */
function stableRuntimeSnapshot(ctx: ReturnType<typeof buildBrainRuntimeContext>): unknown {
  const clone = JSON.parse(JSON.stringify(ctx)) as Record<string, unknown>;
  delete clone.traceId;
  delete clone.traceSummary;
  if (clone.decisionTrace && typeof clone.decisionTrace === "object") {
    const dt = clone.decisionTrace as Record<string, unknown>;
    delete dt.id;
    delete dt.createdAt;
  }
  return clone;
}

describe("T1 — buildBrainRuntimeContext regression (legacy assets, sin boardMeta)", () => {
  it("fixture legacy normaliza sin boardMeta", () => {
    const assets = normalizeProjectAssets(LEGACY_BRANDKIT_RUNTIME_FIXTURE);
    expect(assets.brainMeta?.boardMeta).toBeUndefined();
  });

  for (const targetNodeType of RUNTIME_NODE_TYPES) {
    it(`snapshot estable para ${targetNodeType}`, () => {
      const assets = normalizeProjectAssets(LEGACY_BRANDKIT_RUNTIME_FIXTURE);
      const ctx = buildBrainRuntimeContext({
        assets,
        targetNodeType,
        targetNodeId: "node-regression-1",
        projectScopeId: "project-regression-1",
        useCase: "brandkit_pr0_regression",
      });
      expect(stableRuntimeSnapshot(ctx)).toMatchSnapshot();
    });
  }

  it("defaultProjectAssets sin boardMeta no cambia salida guionista", () => {
    const assets = defaultProjectAssets();
    const ctx = buildBrainRuntimeContext({
      assets,
      targetNodeType: "guionista",
    });
    expect(stableRuntimeSnapshot(ctx)).toMatchSnapshot();
  });
});

describe("T1 — boardMeta persistido filtra runtime solo validated", () => {
  it("legacy sin boardMeta mantiene corporateContext y traits en runtime", () => {
    const base = normalizeProjectAssets(LEGACY_BRANDKIT_RUNTIME_FIXTURE);
    const ctx = buildBrainRuntimeContext({ assets: base, targetNodeType: "designer" });
    expect(ctx.knowledge.corporateContext).toContain("Marca orientada");
    expect(ctx.voice.traits).toEqual(["directo", "técnico", "cercano"]);
  });

  it("sidecar solo proposed vacía campos no validated en runtime", () => {
    const base = normalizeProjectAssets(LEGACY_BRANDKIT_RUNTIME_FIXTURE);
    const withSidecar = {
      ...base,
      brainMeta: {
        ...base.brainMeta,
        boardMeta: {
          interpretation: {
            "messages.tagline": {
              status: "proposed",
              confidence: 0.8,
              evidence: [],
              proposedAt: "2026-01-01T00:00:00.000Z",
            },
          },
          review: { pending: 1, conflicts: 0 },
          board: { sectionSeq: {}, sectionState: {} },
        },
      },
    };
    const ctx = buildBrainRuntimeContext({ assets: withSidecar, targetNodeType: "designer" });
    expect(ctx.knowledge.corporateContext).toBe("");
    expect(ctx.voice.traits).toEqual([]);
  });

  it("tagline validated conserva corporateContext en runtime", () => {
    const base = normalizeProjectAssets(LEGACY_BRANDKIT_RUNTIME_FIXTURE);
    const withValidated = {
      ...base,
      brainMeta: {
        ...base.brainMeta,
        boardMeta: {
          interpretation: {
            "messages.tagline": {
              status: "validated",
              confidence: 1,
              evidence: [],
              validatedAt: "2026-01-01T00:00:00.000Z",
            },
          },
          review: { pending: 0, conflicts: 0 },
          board: { sectionSeq: {}, sectionState: {} },
        },
      },
    };
    const ctx = buildBrainRuntimeContext({ assets: withValidated, targetNodeType: "designer" });
    expect(ctx.knowledge.corporateContext).toContain("Marca orientada");
  });
});
