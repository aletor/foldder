import type { BrandKitDocument } from "./brand-kit-types";
import type { GalleryGenerateCategory } from "./brand-kit-gallery-plan";
import { resolveGalleryCategoryBriefing } from "./brand-kit-gallery-brief";

/** @deprecated Usa resolveGalleryCategoryBriefing */
export function buildBrandCategoryBriefing(doc: BrandKitDocument, category: GalleryGenerateCategory) {
  const resolved = resolveGalleryCategoryBriefing(doc, category);
  return {
    label: resolved.label,
    description: resolved.description,
  };
}

export { resolveGalleryCategoryBriefing } from "./brand-kit-gallery-brief";
