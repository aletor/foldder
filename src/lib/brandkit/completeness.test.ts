import { describe, expect, it, vi } from "vitest";
import { defaultProjectAssets, normalizeProjectAssets } from "@/app/spaces/project-assets-metadata";
import { bootstrapSidecarFromAssets } from "./board-projection";
import { buildBookDerivations } from "./book-derivations";
import {
  computeCompleteness,
  computeCompletenessBreakdown,
} from "./completeness";
import { LEGACY_BRANDKIT_RUNTIME_FIXTURE } from "./fixtures/legacy-brandkit-assets.fixture";
import {
  createValidatedMeta,
  emptyBrandKitBoardMeta,
  markRejected,
  markValidated,
  patchMeta,
} from "./interpretation";
import { shouldVectorizeOnValidation } from "./vectorize-logo";

describe("T-A — completeness v2 (proyección y guardarraíles)", () => {
  it("T-A1: artefactos crudos no inflan el porcentaje del libro", () => {
    const assets = normalizeProjectAssets({
      ...defaultProjectAssets(),
      knowledge: {
        ...defaultProjectAssets().knowledge,
        corporateContext: "### Document: sample-brand-deck.pdf",
        documents: [{ id: "d1", name: "sample-brand-deck.pdf", size: 1, mime: "application/pdf" }],
      },
      strategy: {
        ...defaultProjectAssets().strategy,
        languageTraits: ["FORMAL", "TRUSTWORTHY", "INSIGHTFUL"],
        visualStyle: {
          ...defaultProjectAssets().strategy.visualStyle,
          protagonist: {
            ...defaultProjectAssets().strategy.visualStyle.protagonist,
            description:
              "A forward-thinking executive illustrating the capabilities of an advanced identity platform.",
          },
        },
      },
    });

    const boardMeta = bootstrapSidecarFromAssets(assets);
    expect(computeCompleteness(assets, boardMeta)).toBeLessThan(15);
  });

  it("T-A2: validated mejora el % frente a proposed en identidad + voz", () => {
    const assets = normalizeProjectAssets(LEGACY_BRANDKIT_RUNTIME_FIXTURE);
    const proposed = bootstrapSidecarFromAssets(assets);
    const proposedScore = computeCompleteness(assets, proposed);

    let validated = proposed;
    validated = markValidated(validated, "logo.primary");
    validated = markValidated(validated, "palette.colorPrimary");
    validated = markValidated(validated, "palette.colorSecondary");
    validated = markValidated(validated, "palette.colorAccent");
    validated = markValidated(validated, "messages.tagline");
    validated = markValidated(validated, "tone");
    validated = markValidated(validated, "voice.examples");

    expect(computeCompleteness(assets, validated)).toBeGreaterThan(proposedScore);
  });

  it("expone breakdown con buckets logo/voz/referencias", () => {
    const assets = normalizeProjectAssets(LEGACY_BRANDKIT_RUNTIME_FIXTURE);
    const breakdown = computeCompletenessBreakdown(assets, bootstrapSidecarFromAssets(assets));

    expect(breakdown.total).toBe(100);
    expect(breakdown.buckets.some((bucket) => bucket.id === "voice.examples")).toBe(true);
    expect(breakdown.buckets.find((bucket) => bucket.id === "logo.primary")?.max).toBeGreaterThan(
      breakdown.buckets.find((bucket) => bucket.id === "references")?.max ?? 0,
    );
  });
});

describe("T-B — completeness vs derivadores del libro", () => {
  it("proyecto con logo y paleta puntúa más que vacío y alimenta derivaciones", () => {
    const empty = defaultProjectAssets();
    const emptyScore = computeCompleteness(empty, emptyBrandKitBoardMeta());

    const assets = defaultProjectAssets();
    assets.brand.logoPositive = "https://example.com/logo.png";
    assets.brand.colorPrimary = "#112233";
    assets.brand.colorSecondary = "#AABBCC";
    assets.brand.colorAccent = "#FF5500";
    assets.strategy.languageTraits = ["directo", "claro", "técnico"];
    assets.strategy.voiceExamples = [
      { id: "v1", kind: "approved_voice", text: "Ejemplo uno" },
      { id: "v2", kind: "approved_voice", text: "Ejemplo dos" },
      { id: "v3", kind: "forbidden_voice", text: "Ejemplo tres" },
    ];

    let boardMeta = emptyBrandKitBoardMeta();
    boardMeta = patchMeta(boardMeta, "logo.primary", createValidatedMeta("user"));
    boardMeta = patchMeta(boardMeta, "palette.colorPrimary", createValidatedMeta("user"));
    boardMeta = patchMeta(boardMeta, "palette.colorSecondary", createValidatedMeta("user"));
    boardMeta = patchMeta(boardMeta, "palette.colorAccent", createValidatedMeta("user"));
    boardMeta = patchMeta(boardMeta, "tone", createValidatedMeta("user"));
    boardMeta = patchMeta(boardMeta, "voice.examples", createValidatedMeta("user"));

    const score = computeCompleteness(assets, boardMeta);
    const derivations = buildBookDerivations(assets, boardMeta);

    expect(score).toBeGreaterThan(emptyScore);
    expect(score).toBeGreaterThanOrEqual(45);
    expect(derivations.palette).toHaveLength(3);
    expect(derivations.logoSafeArea).not.toBeNull();
  });
});

describe("T-V — rejected y vectorización L6", () => {
  it("T-V1: rejected no suma en completeness", () => {
    const assets = normalizeProjectAssets(LEGACY_BRANDKIT_RUNTIME_FIXTURE);
    const boardMeta = bootstrapSidecarFromAssets(assets);
    const before = computeCompleteness(assets, boardMeta);
    const rejected = markRejected(boardMeta, "logo.primary");

    expect(computeCompleteness(assets, rejected)).toBeLessThan(before);
  });

  it("T-V1: shouldVectorizeOnValidation solo en logo.primary validado", () => {
    expect(shouldVectorizeOnValidation("logo.primary")).toBe(true);
    expect(shouldVectorizeOnValidation("logo.alt")).toBe(false);
  });

  it("T-V1: vectorización solo tras validar logo.primary, no al rechazar", async () => {
    const vectorizeModule = await import("./vectorize-logo");
    const vectorizeSpy = vi.spyOn(vectorizeModule, "vectorizeValidatedLogo").mockResolvedValue({
      attempted: false,
      reason: "vectorizer_not_configured",
    });

    const assets = normalizeProjectAssets(LEGACY_BRANDKIT_RUNTIME_FIXTURE);
    await import("./brandkit-board-actions").then(({ applyLogoPrimaryValidationEffects, rejectLogoCandidateOnAssets }) => {
      return Promise.all([
        applyLogoPrimaryValidationEffects(assets),
        Promise.resolve(rejectLogoCandidateOnAssets(assets, "https://cdn/partner.png", "logo.candidate.c1")),
      ]);
    });

    expect(vectorizeSpy).toHaveBeenCalledTimes(1);
    vectorizeSpy.mockRestore();
  });
});
