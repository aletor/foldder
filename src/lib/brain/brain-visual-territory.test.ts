import { describe, expect, it } from "vitest";
import {
  detectBrainVisualTerritory,
  extractVisualSemanticSignals,
  getSportPerformanceVisualAvoidExtras,
  getTerritoryVisualAvoidExtras,
  getVariationAxesForTerritory,
  summarizeVisualSignalDiagnostics,
  truncateCorporateForSportVisual,
  truncateCorporateForTerritoryVisual,
  userExplicitlyRequestsOfficeMeeting,
  validateVariationAgainstVisualCore,
} from "./brain-visual-territory";
import type { BrainVisualCore } from "./brain-visual-variety";
import { pickBrainVariationBundle } from "./brain-visual-variety";

const baseInput = {
  subjects: [] as string[],
  mood: [] as string[],
  composition: [] as string[],
  visualStyleTags: [] as string[],
  visualMessage: [] as string[],
  peopleAndWardrobe: [] as string[],
  textures: [] as string[],
  objectsAndProps: [] as string[],
  confirmedPatterns: [] as string[],
  corporateBlob: "",
};

describe("detectBrainVisualTerritory", () => {
  it("detecta sport_performance con señales atleta / Nike / zapatillas", () => {
    const t = detectBrainVisualTerritory({
      subjects: ["athlete", "running shoes", "swoosh"],
      mood: ["intense", "focused"],
      composition: ["dynamic", "low angle"],
      visualStyleTags: ["performance", "sportswear"],
      visualMessage: ["Just Do It"],
      peopleAndWardrobe: ["jersey", "training"],
      textures: [],
      objectsAndProps: [],
      confirmedPatterns: [],
      patternSummary: "Nike athletic campaign",
      userPromptHint: "",
      corporateBlob: "",
    });
    expect(t).toBe("sport_performance");
  });

  it("libros + vinilos + interior → culture_lifestyle o domestic_editorial, no creative_workspace por defecto", () => {
    const t = detectBrainVisualTerritory({
      ...baseInput,
      subjects: ["living room", "bookshelf", "vinyl records"],
      mood: ["calm", "intimate"],
      composition: ["natural light", "documentary"],
      visualStyleTags: ["editorial lifestyle"],
      visualMessage: ["quiet cultural interior"],
      peopleAndWardrobe: ["casual contemporary"],
      textures: ["wood shelf", "fabric sofa"],
      objectsAndProps: ["books", "turntable", "ceramic"],
      patternSummary: "Home interior with reading nook and record collection",
    });
    expect(t === "culture_lifestyle" || t === "domestic_editorial").toBe(true);
    expect(t).not.toBe("creative_workspace");
  });

  it("moodboard + cámara + portátil como herramienta → creative_workspace", () => {
    const t = detectBrainVisualTerritory({
      ...baseInput,
      subjects: ["moodboard", "design sketches", "laptop"],
      mood: ["focused"],
      composition: ["top down table"],
      visualStyleTags: ["creative studio", "graphic design"],
      visualMessage: ["creative process"],
      peopleAndWardrobe: [],
      textures: ["paper samples"],
      objectsAndProps: ["camera", "wacom", "pantone"],
      patternSummary: "Creative agency moodboard session with camera and laptop as tools",
    });
    expect(t).toBe("creative_workspace");
  });

  it("moda / styling / pose → fashion_editorial", () => {
    const t = detectBrainVisualTerritory({
      ...baseInput,
      subjects: ["model", "garment", "lookbook"],
      mood: ["bold"],
      composition: ["editorial fashion"],
      visualStyleTags: ["couture", "runway"],
      visualMessage: ["fashion campaign"],
      peopleAndWardrobe: ["structured silhouette"],
      textures: ["silk textile"],
      objectsAndProps: [],
      patternSummary: "Fashion editorial portrait with styling",
    });
    expect(t).toBe("fashion_editorial");
  });

  it("producto hero + materiales premium → luxury_product", () => {
    const t = detectBrainVisualTerritory({
      ...baseInput,
      subjects: ["perfume bottle", "still life"],
      mood: ["refined"],
      composition: ["product hero", "close detail"],
      visualStyleTags: ["luxury", "premium skincare"],
      visualMessage: [],
      peopleAndWardrobe: [],
      textures: ["glass", "marble"],
      objectsAndProps: ["cosmetic jar"],
      patternSummary: "Luxury product hero with reflections",
    });
    expect(t).toBe("luxury_product");
  });

  it("espacio arquitectónico sin personas → architecture_interiors", () => {
    const t = detectBrainVisualTerritory({
      ...baseInput,
      subjects: ["facade", "concrete hall", "interior volume"],
      mood: ["calm"],
      composition: ["wide establishing", "architecture photography"],
      visualStyleTags: ["architecture", "minimal space"],
      visualMessage: [],
      peopleAndWardrobe: [],
      textures: ["concrete", "glass curtain wall"],
      objectsAndProps: [],
      patternSummary: "Architectural interior with natural light, no people",
    });
    expect(t).toBe("architecture_interiors");
  });
});

describe("extractVisualSemanticSignals + summarize", () => {
  it("expone señales culturales dominantes para diagnóstico", () => {
    const input = {
      ...baseInput,
      subjects: ["books", "vinyl"],
      mood: ["calm"],
      composition: ["documentary"],
      visualStyleTags: [],
      visualMessage: [],
      peopleAndWardrobe: [],
      textures: [],
      objectsAndProps: ["bookshelf"],
      patternSummary: "reading nook with records",
    };
    const sig = extractVisualSemanticSignals(input);
    const d = summarizeVisualSignalDiagnostics(sig);
    expect(sig.culturalSignals.books).toBe(true);
    expect(d.dominantCulturalSignals).toMatch(/books/);
  });
});

describe("SPORT_PERFORMANCE_AXES", () => {
  it("no incluye meeting, home_office, books ni laptop en pools deportivos", () => {
    const ax = getVariationAxesForTerritory("sport_performance");
    const joined = [...ax.activity, ...ax.environment, ...ax.propCluster].join(" ");
    expect(joined).not.toMatch(/\bmeeting\b/);
    expect(joined).not.toMatch(/\bhome_office\b/);
    expect(joined).not.toMatch(/\bworkspace\b/);
    expect(ax.propCluster.join(" ")).not.toMatch(/\bbooks\b/);
    expect(ax.propCluster.join(" ")).not.toMatch(/\blaptop\b/);
  });

  it("creative_workspace usa entornos de estudio / mesa creativa, no home_office corporativo", () => {
    const ax = getVariationAxesForTerritory("creative_workspace");
    expect(ax.environment.join(" ")).toMatch(/personal_studio|creative_table/);
    expect(ax.environment.join(" ")).not.toMatch(/home_office/);
    expect(ax.activity.join(" ")).not.toMatch(/\bmeeting\b/);
  });
});

describe("validateVariationAgainstVisualCore", () => {
  const core: BrainVisualCore = {
    generalTone: "intenso",
    styleSummary: "deporte performance",
    paletteAndMaterials: "negro, naranja",
    lightingCharacter: "dramática",
    brandFeeling: "Nike athletic",
    visualAvoid: [],
  };

  it("rechaza meeting + home_office en territorio deportivo", () => {
    const v = validateVariationAgainstVisualCore(
      core,
      {
        subjectMode: "solo_athlete",
        framing: "wide",
        environment: "home_office",
        activity: "meeting",
        propCluster: "books",
        moodShift: "focused",
      },
      "sport_performance",
      {},
    );
    expect(v.ok).toBe(false);
    expect(v.reasons.length).toBeGreaterThan(0);
  });

  it("permite meeting si el usuario lo pide explícitamente (bandera)", () => {
    const v = validateVariationAgainstVisualCore(
      core,
      {
        subjectMode: "team",
        framing: "wide",
        environment: "home_office",
        activity: "meeting",
        propCluster: "books",
        moodShift: "focused",
      },
      "sport_performance",
      { explicitWorkspaceMeetingRequest: true },
    );
    expect(v.ok).toBe(true);
  });

  it("rechaza meeting en culture_lifestyle aunque A2 lo proponga", () => {
    const v = validateVariationAgainstVisualCore(
      core,
      {
        subjectMode: "individual",
        framing: "medium",
        environment: "workspace",
        activity: "meeting",
        propCluster: "books",
        moodShift: "calm",
      },
      "culture_lifestyle",
      {},
    );
    expect(v.ok).toBe(false);
  });

  it("rechaza team en luxury_product", () => {
    const v = validateVariationAgainstVisualCore(
      core,
      {
        subjectMode: "team",
        framing: "detail",
        environment: "studio",
        activity: "product_hero",
        propCluster: "materials",
        moodShift: "refined",
      },
      "luxury_product",
      {},
    );
    expect(v.ok).toBe(false);
  });
});

describe("userExplicitlyRequestsOfficeMeeting", () => {
  it("detecta petición explícita meeting + athletes", () => {
    expect(userExplicitlyRequestsOfficeMeeting("meeting with athletes about campaign")).toBe(true);
    expect(userExplicitlyRequestsOfficeMeeting("solo producto hero")).toBe(false);
  });
});

describe("truncateCorporateForTerritoryVisual", () => {
  it("trunca texto largo en territorio deportivo", () => {
    const long = "A".repeat(400);
    const out = truncateCorporateForTerritoryVisual(long, "sport_performance", 120);
    expect(out.truncated).toBe(true);
    expect(out.text.length).toBeLessThan(long.length);
  });

  it("trunca también en culture_lifestyle cuando aplica", () => {
    const long = "B".repeat(400);
    const out = truncateCorporateForTerritoryVisual(long, "culture_lifestyle", 120);
    expect(out.truncated).toBe(true);
  });

  it("no trunca en tech_saas por debajo del umbral de longitud", () => {
    const out = truncateCorporateForTerritoryVisual("corta", "tech_saas", 120);
    expect(out.truncated).toBe(false);
  });
});

describe("truncateCorporateForSportVisual (compat)", () => {
  it("delega solo en deporte", () => {
    const out = truncateCorporateForSportVisual("corta", "tech_saas", 120);
    expect(out.truncated).toBe(false);
  });
});

describe("getTerritoryVisualAvoidExtras", () => {
  it("sport: negativos anti oficina / mesa", () => {
    const n = getSportPerformanceVisualAvoidExtras();
    expect(n.some((x) => /meeting|office|table/i.test(x))).toBe(true);
  });

  it("culture incluye anti corporativo", () => {
    const n = getTerritoryVisualAvoidExtras("culture_lifestyle");
    expect(n.some((x) => /corporate|boardroom|SaaS/i.test(x))).toBe(true);
  });
});

describe("pickBrainVariationBundle + sport axes", () => {
  it("en muchos intentos no elige meeting si el pool es deportivo", () => {
    const axes = getVariationAxesForTerritory("sport_performance");
    const ctx = {
      visualStyleTags: ["sport"],
      mood: ["intense"],
      visualMessage: ["performance"],
      visualCore: { brandFeeling: "athletic" },
    };
    for (let i = 0; i < 40; i++) {
      const p = pickBrainVariationBundle(axes, ctx, { varietyMode: "exploratory" }, `seed-${i}`, {
        resolvedFamilyUsed: "sport_performance_hero",
      });
      expect(p.chosenVariationAxes.activity).not.toBe("meeting");
      expect(p.chosenVariationAxes.environment).not.toBe("home_office");
      expect(p.chosenVariationAxes.propCluster).not.toBe("books");
    }
  });
});
