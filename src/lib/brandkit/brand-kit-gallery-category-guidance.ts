import type { BrandKitDocument, PaletteValue, VisualWorldValue } from "./brand-kit-types";
import { GALLERY_CATEGORY_ORDER, type GalleryGenerateCategory } from "./brand-kit-gallery-plan";
import { slotValue } from "./brand-kit-gallery-tone-utils";

/** Reglas para que el LLM escriba briefs alineados con cada categoría de galería. */
export const GALLERY_CATEGORY_BRIEF_LLM_RULES: Record<GalleryGenerateCategory, string> = {
  people_mood:
    "Personas y mood: rostros, presencia humana, expresión, luz sobre piel. Sin escenas corporativas genéricas.",
  places:
    "Entornos y localizaciones SIN personas: arquitectura, interior vacío, paisaje o ciudad sin gente visible. Luz, volumen, materiales del espacio. PROHIBIDO: personas, siluetas, manos, retratos, escenas corporativas con ejecutivos, UI/hologramas, mapas en suelo.",
  objects:
    "Objetos o producto aislado en still life. Sin personas ni entorno dominante. Material, escala y luz coherentes con la marca.",
  textures:
    "SOLO macrofotografía de superficie material que llena el encuadre. Detalle de rugosidad, micrograno, acabado (mate/satinado/brillante) y luz rasante. PROHIBIDO: personas, manos, objetos enteros, salas, UI, hologramas, ilustraciones stock, iconos, mapas, patrones abstractos de «datos» o «tecnología».",
  general:
    "Síntesis atmosférica del ADN visual (luz, paleta, mood) sin encajar en las otras cuatro categorías.",
};

export function galleryCategoryBriefRulesBlock(): string {
  return GALLERY_CATEGORY_ORDER.map(
    (category) => `- ${category}: ${GALLERY_CATEGORY_BRIEF_LLM_RULES[category]}`,
  ).join("\n");
}

const TEXTURE_IMAGE_PROMPT_CORE = [
  "Macro material texture photograph filling the entire frame.",
  "Extreme close-up of one physical surface only — wood grain, fabric weave, stone, metal brush marks, plaster, leather, paper fiber, etc.",
  "Show specific roughness, micro-grain, and specular response (matte, satin, or glossy).",
  "No people, no hands, no faces, no whole objects, no rooms, no technology scenes, no UI screens, no holograms, no circuit graphics, no stock illustrations, no text, no logos.",
].join(" ");

const PLACES_IMAGE_PROMPT_CORE = [
  "Architectural environment photograph with no people in frame.",
  "Empty interior, landscape, or urban location — space, light, materials, and atmosphere only.",
  "No humans, no silhouettes, no hands, no crowds, no business people, no portraits.",
  "No holograms, no UI screens, no floor projections, no stock corporate tech scenes, no text, no logos.",
].join(" ");

function brandPaletteHint(doc?: BrandKitDocument): string {
  const palette = doc ? slotValue<PaletteValue>(doc, "palette") : undefined;
  const colors = palette?.colors?.slice(0, 4).map((color) => color.hex).join(", ") ?? "";
  return colors ? `Subtle brand palette influence: ${colors}.` : "";
}

/** Prompt final para el generador de imágenes; texturas y entornos usan prompts dedicados. */
export function buildGalleryImagePrompt(
  category: GalleryGenerateCategory,
  stylePrompt: string,
  hint: string,
  doc?: BrandKitDocument,
): string {
  const trimmedHint = hint.trim();

  if (category === "textures") {
    return [
      TEXTURE_IMAGE_PROMPT_CORE,
      brandPaletteHint(doc),
      trimmedHint,
      "Photorealistic macro texture, shallow depth of field.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (category === "places") {
    const visual = doc ? slotValue<VisualWorldValue>(doc, "visualWorld") : undefined;
    const mood = visual?.moodTags?.slice(0, 3).join(", ");
    return [
      PLACES_IMAGE_PROMPT_CORE,
      brandPaletteHint(doc),
      mood ? `Atmosphere: ${mood}.` : "",
      trimmedHint,
      "Photorealistic empty location, wide or medium shot, cinematic natural or architectural light.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  return `${stylePrompt} ${trimmedHint}`.trim();
}
