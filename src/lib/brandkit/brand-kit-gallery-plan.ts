import type { GalleryValue } from "./brand-kit-types";

export const GALLERY_CATEGORY_SLOT_COUNT = 4;
export const BRAND_KIT_GALLERY_IMAGE_COUNT = 4 * GALLERY_CATEGORY_SLOT_COUNT;

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
    "Location-first establishing shot: uninhabited interior, landscape, or urban place — architecture, light, and materials as subject. No text overlays, titles, or logos.",
    "Wide exterior or horizon with sparse or no human presence — spatial mood leads the frame. No headlines or captions.",
    "Lived-in workshop or niche space with ambient tools native to the place; no people unless brief specifies. No overlaid typography.",
    "Alternative architectural or natural setting at a different scale — default empty unless brief names a crowded venue. Pure environmental photograph, no title graphics.",
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
];

export function categoryMeta(category: GalleryGenerateCategory): { label: string; hint: string } {
  switch (category) {
    case "people_mood":
      return { label: "Personas & mood", hint: "Rostros, emoción, actitud y luz sobre personas." };
    case "places":
      return { label: "Entorno", hint: "Localización como sujeto: por defecto vacío o con ocupación ligera; multitudes solo si el brief lo pide." };
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

export function mergeSingleGallerySlot(
  existing: GalleryGeneratedItem[],
  category: GalleryGenerateCategory,
  variantIndex: number,
  incoming: GalleryGeneratedItem,
): GalleryGeneratedItem[] {
  const categoryItems = existing.filter((item) => (item.category ?? "general") === category);
  const other = existing.filter((item) => (item.category ?? "general") !== category);
  const slots = gallerySlotsForCategory(categoryItems);
  slots[variantIndex] = { ...incoming, category, variantIndex, verdict: incoming.verdict ?? "up" };
  return [...other, ...slots.filter((slot): slot is GalleryGeneratedItem => Boolean(slot))];
}

export function slotsForCategory(category: GalleryGenerateCategory): GalleryGenerateSlot[] {
  return GALLERY_GENERATE_PLAN.filter((entry) => entry.category === category);
}

export function slotForCategoryVariant(
  category: GalleryGenerateCategory,
  variantIndex: number,
): GalleryGenerateSlot | undefined {
  return slotsForCategory(category).find((entry) => entry.variantIndex === variantIndex);
}

export function gallerySlotsForCategory(
  items: GalleryGeneratedItem[],
): (GalleryGeneratedItem | undefined)[] {
  const slots: (GalleryGeneratedItem | undefined)[] = Array(GALLERY_CATEGORY_SLOT_COUNT).fill(undefined);
  const legacy: GalleryGeneratedItem[] = [];
  for (const item of items) {
    if (
      typeof item.variantIndex === "number" &&
      item.variantIndex >= 0 &&
      item.variantIndex < GALLERY_CATEGORY_SLOT_COUNT
    ) {
      slots[item.variantIndex] = item;
    } else {
      legacy.push(item);
    }
  }
  let cursor = 0;
  for (let index = 0; index < GALLERY_CATEGORY_SLOT_COUNT; index += 1) {
    if (!slots[index] && legacy[cursor]) {
      slots[index] = legacy[cursor];
      cursor += 1;
    }
  }
  return slots;
}

export type GalleryGenerateScope =
  | { scope: "all" }
  | { scope: "category"; category: GalleryGenerateCategory }
  | { scope: "slot"; category: GalleryGenerateCategory; variantIndex: number };

export function galleryGenerateScopeMatchesCategory(
  target: GalleryGenerateScope | null,
  category: GalleryGenerateCategory,
): boolean {
  if (!target) return false;
  if (target.scope === "all") return true;
  return target.category === category;
}

export function galleryGenerateScopeMatchesSlot(
  target: GalleryGenerateScope | null,
  category: GalleryGenerateCategory,
  variantIndex: number,
): boolean {
  if (!target) return false;
  if (target.scope === "slot") {
    return target.category === category && target.variantIndex === variantIndex;
  }
  if (target.scope === "category") return target.category === category;
  return target.scope === "all";
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
