import type { GalleryValue } from "./brand-kit-types";

export const BRAND_KIT_GALLERY_IMAGE_COUNT = 10;
export const GALLERY_CATEGORY_SLOT_COUNT = 2;

export type GalleryGenerateCategory =
  | "people_mood"
  | "places"
  | "objects"
  | "textures"
  | "general";

export type GalleryGenerateSlot = {
  category: GalleryGenerateCategory;
  categoryLabel: string;
  categoryHint: string;
  promptSuffix: string;
};

export const GALLERY_GENERATE_PLAN: GalleryGenerateSlot[] = [
  {
    category: "people_mood",
    categoryLabel: "Personas & mood",
    categoryHint: "Rostros, emoción, actitud y luz sobre personas.",
    promptSuffix:
      "Editorial portrait or human presence expressing brand mood. Focus on face, expression, cinematic lighting. No text, no logos.",
  },
  {
    category: "people_mood",
    categoryLabel: "Personas & mood",
    categoryHint: "Segunda variación de personas y atmósfera emocional.",
    promptSuffix:
      "Candid human moment with emotional tone matching the brand. Natural or directed, never stock-corporate. No text, no logos.",
  },
  {
    category: "places",
    categoryLabel: "Entorno",
    categoryHint: "Localización vacía: arquitectura, paisaje o interior sin personas.",
    promptSuffix:
      "Empty architectural interior or landscape location. Space, light, and materials only. No people, no silhouettes, no business scenes, no holograms, no UI. No text, no logos.",
  },
  {
    category: "places",
    categoryLabel: "Entorno",
    categoryHint: "Segundo entorno vacío — otra escala o luz.",
    promptSuffix:
      "Alternative empty environment: urban exterior, natural landscape, or unoccupied interior with brand mood. Absolutely no humans in frame. No text, no logos.",
  },
  {
    category: "objects",
    categoryLabel: "Objetos",
    categoryHint: "Objetos simbólicos o de producto con tratamiento editorial.",
    promptSuffix:
      "Still life object study aligned with brand palette and lighting. Product or symbolic object. No text, no logos.",
  },
  {
    category: "objects",
    categoryLabel: "Objetos",
    categoryHint: "Segundo objeto — otra escala o material.",
    promptSuffix:
      "Close object composition with brand tone. Material detail, shallow depth of field. No text, no logos.",
  },
  {
    category: "textures",
    categoryLabel: "Texturas",
    categoryHint: "Macro de superficie material: rugosidad, brillo y grano.",
    promptSuffix:
      "Macro full-frame photograph of a single material surface. Extreme close-up showing roughness, micro-grain, matte or glossy finish. No people, no objects, no rooms, no UI, no holograms. No text, no logos.",
  },
  {
    category: "textures",
    categoryLabel: "Texturas",
    categoryHint: "Segunda superficie — otro material o acabado.",
    promptSuffix:
      "Alternative macro texture: fabric weave, brushed metal, stone grain, plaster, or leather at extreme close-up. Tactile surface detail only. No scenes, no people, no technology graphics. No text, no logos.",
  },
  {
    category: "general",
    categoryLabel: "General",
    categoryHint: "Composición libre que sintetiza el tono visual global.",
    promptSuffix:
      "General brand atmosphere image synthesizing palette, light and mood. Editorial photography. No text, no logos.",
  },
  {
    category: "general",
    categoryLabel: "General",
    categoryHint: "Variación general — otra lectura del mismo ADN visual.",
    promptSuffix:
      "Second general brand scene. Cohesive with visual world limits and traits. No text, no logos.",
  },
];

export type GalleryGeneratedItem = GalleryValue["generated"][number];

export function groupGeneratedByCategory(
  items: GalleryGeneratedItem[],
): Record<GalleryGenerateCategory, GalleryGeneratedItem[]> {
  const grouped: Record<GalleryGenerateCategory, GalleryGeneratedItem[]> = {
    people_mood: [],
    places: [],
    objects: [],
    textures: [],
    general: [],
  };
  for (const item of items) {
    const category = item.category ?? "general";
    grouped[category].push(item);
  }
  return grouped;
}

export const GALLERY_CATEGORY_ORDER: GalleryGenerateCategory[] = [
  "people_mood",
  "places",
  "objects",
  "textures",
  "general",
];

export function categoryMeta(category: GalleryGenerateCategory): { label: string; hint: string } {
  const slot = GALLERY_GENERATE_PLAN.find((entry) => entry.category === category);
  return {
    label: slot?.categoryLabel ?? category,
    hint: slot?.categoryHint ?? "",
  };
}

export function slotsForCategory(category: GalleryGenerateCategory): GalleryGenerateSlot[] {
  return GALLERY_GENERATE_PLAN.filter((entry) => entry.category === category);
}

export function buildCategoryBriefing(
  category: GalleryGenerateCategory,
  toneExplanation?: string,
): { label: string; hint: string; tone?: string } {
  const meta = categoryMeta(category);
  const tone = toneExplanation?.trim();
  return {
    label: meta.label,
    hint: meta.hint,
    tone: tone || undefined,
  };
}
