import type { BrandKitDocument, PaletteValue, VisualWorldValue, EssenceValue } from "./brand-kit-types";
import { GALLERY_CATEGORY_ORDER, type GalleryGenerateCategory } from "./brand-kit-gallery-plan";
import { slotValue } from "./brand-kit-gallery-tone-utils";
import {
  galleryCategoryPromptCores,
  gallerySceneLead,
  resolveBrandImageStyle,
} from "./brand-kit-visual-style";

/** Reglas para que el LLM escriba briefs alineados con cada categoría de galería (4 variantes distintas por categoría). */
export const GALLERY_CATEGORY_BRIEF_LLM_RULES: Record<GalleryGenerateCategory, string> = {
  people_mood:
    "Personas y mood: 4 variantes con emoción, luz, postura y encuadre distintos según el ADN. No repitas el mismo retrato ni la misma escena humana.",
  places:
    "Entornos: 4 localizaciones vacías distintas (arquitectura, interior, paisaje, urbano…). Sin personas. Cada variant debe ser un espacio diferente.",
  objects:
    "Objetos: 4 still life distintos coherentes con el producto y utilidad de la marca. Cada variant = objeto o composición diferente; respeta categoría de producto y uso real.",
  textures:
    "Texturas: 4 macros de superficies materiales distintas (tela, metal, piedra, madera…). Solo superficie, sin personas ni escenas.",
  general:
    "General: 4 síntesis atmosféricas distintas del ADN visual (luz, paleta, mood) con focal points diferentes.",
};

export function galleryCategoryBriefRulesBlock(): string {
  return GALLERY_CATEGORY_ORDER.map(
    (category) => `- ${category}: ${GALLERY_CATEGORY_BRIEF_LLM_RULES[category]}`,
  ).join("\n");
}

const GALLERY_IMAGE_POLICY_SUFFIX =
  "No copyrighted characters, trademarks, logos, or readable text in frame.";

/** Elimina marcas/personajes registrados del texto sin sustituirlos por arquetipos temáticos. */
const PROMPT_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  {
    pattern:
      /\b(disney(?:land|world)?|marvel|mickey mouse|minnie mouse|elsa|anna|olaf|spider-?man|iron man|captain america|hulk|thor|buzz lightyear|woody|pixar|star wars|harry potter|pok[eé]mon|nintendo|mario)\b/gi,
    replacement: "",
  },
];

/** Neutraliza términos que suelen bloquear Gemini Image sin inyectar escenas predefinidas. */
export function sanitizeGalleryImagePrompt(prompt: string): string {
  let next = prompt;
  for (const { pattern, replacement } of PROMPT_REPLACEMENTS) {
    next = next.replace(pattern, replacement);
  }
  return next.replace(/\s{2,}/g, " ").replace(/\s+([,.])/g, "$1").trim();
}

function brandPaletteHint(doc?: BrandKitDocument): string {
  const palette = doc ? slotValue<PaletteValue>(doc, "palette") : undefined;
  const colors = palette?.colors?.slice(0, 4).map((color) => color.hex).join(", ") ?? "";
  return colors ? `Subtle brand palette influence: ${colors}.` : "";
}

function visualMoodHint(doc?: BrandKitDocument): string {
  const visual = doc ? slotValue<VisualWorldValue>(doc, "visualWorld") : undefined;
  const mood = visual?.moodTags?.slice(0, 3).join(", ");
  return mood ? `Atmosphere: ${mood}.` : "";
}

function visualStyleHint(doc?: BrandKitDocument): string {
  const visual = doc ? slotValue<VisualWorldValue>(doc, "visualWorld") : undefined;
  const { medium, styleTags } = resolveBrandImageStyle(visual);
  const tags = styleTags.length ? ` Treatment: ${styleTags.slice(0, 4).join(", ")}.` : "";
  return `Image medium: ${medium}.${tags}`;
}

function brandCoherenceHint(doc?: BrandKitDocument): string {
  if (!doc) return "";
  const essence = slotValue<EssenceValue>(doc, "essence");
  const visual = slotValue<VisualWorldValue>(doc, "visualWorld");
  const parts: string[] = [];
  if (essence?.purpose?.trim()) parts.push(`Brand purpose: ${essence.purpose.trim()}.`);
  if (essence?.promise?.trim()) parts.push(`Brand promise: ${essence.promise.trim()}.`);
  if (essence?.brandContext?.trim()) parts.push(`Product context: ${essence.brandContext.trim()}.`);
  if (visual?.limits?.length) {
    parts.push(`Avoid: ${visual.limits.slice(0, 3).join("; ")}.`);
  }
  if (!parts.length) return "";
  return `Stay faithful to brand offering and intended use. ${parts.join(" ")} Do not depict competing or incoherent products or uses.`;
}

function assembleGalleryImagePrompt(parts: string[]): string {
  return sanitizeGalleryImagePrompt(parts.filter(Boolean).join(" "));
}

/** Prompt final para el generador de imágenes; el brief (`hint`) define la escena en todas las categorías. */
export function buildGalleryImagePrompt(
  category: GalleryGenerateCategory,
  stylePrompt: string,
  hint: string,
  doc?: BrandKitDocument,
): string {
  const visual = doc ? slotValue<VisualWorldValue>(doc, "visualWorld") : undefined;
  const { medium } = resolveBrandImageStyle(visual);
  const sceneLead = gallerySceneLead(hint, medium);
  const { core, finish } = galleryCategoryPromptCores(category, visual);

  return assembleGalleryImagePrompt([
    sceneLead,
    brandCoherenceHint(doc),
    visualStyleHint(doc),
    core,
    brandPaletteHint(doc),
    visualMoodHint(doc),
    finish,
    GALLERY_IMAGE_POLICY_SUFFIX,
  ]);
}
