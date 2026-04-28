import { describe, expect, it } from "vitest";
import {
  buildDirectedArtVisualPromptDraft,
  buildVariationFocusLine,
  finalizeVisualPromptForModel,
  MAX_VISUAL_PROMPT_CHARS,
  sanitizeDangerousVisualLanguage,
  validateFinalVisualPrompt,
} from "./brain-final-visual-prompt";
import type { BrainVariationChoice } from "./brain-visual-variety";

const sampleVariation: BrainVariationChoice = {
  subjectMode: "individual",
  environment: "lived_in_interior",
  activity: "reading",
  framing: "medium",
  propCluster: "books",
  moodShift: "calm",
};

describe("buildDirectedArtVisualPromptDraft", () => {
  it("no mete todos los sujetos del ADN: núcleo resumido y una sola variación", () => {
    const draft = buildDirectedArtVisualPromptDraft({
      intention: "Retrato íntimo en interior",
      territory: "culture_lifestyle",
      core: {
        generalTone: "cálido, humano",
        styleSummary: "editorial documental, lifestyle",
        paletteAndMaterials: "madera, lino, cerámica, papel, plantas, metal, vidrio, textura",
        lightingCharacter: "luz natural suave",
        brandFeeling: "autenticidad editorial",
        mood: ["calma", "íntimo", "refinado", "otro"],
        visualStyleTags: ["doc", "natural", "otro"],
        colorPalette: ["arena", "verde", "blanco"],
        textures: ["madera", "tela"],
        lighting: ["ventana", "dorada"],
      },
      variation: sampleVariation,
      territoryAvoidPlusGlobal: ["stock corporate", "SaaS dashboard"],
      brandContext: "Marca creativa europea.",
    });
    expect(draft).toMatch(/A\. INTENCIÓN/);
    expect(draft).toMatch(/Una sola escena/);
    const cBlock = draft.split("C. NÚCLEO VISUAL")[1]?.split("D. VARIACIÓN")[0] ?? "";
    expect((cBlock.match(/,/g) ?? []).length).toBeLessThan(28);
  });
});

describe("sanitizeDangerousVisualLanguage", () => {
  it("sustituye meeting/office si el territorio no es tech", () => {
    const { text, replacements } = sanitizeDangerousVisualLanguage(
      "An office meeting around a wooden table with laptops",
      "culture_lifestyle",
      {},
    );
    expect(text.toLowerCase()).not.toMatch(/\boffice meeting\b/);
    expect(replacements.length).toBeGreaterThan(0);
  });

  it("no reescribe si el usuario pide corporativo explícito", () => {
    const { replacements } = sanitizeDangerousVisualLanguage(
      "Boardroom meeting with team",
      "culture_lifestyle",
      { userExplicitCorporateLanguage: true },
    );
    expect(replacements.length).toBe(0);
  });
});

describe("validateFinalVisualPrompt", () => {
  it("detecta contaminación corporate en culture_lifestyle", () => {
    const r = validateFinalVisualPrompt(
      "SaaS dashboard hero with office team meeting",
      "culture_lifestyle",
      sampleVariation,
      { visualAvoid: ["corporate office meeting", "generic startup team"] },
    );
    expect(r.warnings.some((w) => w.includes("territory_mismatch") || w.includes("dangerous"))).toBe(true);
  });

  it("marca choque positivo vs evitar cuando el prompt repite un negativo", () => {
    const r = validateFinalVisualPrompt(
      "Interior vivido. " + "futuristic SaaS dashboard as hero".toLowerCase(),
      "culture_lifestyle",
      sampleVariation,
      { visualAvoid: ["futuristic SaaS dashboard as hero"] },
    );
    expect(r.positiveAvoidClashes.length).toBeGreaterThan(0);
  });
});

describe("finalizeVisualPromptForModel", () => {
  it("reescribe y acota longitud", () => {
    const longDraft = `${"x".repeat(MAX_VISUAL_PROMPT_CHARS + 400)}\n${buildVariationFocusLine(sampleVariation)}`;
    const out = finalizeVisualPromptForModel(longDraft, "domestic_editorial", sampleVariation, {
      visualAvoid: [],
    });
    expect(out.prompt.length).toBeLessThanOrEqual(MAX_VISUAL_PROMPT_CHARS + 20);
    expect(out.finalPromptWasRewritten).toBe(true);
  });

  it("luxury: advierte grupo en mesa en texto sucio", () => {
    const dirty = buildDirectedArtVisualPromptDraft({
      intention: "Product hero",
      territory: "luxury_product",
      core: {
        generalTone: "refinado",
        styleSummary: "luxury still",
        paletteAndMaterials: "oro, mármol",
        lightingCharacter: "suave",
        brandFeeling: "lujo silencioso",
        mood: [],
        visualStyleTags: [],
        colorPalette: [],
        textures: [],
        lighting: [],
      },
      variation: { ...sampleVariation, subjectMode: "team" },
      territoryAvoidPlusGlobal: [],
      brandContext: "",
    });
    const contaminated = `${dirty}\nExtra: team portrait around table with papers.`;
    const val = validateFinalVisualPrompt(contaminated, "luxury_product", sampleVariation, { visualAvoid: [] });
    expect(val.warnings.some((w) => w.includes("luxury_group"))).toBe(true);
  });
});

describe("sport vs office", () => {
  it("sport_performance: validación marca oficina en texto", () => {
    const r = validateFinalVisualPrompt(
      "Athlete sprinting past conference room presentation",
      "sport_performance",
      sampleVariation,
      { visualAvoid: [] },
    );
    expect(r.warnings.some((w) => w.includes("sport_vs_office"))).toBe(true);
  });
});
