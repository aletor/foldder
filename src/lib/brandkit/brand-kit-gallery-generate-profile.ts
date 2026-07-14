import type { GalleryValue } from "./brand-kit-types";
import { galleryItemSourceUrl } from "./brand-kit-gallery-media";
import type { GalleryGenerateCategory } from "./brand-kit-gallery-plan";
import { estimateGeminiImageGenerationUsd } from "@/lib/pricing-config";

export type GalleryImageModelKey = "flash25" | "flash31" | "pro3";

export type GalleryCategoryGenerateProfile = {
  model: GalleryImageModelKey;
  aspect_ratio: string;
  resolution: string;
};

const PREMIUM_CATEGORIES = new Set<GalleryGenerateCategory>(["people_mood", "general"]);

/** Fase 3: Flash 3.1 en Personas y General; Flash 2.5 en el resto. */
export function galleryCategoryGenerateProfile(
  category: GalleryGenerateCategory,
): GalleryCategoryGenerateProfile {
  if (category === "people_mood") {
    return { model: "flash31", aspect_ratio: "4:5", resolution: "1k" };
  }
  if (category === "general") {
    return { model: "flash31", aspect_ratio: "16:9", resolution: "1k" };
  }
  if (category === "places") {
    return { model: "flash25", aspect_ratio: "16:9", resolution: "1k" };
  }
  return { model: "flash25", aspect_ratio: "1:1", resolution: "1k" };
}

export function isPremiumGalleryCategory(category: GalleryGenerateCategory): boolean {
  return PREMIUM_CATEGORIES.has(category);
}

export function estimateGalleryImageUnitUsd(category: GalleryGenerateCategory): number {
  const profile = galleryCategoryGenerateProfile(category);
  return estimateGeminiImageGenerationUsd(profile.model, profile.resolution);
}

export function estimateGalleryGenerateCostUsd(
  imageCount: number,
  category?: GalleryGenerateCategory,
): number {
  if (category) {
    return Math.round(estimateGalleryImageUnitUsd(category) * imageCount * 1_000_000) / 1_000_000;
  }
  const perCategory = 4;
  const premium = estimateGalleryImageUnitUsd("people_mood") * perCategory * 2;
  const standard =
    estimateGalleryImageUnitUsd("places") * perCategory +
    estimateGalleryImageUnitUsd("objects") * perCategory +
    estimateGalleryImageUnitUsd("textures") * perCategory;
  return Math.round((premium + standard) * 1_000_000) / 1_000_000;
}

/** Fase 2: hasta 2 referencias cosechadas para luz/color (no identidad). */
const REFERENCE_SKIP_CATEGORIES = new Set<GalleryGenerateCategory>(["people_mood", "places"]);

/** Personas y entornos: las refs cosechadas suelen traer actores, sets o logos (riesgo copyright). */
export function galleryStyleReferencesAllowed(category: GalleryGenerateCategory): boolean {
  return !REFERENCE_SKIP_CATEGORIES.has(category);
}

export function galleryStyleReferenceUrls(
  gallery: GalleryValue | undefined,
  limit = 2,
  category?: GalleryGenerateCategory,
): string[] {
  if (category && !galleryStyleReferencesAllowed(category)) return [];
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const item of [...(gallery?.harvested ?? [])].sort(
    (a, b) => (b.rankScore ?? 0) - (a.rankScore ?? 0),
  )) {
    if (item.included === false) continue;
    const source = galleryItemSourceUrl(item)?.trim();
    if (!source || seen.has(source)) continue;
    seen.add(source);
    urls.push(source);
    if (urls.length >= limit) break;
  }
  return urls;
}

export const GALLERY_REFERENCE_STYLE_LEAD =
  "Reference images attached: match lighting, color grade, grain, and material treatment only. Do not copy faces, identities, bodies, logos, or exact compositions from references.";
