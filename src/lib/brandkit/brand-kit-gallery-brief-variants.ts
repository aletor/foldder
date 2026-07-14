import type { GalleryCategoryBrief, GalleryCategoryBriefVariant } from "./brand-kit-types";
import type { GalleryGenerateCategory } from "./brand-kit-gallery-plan";
import { GALLERY_CATEGORY_SLOT_COUNT } from "./brand-kit-gallery-plan";

const VARIANT_ANGLE_SUFFIXES: Record<GalleryGenerateCategory, string[]> = {
  people_mood: [
    "Tight editorial portrait, expressive face, cinematic side light.",
    "Candid mid-distance moment, natural body language and atmosphere.",
    "Environmental portrait with context in soft focus behind subject.",
    "Interaction or gesture scene with authentic emotional tone.",
  ],
  places: [
    "Wide location plate: interior, street, or landscape where the place is the subject.",
    "Crowded venue or urban scene — ambient people as part of the environment, not portrait focus.",
    "Lived-in space with tools, objects, or signage native to the location.",
    "Architectural or natural setting at a different scale; spatial atmosphere leads.",
  ],
  objects: [
    "Hero still life of primary product or prop, studio lighting.",
    "Secondary object or accessory at different scale and material.",
    "Grouped composition with complementary props, shallow depth of field.",
    "Close detail of texture, label-free surface, or functional component.",
  ],
  textures: [
    "Macro full-frame fabric or fiber weave with visible thread grain.",
    "Brushed metal, stone, or mineral surface with specular response.",
    "Wood, paper, or organic material with tactile micro-grain.",
    "Painted, coated, or laminated surface with matte or satin finish.",
  ],
  general: [
    "Wide atmospheric scene synthesizing brand palette and light.",
    "Medium editorial composition with layered depth and mood.",
    "Abstracted brand atmosphere through color, shadow, and material.",
    "Alternative reading of the same visual DNA with different focal point.",
  ],
};

export function normalizeGalleryCategoryBrief(brief: GalleryCategoryBrief): GalleryCategoryBrief {
  const variants = resolveGalleryBriefVariants(brief);
  const primary = variants[0];
  return {
    ...brief,
    description: brief.description.trim() || primary.description,
    promptHint: brief.promptHint.trim() || primary.promptHint,
    variants,
  };
}

export function resolveGalleryBriefVariants(brief: GalleryCategoryBrief): GalleryCategoryBriefVariant[] {
  const cleaned = (brief.variants ?? [])
    .map((variant) => ({
      description: variant.description?.trim() ?? "",
      promptHint: variant.promptHint?.trim() ?? "",
    }))
    .filter((variant) => variant.description || variant.promptHint);

  if (cleaned.length >= GALLERY_CATEGORY_SLOT_COUNT) {
    return cleaned.slice(0, GALLERY_CATEGORY_SLOT_COUNT);
  }

  if (cleaned.length > 0) {
    return padVariants(cleaned, brief);
  }

  return expandLegacyBriefVariants(brief);
}

export function galleryVariantPromptHint(
  brief: GalleryCategoryBrief | undefined,
  variantIndex: number,
): string | undefined {
  if (!brief) return undefined;
  const variants = resolveGalleryBriefVariants(brief);
  return variants[variantIndex]?.promptHint?.trim() || undefined;
}

/** Texto visible en la card: un párrafo de esencia de categoría, nunca las 4 variantes. */
export function categoryBriefDisplayDescription(brief: GalleryCategoryBrief): string {
  const summary = cleanCategoryBriefSummary(brief.description?.trim() ?? "");
  if (summary && !looksLikeConcatenatedVariants(summary)) return summary;

  const variants = resolveGalleryBriefVariants(brief);
  const first = cleanCategoryBriefSummary(variants[0]?.description?.trim() ?? "");
  if (first) return first;

  return summary;
}

function cleanCategoryBriefSummary(text: string): string {
  return text
    .replace(/\s*Variación\s+\d+\.?\s*/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function looksLikeConcatenatedVariants(text: string): boolean {
  return /Variación\s+[2-9]/i.test(text) || text.split(" · ").filter(Boolean).length > 1;
}

function padVariants(
  variants: GalleryCategoryBriefVariant[],
  brief: GalleryCategoryBrief,
): GalleryCategoryBriefVariant[] {
  const padded = [...variants];
  const angles = VARIANT_ANGLE_SUFFIXES[brief.category];
  while (padded.length < GALLERY_CATEGORY_SLOT_COUNT) {
    const index = padded.length;
    const seed = padded[padded.length - 1] ?? {
      description: brief.description,
      promptHint: brief.promptHint,
    };
    padded.push({
      description: seed.description,
      promptHint: `${seed.promptHint} ${angles[index] ?? angles[angles.length - 1]}`.trim(),
    });
  }
  return padded.slice(0, GALLERY_CATEGORY_SLOT_COUNT);
}

function expandLegacyBriefVariants(brief: GalleryCategoryBrief): GalleryCategoryBriefVariant[] {
  const baseDescription = brief.description.trim();
  const baseHint = brief.promptHint.trim();
  const angles = VARIANT_ANGLE_SUFFIXES[brief.category];

  return angles.map((angle, index) => ({
    description: baseDescription,
    promptHint: index === 0 ? baseHint : `${baseHint} ${angle}`.trim(),
  }));
}

export function parseGalleryBriefVariantsFromRaw(
  category: GalleryGenerateCategory,
  raw: {
    description?: string;
    promptHint?: string;
    variants?: Array<{ description?: string; promptHint?: string }>;
  },
): GalleryCategoryBriefVariant[] | null {
  const summary = raw.description?.trim() ?? "";
  const legacyHint = raw.promptHint?.trim() ?? "";
  const variantsRaw = raw.variants ?? [];

  const parsed = variantsRaw
    .map((variant) => ({
      description: variant.description?.trim() ?? "",
      promptHint: variant.promptHint?.trim() ?? "",
    }))
    .filter((variant) => variant.description && variant.promptHint);

  if (parsed.length >= GALLERY_CATEGORY_SLOT_COUNT) {
    return parsed.slice(0, GALLERY_CATEGORY_SLOT_COUNT);
  }

  if (!summary && !legacyHint && !parsed.length) return null;

  return resolveGalleryBriefVariants({
    category,
    description: summary,
    promptHint: legacyHint || parsed[0]?.promptHint || "",
    variants: parsed,
    confidence: "medium",
    evidenceCount: 0,
  });
}
