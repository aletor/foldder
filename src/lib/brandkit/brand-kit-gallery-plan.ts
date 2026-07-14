import type { GalleryValue } from "./brand-kit-types";

export const GALLERY_CATEGORY_SLOT_COUNT = 4;
export const BRAND_KIT_GALLERY_IMAGE_COUNT = 5 * GALLERY_CATEGORY_SLOT_COUNT;

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
  variantIndex: number;
};

const CATEGORY_FALLBACK_SUFFIXES: Record<GalleryGenerateCategory, string[]> = {
  people_mood: [
    "Editorial portrait or human presence expressing brand mood. Focus on face, expression, cinematic lighting. No text, no logos.",
    "Candid human moment with emotional tone matching the brand. Natural or directed, never stock-corporate. No text, no logos.",
    "Environmental portrait with body language and atmosphere aligned to brand. Medium distance, authentic tone. No text, no logos.",
    "Human interaction or gesture scene with mood and light coherent with brand identity. No text, no logos.",
  ],
  places: [
    "Location-first establishing shot: interior, landscape, or urban place as subject. Ambient crowds, objects, or signage allowed. No hero product or portrait focal subject. No text overlays, no logos.",
    "Packed venue or streetscape from wide angle — the place and atmosphere define the frame, not a single person or product.",
    "Workshop, garage, or lived-in space with ambient tools and clutter belonging to the location. No brand product hero shot.",
    "Architectural or natural environment at another scale or time of day — spatial mood is the subject. No product still life.",
  ],
  objects: [
    "Still life object study aligned with brand palette and lighting. Product or symbolic object. No text, no logos.",
    "Secondary prop or accessory still life with different material and scale. No text, no logos.",
    "Grouped object composition with complementary items, shallow depth of field. No text, no logos.",
    "Close object detail showing material finish and functional form. No text, no logos.",
  ],
  textures: [
    "Macro full-frame photograph of a single material surface. Extreme close-up showing roughness, micro-grain, matte or glossy finish. No people, no objects, no rooms, no UI. No text, no logos.",
    "Alternative macro texture: fabric weave at extreme close-up. Tactile surface detail only. No scenes, no people. No text, no logos.",
    "Macro brushed metal, stone, or mineral grain filling the frame. No technology graphics. No text, no logos.",
    "Macro wood, leather, or coated surface with raking light and visible grain. No people, no UI. No text, no logos.",
  ],
  general: [
    "General brand atmosphere image synthesizing palette, light and mood. Editorial photography. No text, no logos.",
    "Second general brand scene with layered depth and alternative focal point. No text, no logos.",
    "Atmospheric brand composition emphasizing color, shadow, and material. No text, no logos.",
    "Alternative editorial synthesis of the same visual DNA. No text, no logos.",
  ],
};

export const GALLERY_CATEGORY_ORDER: GalleryGenerateCategory[] = [
  "people_mood",
  "places",
  "objects",
  "textures",
  "general",
];

export function categoryMeta(category: GalleryGenerateCategory): { label: string; hint: string } {
  switch (category) {
    case "people_mood":
      return { label: "Personas & mood", hint: "Rostros, emoción, actitud y luz sobre personas." };
    case "places":
      return { label: "Entorno", hint: "Localización como sujeto: el lugar manda; multitudes, objetos y textos ambientales son válidos." };
    case "objects":
      return { label: "Objetos", hint: "Objetos simbólicos o de producto con tratamiento editorial." };
    case "textures":
      return { label: "Texturas", hint: "Macro de superficie material: rugosidad, brillo y grano." };
    default:
      return { label: "General", hint: "Composición libre que sintetiza el tono visual global." };
  }
}

export const GALLERY_GENERATE_PLAN: GalleryGenerateSlot[] = GALLERY_CATEGORY_ORDER.flatMap((category) => {
  const meta = categoryMeta(category);
  return CATEGORY_FALLBACK_SUFFIXES[category].map((promptSuffix, variantIndex) => ({
    category,
    categoryLabel: meta.label,
    categoryHint:
      variantIndex === 0
        ? meta.hint
        : `${meta.hint} Variación ${variantIndex + 1}.`,
    promptSuffix,
    variantIndex,
  }));
});

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
