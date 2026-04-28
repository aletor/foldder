import type { BrainVisualTerritory } from "@/lib/brain/brain-visual-territory-types";
import { getTerritoryVisualAvoidExtras } from "@/lib/brain/brain-visual-territory";
import type { BrainVariationChoice } from "@/lib/brain/brain-visual-variety";

/** Longitud máxima del prompt visual (modo directivo). */
export const MAX_VISUAL_PROMPT_CHARS = 2600;
/** Modo avanzado: más margen sin volcar listas largas. */
export const MAX_VISUAL_PROMPT_CHARS_ADVANCED = 5200;
/** Máximo para bloque F (contexto de marca). */
export const MAX_BRAND_CONTEXT_CHARS = 320;

export type PromptCoreSlice = {
  generalTone: string;
  styleSummary: string;
  paletteAndMaterials: string;
  lightingCharacter: string;
  brandFeeling: string;
  confirmedPatternsBrief?: string;
  mood: readonly string[];
  visualStyleTags: readonly string[];
  colorPalette: readonly string[];
  textures: readonly string[];
  lighting: readonly string[];
};

export type FinalVisualPromptValidationOptions = {
  visualAvoid: readonly string[];
  corporateSnippet?: string;
  /** True si el texto del usuario pide explícitamente oficina/reunión/corporativo. */
  userExplicitCorporateLanguage?: boolean;
};

export type FinalVisualPromptValidationResult = {
  warnings: string[];
  /** Evitar en negativo que también aparece en positivo (riesgo de contradicción). */
  positiveAvoidClashes: string[];
};

const PHRASE_SANITIZE: Array<{ pattern: RegExp; replacement: string; id: string }> = [
  { pattern: /\bteam around table\b/gi, replacement: "small group in a lived-in space", id: "team_around_table" },
  { pattern: /\blaptop meeting\b/gi, replacement: "quiet work with laptop as a tool", id: "laptop_meeting" },
  { pattern: /\boffice meeting\b/gi, replacement: "editorial interior scene", id: "office_meeting" },
  { pattern: /\bboardroom\b/gi, replacement: "quiet interior", id: "boardroom" },
  { pattern: /\bbrainstorming\b/gi, replacement: "visual exploration", id: "brainstorming" },
  { pattern: /\bhome office\b/gi, replacement: "lived-in interior", id: "home_office" },
  { pattern: /\bhome_office\b/gi, replacement: "lived_in_interior", id: "home_office_token" },
];

const TOKEN_SANITIZE: Array<{ pattern: RegExp; replacement: string; id: string }> = [
  { pattern: /\bmeeting\b/gi, replacement: "quiet work moment", id: "meeting" },
  { pattern: /\bcollaboration\b/gi, replacement: "shared creative moment", id: "collaboration" },
  { pattern: /\bpresentation\b/gi, replacement: "visual narrative moment", id: "presentation" },
  { pattern: /\bbrainstorming\b/gi, replacement: "visual exploration", id: "brainstorming_word" },
  { pattern: /\bcorporate\b/gi, replacement: "brand editorial", id: "corporate" },
  { pattern: /\bworkspace\b/gi, replacement: "personal studio", id: "workspace" },
  { pattern: /\bdeck\b/gi, replacement: "visual sequence", id: "deck" },
  { pattern: /\bbusiness\b/gi, replacement: "brand context", id: "business" },
  { pattern: /\boffice\b/gi, replacement: "interior", id: "office" },
];

export function territoryAllowsCorporateVisualLanguage(territory: BrainVisualTerritory): boolean {
  return territory === "tech_saas";
}

function clip(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

export function twoSentencesMax(text: string, maxChars: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "";
  const parts = t.split(/(?<=[.!?])\s+/).filter(Boolean);
  let out = parts.slice(0, 2).join(" ");
  if (out.length > maxChars) out = clip(out, maxChars);
  return out;
}

/** Palabras que no deben colarse salvo territorio tech o petición explícita. */
export function listDangerousVisualTokensForTerritory(territory: BrainVisualTerritory): readonly string[] {
  if (territoryAllowsCorporateVisualLanguage(territory)) {
    return ["stock photo cliché", "generic smiling team"];
  }
  return [
    "meeting",
    "office",
    "home office",
    "workspace",
    "collaboration",
    "business",
    "presentation",
    "deck",
    "laptop meeting",
    "team around table",
    "brainstorming",
    "corporate",
    "boardroom",
  ];
}

export function sanitizeDangerousVisualLanguage(
  text: string,
  territory: BrainVisualTerritory,
  opts?: { userExplicitCorporateLanguage?: boolean },
): { text: string; replacements: string[] } {
  if (opts?.userExplicitCorporateLanguage || territoryAllowsCorporateVisualLanguage(territory)) {
    return { text, replacements: [] };
  }
  let out = text;
  const replacements: string[] = [];
  for (const { pattern, replacement, id } of PHRASE_SANITIZE) {
    if (pattern.test(out)) {
      replacements.push(`phrase:${id}`);
      out = out.replace(pattern, replacement);
    }
  }
  for (const { pattern, replacement, id } of TOKEN_SANITIZE) {
    if (pattern.test(out)) {
      replacements.push(`token:${id}`);
      out = out.replace(pattern, replacement);
    }
  }
  return { text: out, replacements };
}

export function buildVariationFocusLine(axes: BrainVariationChoice): string {
  return `Una sola escena para esta imagen: sujeto «${axes.subjectMode}», espacio «${axes.environment}», actividad «${axes.activity}», encuadre «${axes.framing}», acento de objetos «${axes.propCluster}», mood «${axes.moodShift}». No añadas más objetos obligatorios fuera de esta combinación.`;
}

export function buildCompactVisualNucleus(core: PromptCoreSlice): string {
  const mood = clip(core.mood.slice(0, 5).join(", "), 72);
  const styles = clip(core.visualStyleTags.slice(0, 6).join(", "), 90);
  const palette = clip(core.paletteAndMaterials, 110);
  const light = clip([core.lightingCharacter, core.lighting.slice(0, 3).join(", ")].filter(Boolean).join(" · "), 100);
  const feeling = clip(core.brandFeeling, 100);
  const tone = clip(core.generalTone, 72);
  const lines = [
    `Tono general: ${tone}.`,
    `Estilo: ${styles}.`,
    mood ? `Mood dominante (referencia, no lista de objetos): ${mood}.` : "",
    `Luz: ${light}.`,
    `Paleta y materiales (guía resumida): ${palette}.`,
    `Sensación de marca (breve): ${feeling}.`,
  ].filter(Boolean);
  const brief = core.confirmedPatternsBrief?.trim()
    ? `Patrones confirmados (solo como ancla breve): ${clip(core.confirmedPatternsBrief, 100)}.`
    : "";
  return [...lines, brief].filter(Boolean).join(" ");
}

/** Misma selección que el bloque E del borrador (territorio + global, sin duplicados). */
export function getVisualAvoidSliceUsed(
  territory: BrainVisualTerritory,
  globalAvoid: readonly string[],
): string[] {
  const territoryBits = getTerritoryVisualAvoidExtras(territory).slice(0, 5);
  const globalBits = globalAvoid.slice(0, 4);
  const merged = [...new Set([...territoryBits, ...globalBits].map((s) => s.trim()).filter(Boolean))];
  return merged.slice(0, 8);
}

export function buildAvoidBlock(territory: BrainVisualTerritory, globalAvoid: readonly string[]): string {
  return getVisualAvoidSliceUsed(territory, globalAvoid).join("; ");
}

export function buildDirectedArtVisualPromptDraft(params: {
  intention: string;
  territory: BrainVisualTerritory;
  core: PromptCoreSlice;
  variation: BrainVariationChoice;
  territoryAvoidPlusGlobal: readonly string[];
  brandContext: string;
  productSecondaryOneLine?: string;
  textOnlyWarning?: string;
}): string {
  const intention = clip(params.intention.replace(/\s+/g, " "), 520);
  const nucleus = buildCompactVisualNucleus(params.core);
  const variationLine = buildVariationFocusLine(params.variation);
  const avoid = buildAvoidBlock(params.territory, params.territoryAvoidPlusGlobal);
  const brand = twoSentencesMax(params.brandContext, MAX_BRAND_CONTEXT_CHARS);
  const product = params.productSecondaryOneLine?.trim()
    ? clip(params.productSecondaryOneLine.replace(/\s+/g, " "), 220)
    : "";

  const parts = [
    params.textOnlyWarning?.trim() ?? "",
    "A. INTENCIÓN DE LA IMAGEN",
    intention || "Mantener coherencia con el territorio visual y el núcleo de marca.",
    "",
    "B. TERRITORIO VISUAL",
    `Dominante: ${params.territory}. Mantén toda la escena dentro de este mundo; no mezcles otro universo (p. ej. oficina corporativa genérica si el territorio es cultural o doméstico editorial).`,
    "",
    "C. NÚCLEO VISUAL (coherencia de marca, resumido)",
    nucleus,
    "No conviertas este bloque en inventario de todos los objetos detectados en Brain: solo guía de tono, luz, materialidad y actitud.",
    "",
    "D. VARIACIÓN CONCRETA (una decisión para esta generación)",
    variationLine,
    "",
    "E. EVITAR",
    avoid,
    "",
    "F. CONTEXTO DE MARCA (máximo 1–2 frases; orienta intención, no domina la escena)",
    brand || "(sin texto de marca adicional.)",
    product ? `\nProducto / mensaje de apoyo (una línea, no sustituye A–E): ${product}` : "",
    "",
    "Salida: una sola imagen fiel a A–E; el bloque F no redefine la escena.",
  ];
  return parts.filter((p) => p !== "").join("\n");
}

export function validateFinalVisualPrompt(
  prompt: string,
  territory: BrainVisualTerritory,
  _variation: BrainVariationChoice,
  opts: FinalVisualPromptValidationOptions,
): FinalVisualPromptValidationResult {
  const warnings: string[] = [];
  const lower = prompt.toLowerCase();
  const positiveAvoidClashes: string[] = [];

  if (opts.corporateSnippet && opts.corporateSnippet.length > MAX_BRAND_CONTEXT_CHARS) {
    warnings.push("corporate_scene_contamination:corporate_snippet_long");
  }

  const dangerous = listDangerousVisualTokensForTerritory(territory);
  if (
    !opts.userExplicitCorporateLanguage &&
    !territoryAllowsCorporateVisualLanguage(territory) &&
    dangerous.length
  ) {
    for (const d of dangerous) {
      const esc = d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = d.includes(" ") ? new RegExp(esc, "i") : new RegExp(`\\b${esc}\\b`, "i");
      if (rx.test(prompt)) warnings.push(`dangerous_token_in_prompt:${d.replace(/\s+/g, "_")}`);
    }
  }

  const commas = (prompt.match(/,/g) ?? []).length;
  if (commas > 42) warnings.push("prompt_excessively_listy");

  if (territory === "culture_lifestyle" || territory === "domestic_editorial") {
    if (/\b(saas|dashboard|boardroom|pitch deck)\b/i.test(prompt)) warnings.push("territory_mismatch_corporate_scene");
  }
  if (territory === "sport_performance" && /\b(boardroom|conference|office team|presentation deck)\b/i.test(prompt)) {
    warnings.push("territory_mismatch_sport_vs_office");
  }
  if (territory === "luxury_product" && /\b(team|group).{0,40}\b(table|mesa)\b/i.test(lower)) {
    warnings.push("territory_mismatch_luxury_group_table");
  }

  for (const av of opts.visualAvoid.slice(0, 10)) {
    const needle = av.trim().toLowerCase();
    if (needle.length < 22) continue;
    const head = needle.slice(0, 44);
    if (lower.includes(head)) positiveAvoidClashes.push(av.slice(0, 72));
  }

  return { warnings, positiveAvoidClashes };
}

export type FinalizeVisualPromptResult = {
  prompt: string;
  /** Borrador A–F antes de sanitize / truncado de longitud. */
  promptBeforeSanitize: string;
  contaminationWarnings: string[];
  dangerousWordsRemovedInPrompt: string[];
  finalPromptWasRewritten: boolean;
  promptLength: number;
};

export function finalizeVisualPromptForModel(
  draft: string,
  territory: BrainVisualTerritory,
  variation: BrainVariationChoice,
  opts: FinalVisualPromptValidationOptions & { advancedLongPrompt?: boolean },
): FinalizeVisualPromptResult {
  const promptBeforeSanitize = draft;
  const maxLen = opts.advancedLongPrompt ? MAX_VISUAL_PROMPT_CHARS_ADVANCED : MAX_VISUAL_PROMPT_CHARS;
  let text = draft;
  const allReplacements: string[] = [];
  for (let pass = 0; pass < 2; pass++) {
    const san = sanitizeDangerousVisualLanguage(text, territory, {
      userExplicitCorporateLanguage: opts.userExplicitCorporateLanguage,
    });
    text = san.text;
    allReplacements.push(...san.replacements);
    if (!san.replacements.length) break;
  }
  const val = validateFinalVisualPrompt(text, territory, variation, opts);
  let rewritten = allReplacements.length > 0;
  if (text.length > maxLen) {
    text = `${text.slice(0, maxLen - 10).trim()}…`;
    val.warnings.push("prompt_hard_truncated_length");
    rewritten = true;
  }
  const contaminationWarnings = [
    ...val.warnings,
    ...val.positiveAvoidClashes.map((c) => `positive_vs_avoid:${c}`),
  ];
  return {
    prompt: text.trim(),
    promptBeforeSanitize,
    contaminationWarnings,
    dangerousWordsRemovedInPrompt: allReplacements,
    finalPromptWasRewritten: rewritten,
    promptLength: text.trim().length,
  };
}
