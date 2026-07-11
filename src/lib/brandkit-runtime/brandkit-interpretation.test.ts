import { describe, expect, it } from "vitest";
import { defaultProjectAssets, normalizeProjectAssets } from "@/app/spaces/project-assets-metadata";
import { LEGACY_BRANDKIT_RUNTIME_FIXTURE } from "./fixtures/legacy-brandkit-assets.fixture";
import {
  applySynthesisToSidecar,
  createValidatedMeta,
  emptyBrandKitBoardMeta,
  getMeta,
  markValidated,
  normalizeBrandKitBoardMeta,
  patchMeta,
  recountReview,
  resolveConflict,
} from "./interpretation";
import { buildBrandBoardView, bootstrapSidecarFromAssets } from "./board-projection";
import { computeCompleteness } from "./completeness";
import { affectedSections } from "./interpretation";

describe("T2 — legacy sin boardMeta", () => {
  it("normaliza y abre vista Board con ghosts/proposed bootstrap", () => {
    const assets = normalizeProjectAssets(LEGACY_BRANDKIT_RUNTIME_FIXTURE);
    expect(assets.brainMeta?.boardMeta).toBeUndefined();

    const view = buildBrandBoardView(assets);
    expect(view.logo.primary.url).toContain("legacyLogoPositive");
    expect(view.voice.tagline).toContain("Claridad visual");
    expect(view.palette.length).toBe(3);
    expect(view.references.people.rule).toContain("Profesionales");
    expect(view.completenessPercent).toBeGreaterThan(0);

    const boot = bootstrapSidecarFromAssets(assets);
    expect(Object.keys(boot.interpretation).length).toBeGreaterThan(0);
    expect(getMeta(boot, "logo.primary").status).toBe("proposed");
  });

  it("persistir sidecar vacío normaliza sin crash", () => {
    const meta = normalizeBrandKitBoardMeta(undefined);
    expect(meta.review).toEqual({ pending: 0, conflicts: 0 });
  });
});

describe("T3 — máquina de estados sidecar", () => {
  it("validated + síntesis distinta ⇒ conflict con candidatos", () => {
    let sidecar = patchMeta(emptyBrandKitBoardMeta(), "messages.tagline", createValidatedMeta());
    sidecar = applySynthesisToSidecar(sidecar, "Tagline original", {
      key: "messages.tagline",
      nextValue: "Tagline nueva del PDF",
      evidence: [{ sourceId: "pdf-1", kind: "pdf-llm", confidence: 0.9, extractedAt: "2026-01-01T00:00:00.000Z" }],
    });
    const meta = getMeta(sidecar, "messages.tagline");
    expect(meta.status).toBe("conflict");
    expect(meta.conflict?.candidates).toHaveLength(2);
    expect(recountReview(sidecar.interpretation).conflicts).toBe(1);
  });

  it("proposed + síntesis ⇒ overwrite con history", () => {
    let sidecar = emptyBrandKitBoardMeta();
    sidecar = applySynthesisToSidecar(sidecar, "A", {
      key: "tone",
      nextValue: "B",
      evidence: [],
    });
    sidecar = applySynthesisToSidecar(sidecar, "B", {
      key: "tone",
      nextValue: "C",
      evidence: [],
    });
    const meta = getMeta(sidecar, "tone");
    expect(meta.status).toBe("proposed");
    expect(meta.history?.length).toBeGreaterThan(0);
  });

  it("resolver conflicto ⇒ validated", () => {
    let sidecar = patchMeta(emptyBrandKitBoardMeta(), "messages.tagline", createValidatedMeta());
    sidecar = applySynthesisToSidecar(sidecar, "Original", {
      key: "messages.tagline",
      nextValue: "Nuevo",
      evidence: [],
    });
    sidecar = resolveConflict(sidecar, "messages.tagline", "Nuevo");
    expect(getMeta(sidecar, "messages.tagline").status).toBe("validated");
  });

  it("markValidated baja pending", () => {
    let sidecar = applySynthesisToSidecar(emptyBrandKitBoardMeta(), "", {
      key: "logo.primary",
      nextValue: "data:image/png;base64,x",
      evidence: [],
    });
    expect(recountReview(sidecar.interpretation).pending).toBe(1);
    sidecar = markValidated(sidecar, "logo.primary");
    expect(recountReview(sidecar.interpretation).pending).toBe(0);
  });
});

describe("T10 — computeCompleteness determinista", () => {
  it("fixture legacy con sidecar proposed produce valor estable", () => {
    const assets = normalizeProjectAssets(LEGACY_BRANDKIT_RUNTIME_FIXTURE);
    const sidecar = bootstrapSidecarFromAssets(assets);
    const score = computeCompleteness(assets, sidecar);
    expect(score).toBe(52);
  });

  it("validated mejora score vs ghost", () => {
    const assets = defaultProjectAssets();
    const enriched = {
      ...assets,
      brand: {
        ...assets.brand,
        logoPositive: "data:image/png;base64,x",
        colorPrimary: "#111111",
        colorSecondary: "#222222",
        colorAccent: "#333333",
      },
      knowledge: { ...assets.knowledge, corporateContext: "Tagline" },
      strategy: {
        ...assets.strategy,
        languageTraits: ["uno", "dos", "tres"],
        visualStyle: {
          ...assets.strategy.visualStyle,
          people: { ...assets.strategy.visualStyle.people, description: "Regla personas" },
        },
      },
    };
    const ghostScore = computeCompleteness(enriched, emptyBrandKitBoardMeta());
    let validated = emptyBrandKitBoardMeta();
    validated = markValidated(validated, "logo.primary");
    validated = markValidated(validated, "palette.colorPrimary");
    validated = markValidated(validated, "palette.colorSecondary");
    validated = markValidated(validated, "palette.colorAccent");
    validated = markValidated(validated, "messages.tagline");
    validated = markValidated(validated, "tone");
    validated = markValidated(validated, "references.people.rule");
    const validatedScore = computeCompleteness(enriched, validated);
    expect(validatedScore).toBeGreaterThan(ghostScore);
  });
});

describe("affectedSections", () => {
  it("imagen solo toca referencias y paleta", () => {
    const sections = affectedSections("image");
    expect(sections.some((s) => s.startsWith("references."))).toBe(true);
    expect(sections).toContain("palette");
    expect(sections).not.toContain("tone");
  });
});
