import { describe, expect, it } from "vitest";
import {
  defaultProjectAssets,
  normalizeProjectAssets,
  type BrainVisualImageAnalysis,
  type ProjectAssetsMetadata,
} from "@/app/spaces/project-assets-metadata";
import {
  buildBrainVisualPromptContext,
  composeBrainDesignerImagePrompt,
  composeBrainImageGeneratorPrompt,
  composeBrainVisualStyleSlotPrompt,
} from "./build-brain-visual-prompt-context";

function trustedAnalysis(over: Partial<BrainVisualImageAnalysis>): BrainVisualImageAnalysis {
  return {
    id: "a1",
    sourceAssetId: "s1",
    sourceKind: "project_asset",
    subject: "",
    subjectTags: [],
    visualStyle: [],
    mood: [],
    colorPalette: { dominant: [], secondary: [] },
    composition: [],
    people: "",
    clothingStyle: "",
    graphicStyle: "",
    brandSignals: [],
    possibleUse: [],
    classification: "CORE_VISUAL_DNA",
    analyzedAt: new Date().toISOString(),
    analysisStatus: "analyzed",
    visionProviderId: "gemini-vision",
    fallbackUsed: false,
    ...over,
  };
}

function withAnalyses(base: ProjectAssetsMetadata, analyses: BrainVisualImageAnalysis[]): ProjectAssetsMetadata {
  return normalizeProjectAssets({
    ...base,
    strategy: {
      ...base.strategy,
      visualReferenceAnalysis: {
        analyses,
        lastAnalyzedAt: new Date().toISOString(),
      },
    },
  });
}

describe("buildBrainVisualPromptContext", () => {
  it("prioriza análisis remoto fiable sobre copy general en la dirección visual", () => {
    const base = defaultProjectAssets();
    const assets = normalizeProjectAssets({
      ...base,
      knowledge: {
        ...base.knowledge,
        corporateContext:
          "Creative OS unifica el workflow SaaS con dashboards azules y equipos corporativos sonriendo a la pantalla.",
      },
      strategy: {
        ...base.strategy,
        funnelMessages: [{ id: "1", stage: "awareness", text: "Creative OS para escalar tu startup" }],
        visualReferenceAnalysis: {
          analyses: [
            trustedAnalysis({
              id: "v1",
              subjectTags: ["libros", "vinilos", "mesa de trabajo", "madera", "luz natural"],
              visualStyle: ["editorial documental", "lifestyle íntimo"],
              mood: ["cálido", "humano"],
              composition: ["encuadre natural en interior real"],
              graphicStyle: "madera clara, texturas táctiles",
            }),
          ],
        },
      },
    });
    const ctx = buildBrainVisualPromptContext(assets);
    expect(ctx.textOnlyGeneration).toBe(false);
    const blob = `${ctx.visualDirection} ${ctx.subjects.join(" ")}`.toLowerCase();
    expect(blob).toMatch(/libros|vinilos/);
    expect(blob).not.toMatch(/dashboards azules/);
    expect(blob).not.toMatch(/creative os/);
  });

  it("conserva sujetos concretos de referencias (libros, vinilos, madera, luz natural)", () => {
    const base = defaultProjectAssets();
    const assets = withAnalyses(base, [
      trustedAnalysis({
        id: "x",
        classification: "PROJECT_VISUAL_REFERENCE",
        subjectTags: ["libros", "vinilos", "portátil", "bocetos", "luz natural", "madera cálida"],
        mood: ["calma editorial"],
      }),
    ]);
    const ctx = buildBrainVisualPromptContext(assets);
    expect(ctx.subjects.join(" ").toLowerCase()).toMatch(/libros/);
    expect(ctx.subjects.join(" ").toLowerCase()).toMatch(/vinilos/);
    expect(ctx.lighting.join(" ").toLowerCase()).toMatch(/luz natural/);
  });

  it("marca textOnlyGeneration cuando no hay análisis remotos fiables", () => {
    const base = defaultProjectAssets();
    const assets = normalizeProjectAssets(base);
    const ctx = buildBrainVisualPromptContext(assets);
    expect(ctx.textOnlyGeneration).toBe(true);
    expect(ctx.visualContextWeak).toBe(true);
    expect(ctx.visualReferenceAnalysisRealCount).toBe(0);
  });

  it("confirmedVisualPatterns aparecen al inicio de la dirección visual", () => {
    const base = defaultProjectAssets();
    const assets = normalizeProjectAssets({
      ...base,
      strategy: {
        ...base.strategy,
        visualReferenceAnalysis: {
          analyses: [],
          confirmedVisualPatterns: ["libros", "vinilos", "interior cálido"],
        },
      },
    });
    const ctx = buildBrainVisualPromptContext(assets);
    expect(ctx.visualDirection.toLowerCase()).toMatch(/prioridad 1/);
    expect(ctx.visualDirection.toLowerCase()).toMatch(/libros/);
    expect(ctx.sources.confirmedUserVisualDna).toBe(true);
    expect(ctx.sourceTier).toBe("confirmed");
  });

  it("con ADN confirmado el corporate no entra en el bloque A del prompt compuesto", () => {
    const base = defaultProjectAssets();
    const assets = normalizeProjectAssets({
      ...base,
      knowledge: {
        ...base.knowledge,
        corporateContext: "SaaS futurista con dashboards azules y equipo corporativo sonriendo.",
      },
      strategy: {
        ...base.strategy,
        visualReferenceAnalysis: {
          analyses: [],
          confirmedVisualPatterns: ["mesa con bocetos", "madera natural"],
        },
      },
    });
    const ctx = buildBrainVisualPromptContext(assets);
    const { prompt } = composeBrainDesignerImagePrompt({
      context: ctx,
      pieceMessage: "Unificar el flujo creativo",
      pageContext: "hero",
      brandColorLine: "c",
      logoBlock: "sin logo",
    });
    const idxA1 = prompt.indexOf("A1 — NÚCLEO");
    const idxCorp = prompt.indexOf("SaaS futurista");
    expect(idxCorp).toBeGreaterThan(idxA1);
    expect(ctx.visualDirection.toLowerCase()).not.toMatch(/dashboards azules/);
  });

  it("incluye lista visualAvoid con términos de negative visual", () => {
    const ctx = buildBrainVisualPromptContext(defaultProjectAssets());
    const joined = ctx.visualAvoid.join(" ").toLowerCase();
    expect(joined).toMatch(/stock corporate/);
    expect(joined).toMatch(/saas/);
  });

  it("interior cultural (libros/vinilos) evita tech_saas y añade negativos de territorio + diagnóstico de señales", () => {
    const base = defaultProjectAssets();
    const assets = withAnalyses(base, [
      trustedAnalysis({
        id: "cult",
        subjectTags: ["libros", "vinilos", "interior doméstico", "luz natural"],
        visualStyle: ["editorial documental"],
        mood: ["calma", "íntimo"],
        composition: ["encuadre natural"],
      }),
    ]);
    const ctx = buildBrainVisualPromptContext(assets);
    expect(ctx.visualTerritory).not.toBe("tech_saas");
    expect(ctx.visualAvoid.join(" ").toLowerCase()).toMatch(/corporate|boardroom|saas/);
    expect(ctx.visualSignalDiagnostics.dominantCulturalSignals.toLowerCase()).toMatch(/books/);
    expect(ctx.territoryJoinBlob).toMatch(/libros/);
  });
});

describe("composeBrainDesignerImagePrompt", () => {
  it("jerarquía A–F: intención, territorio, núcleo compacto, variación única y evitar", () => {
    const ctx = buildBrainVisualPromptContext(defaultProjectAssets());
    const { prompt, diagnostics } = composeBrainDesignerImagePrompt({
      context: ctx,
      pieceMessage: "Creative OS unifica el proceso creativo",
      pageContext: "página de producto",
      brandColorLine: "Colores: #111, #222",
      logoBlock: "Sin logo",
      varietyPlanSeed: "test-plan-seed",
    });
    expect(prompt).toMatch(/A\. INTENCIÓN DE LA IMAGEN/i);
    expect(prompt).toMatch(/B\. TERRITORIO VISUAL/i);
    expect(prompt).toMatch(/C\. NÚCLEO VISUAL/i);
    expect(prompt).toMatch(/D\. VARIACIÓN CONCRETA/i);
    expect(prompt).toMatch(/E\. EVITAR/i);
    expect(prompt).toMatch(/F\. CONTEXTO DE MARCA/i);
    expect(prompt.toLowerCase()).toMatch(/stock corporate|saas|oficina/);
    expect(diagnostics.familyUsed).toBeTruthy();
    expect(diagnostics.chosenVariationAxes?.subjectMode).toBeTruthy();
    expect(typeof diagnostics.promptLength).toBe("number");
    expect(diagnostics.variationFocus).toMatch(/Una sola escena/i);
  });
});

describe("composeBrainImageGeneratorPrompt", () => {
  it("con análisis trusted el prompt incluye ADN visual y el tema del usuario; diagnostics reflejan refs", () => {
    const base = defaultProjectAssets();
    const assets = withAnalyses(base, [
      trustedAnalysis({
        id: "v1",
        subjectTags: ["cerámica", "mesa de trabajo"],
        visualStyle: ["documental suave"],
        mood: ["cálido"],
      }),
    ]);
    const { prompt, diagnostics } = composeBrainImageGeneratorPrompt({
      assets,
      userThemePrompt: "Un bodegón con herramientas de taller",
    });
    expect(prompt).toMatch(/A\. INTENCIÓN DE LA IMAGEN/i);
    expect(prompt).toMatch(/bodegón|herramientas/i);
    expect(diagnostics.textOnlyGeneration).toBe(false);
    expect(diagnostics.trustedVisualAnalysisCount).toBeGreaterThanOrEqual(1);
    expect(prompt).toMatch(/evitar/i);
    expect(diagnostics.visualAvoid.join(" ").toLowerCase()).toMatch(/stock corporate/);
  });

  it("sin análisis remotos fiables marca textOnlyGeneration y sigue incluyendo visualAvoid", () => {
    const assets = normalizeProjectAssets(defaultProjectAssets());
    const { prompt, diagnostics } = composeBrainImageGeneratorPrompt({
      assets,
      userThemePrompt: "Un paisaje abstracto",
    });
    expect(diagnostics.textOnlyGeneration).toBe(true);
    expect(diagnostics.trustedVisualAnalysisCount).toBe(0);
    expect(prompt).toMatch(/evitar/i);
    expect(diagnostics.visualAvoid.length).toBeGreaterThan(0);
  });

  it("corporateContext no aplasta ADN: bloque A antes que SaaS en C", () => {
    const base = defaultProjectAssets();
    const assets = normalizeProjectAssets({
      ...base,
      knowledge: {
        ...base.knowledge,
        corporateContext:
          "Plataforma SaaS futurista con dashboards azules y equipo corporativo sonriendo a la pantalla.",
      },
      strategy: {
        ...base.strategy,
        visualReferenceAnalysis: {
          analyses: [
            trustedAnalysis({
              id: "v2",
              subjectTags: ["taller artesanal", "manos", "arcilla"],
              mood: ["íntimo"],
            }),
          ],
        },
      },
    });
    const { prompt } = composeBrainImageGeneratorPrompt({
      assets,
      userThemePrompt: "Retrato en el taller",
    });
    const idxC = prompt.indexOf("C. NÚCLEO VISUAL");
    const idxF = prompt.indexOf("F. CONTEXTO DE MARCA");
    const idxSaaS = prompt.indexOf("SaaS futurista");
    expect(idxC).toBeGreaterThan(-1);
    expect(idxF).toBeGreaterThan(idxC);
    expect(idxSaaS).toBeGreaterThan(idxF);
    const beforeCorp = prompt.slice(0, idxSaaS).toLowerCase();
    expect(beforeCorp).toMatch(/íntimo|documental|taller|arcilla|retrato/);
  });

  it("confirmedVisualPatternsUsed cuando hay patrones confirmados", () => {
    const base = defaultProjectAssets();
    const assets = normalizeProjectAssets({
      ...base,
      strategy: {
        ...base.strategy,
        visualReferenceAnalysis: {
          analyses: [],
          confirmedVisualPatterns: ["luz natural", "texturas táctiles"],
        },
      },
    });
    const { diagnostics, prompt } = composeBrainImageGeneratorPrompt({
      assets,
      userThemePrompt: "Detalle de producto",
    });
    expect(diagnostics.confirmedVisualPatternsUsed).toBe(true);
    expect(prompt.toLowerCase()).toMatch(/patrones confirmados/i);
    expect(prompt.toLowerCase()).toMatch(/luz natural/);
  });
});

describe("composeBrainVisualStyleSlotPrompt", () => {
  it("usa VisualPromptContext en el bloque A", () => {
    const base = defaultProjectAssets();
    const assets = withAnalyses(base, [
      trustedAnalysis({
        subjectTags: ["persona creativa", "interior real"],
        visualStyle: ["documental"],
      }),
    ]);
    const ctx = buildBrainVisualPromptContext(assets, { slotKey: "environment" });
    const prompt = composeBrainVisualStyleSlotPrompt({
      context: ctx,
      slotKey: "environment",
      slotDescription: "Espacio de trabajo creativo",
      colorPrimary: "#000",
      colorSecondary: "#fff",
      colorAccent: "#f00",
    });
    expect(prompt).toMatch(/A\. INTENCIÓN DE LA IMAGEN/i);
    expect(prompt).toMatch(/D\. VARIACIÓN CONCRETA/i);
    expect(prompt.toLowerCase()).toMatch(/documental|tono visual|estilo/i);
  });
});

describe("visualCore / visualVariationAxes", () => {
  it("expone núcleo y catálogo de ejes en el contexto", () => {
    const ctx = buildBrainVisualPromptContext(defaultProjectAssets());
    expect(ctx.visualCore.generalTone.length).toBeGreaterThan(0);
    expect(ctx.visualCore.visualAvoid.length).toBeGreaterThan(0);
    expect(ctx.visualVariationAxes.subjectMode.length).toBeGreaterThan(2);
    expect(ctx.visualVariationAxes.framing).toContain("medium");
  });
});
