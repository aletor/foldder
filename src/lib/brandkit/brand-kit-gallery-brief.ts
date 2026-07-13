import type { BrandKitDocument, GalleryCategoryBrief, GalleryValue } from "./brand-kit-types";
import { galleryIncludedCount } from "./brand-kit-gallery-filter";
import { galleryItemSourceUrl } from "./brand-kit-gallery-media";
import { categoryMeta, GALLERY_CATEGORY_ORDER, type GalleryGenerateCategory } from "./brand-kit-gallery-plan";
import { slotValue } from "./brand-kit-gallery-tone-utils";
import type { EssenceValue, PaletteValue, VisualWorldValue, VoiceValue } from "./brand-kit-types";

export const GALLERY_BRIEF_MIN_INCLUDED_IMAGES = 4;
export const GALLERY_BRIEF_MAX_VISION_FRAMES = 10;

function stableFingerprint(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const primary = (hash >>> 0).toString(16).padStart(8, "0");
  let secondary = 0x811c9dc5;
  for (let i = input.length - 1; i >= 0; i -= 1) {
    secondary ^= input.charCodeAt(i);
    secondary = Math.imul(secondary, 0x01000193);
  }
  return `${primary}${(secondary >>> 0).toString(16).padStart(8, "0")}`.slice(0, 16);
}

export function computeGalleryBriefSourceKey(doc: BrandKitDocument): string {
  const gallery = doc.slots.gallery?.value as GalleryValue | undefined;
  const visual = slotValue<VisualWorldValue>(doc, "visualWorld");
  return computeGalleryBriefSourceKeyFromParts({
    brandName: doc.brandName?.value,
    visualSummary: visual?.summary,
    moodTags: visual?.moodTags,
    includedAssetIds: (gallery?.harvested ?? [])
      .filter((item) => item.included !== false)
      .map((item) => item.assetId),
  });
}

export function computeGalleryBriefSourceKeyFromParts(input: {
  brandName?: string;
  visualSummary?: string;
  moodTags?: string[];
  includedAssetIds: string[];
}): string {
  const included = [...input.includedAssetIds].sort();
  const payload = [
    input.brandName ?? "",
    input.visualSummary ?? "",
    (input.moodTags ?? []).join("|"),
    included.join("|"),
  ].join("::");
  return stableFingerprint(payload);
}

export function applyCategoryBriefsToGallery(
  gallery: GalleryValue,
  briefs: GalleryCategoryBrief[],
  sourceKey: string,
): GalleryValue {
  return {
    ...gallery,
    categoryBriefs: briefs,
    categoryBriefsSourceKey: sourceKey,
    categoryBriefsAnalyzedAt: new Date().toISOString(),
  };
}

export function mergeBatchBriefsIntoGallery(
  gallery: GalleryValue,
  briefs: GalleryCategoryBrief[] | null | undefined,
  parts: { brandName?: string; visualSummary?: string; moodTags?: string[] },
): GalleryValue {
  if (!briefs?.length) return gallery;
  const sourceKey = computeGalleryBriefSourceKeyFromParts({
    brandName: parts.brandName,
    visualSummary: parts.visualSummary,
    moodTags: parts.moodTags,
    includedAssetIds: gallery.harvested
      .filter((item) => item.included !== false)
      .map((item) => item.assetId),
  });
  return applyCategoryBriefsToGallery(gallery, briefs, sourceKey);
}

export function galleryBriefsAreFresh(gallery: GalleryValue | undefined, sourceKey: string): boolean {
  if (!gallery?.categoryBriefs?.length || !gallery.categoryBriefsSourceKey) return false;
  return gallery.categoryBriefsSourceKey === sourceKey;
}

/** Alinea la clave guardada con el ADN actual sin volver a llamar al LLM. */
export function syncGalleryBriefSourceKey(
  gallery: GalleryValue,
  parts: { brandName?: string; visualSummary?: string; moodTags?: string[] },
): GalleryValue {
  if (!gallery.categoryBriefs?.length) return gallery;
  const sourceKey = computeGalleryBriefSourceKeyFromParts({
    brandName: parts.brandName,
    visualSummary: parts.visualSummary,
    moodTags: parts.moodTags,
    includedAssetIds: gallery.harvested
      .filter((item) => item.included !== false)
      .map((item) => item.assetId),
  });
  if (gallery.categoryBriefsSourceKey === sourceKey) return gallery;
  return { ...gallery, categoryBriefsSourceKey: sourceKey };
}

export function galleryBriefForCategory(
  gallery: GalleryValue | undefined,
  category: GalleryGenerateCategory,
): GalleryCategoryBrief | undefined {
  return gallery?.categoryBriefs?.find((entry) => entry.category === category);
}

export type ResolvedGalleryCategoryBriefing = {
  label: string;
  description: string;
  confidence?: GalleryCategoryBrief["confidence"];
  evidenceCount?: number;
  stale: boolean;
  needsAnalysis: boolean;
};

function fallbackDescription(
  doc: BrandKitDocument,
  category: GalleryGenerateCategory,
): string {
  const brand = doc.brandName?.value?.trim() || "La marca";
  const visual = slotValue<VisualWorldValue>(doc, "visualWorld");
  const palette = slotValue<PaletteValue>(doc, "palette");
  const colors =
    palette?.colors
      ?.slice(0, 3)
      .map((color) => `${color.role} ${color.hex}`)
      .join(", ") ?? "paleta de marca";

  const mood = visual?.moodTags?.slice(0, 2).join(" y ") || "editorial";
  const trait = visual?.visualTraits?.[0]?.trim();

  switch (category) {
    case "people_mood":
      return trait
        ? `Personas con ${trait.toLowerCase()} — expresión ${mood}, iluminación coherente con ${brand}.`
        : `Retratos y presencia humana ${mood} para ${brand}, sin estética stock.`;
    case "places":
      return trait
        ? `**Localización vacía** con ${trait.toLowerCase()}: arquitectura o paisaje sin personas, luz ${mood} y materiales del espacio.`
        : `**Entorno deshabitado** ${mood} para ${brand} — interior, calle o paisaje sin gente visible.`;
    case "objects":
      return `Objetos o detalles de producto de ${brand} con ${colors} y luz ${mood}.`;
    case "textures":
      return trait
        ? `Macro de **superficie material** con ${trait.toLowerCase()}: rugosidad, micrograno y acabado (mate/satinado/brillante) en primer plano. Sin personas ni escenas.`
        : `Macrofotografía de **superficie** (tela, madera, piedra, metal, papel…) con tacto visual ${mood} y matices de ${colors}.`;
    default:
      return `Escena sintética del ADN visual de ${brand}: ${mood}, ${colors}.`;
  }
}

export function resolveGalleryCategoryBriefing(
  doc: BrandKitDocument,
  category: GalleryGenerateCategory,
): ResolvedGalleryCategoryBriefing {
  const meta = categoryMeta(category);
  const gallery = doc.slots.gallery?.value as GalleryValue | undefined;
  const sourceKey = computeGalleryBriefSourceKey(doc);
  const included = galleryIncludedCount(gallery);
  const stored = galleryBriefForCategory(gallery, category);
  const fresh = galleryBriefsAreFresh(gallery, sourceKey);

  if (stored && fresh) {
    return {
      label: meta.label,
      description: stored.description,
      confidence: stored.confidence,
      evidenceCount: stored.evidenceCount,
      stale: false,
      needsAnalysis: false,
    };
  }

  const needsAnalysis = included < GALLERY_BRIEF_MIN_INCLUDED_IMAGES || !fresh || !stored;

  if (stored && !fresh) {
    return {
      label: meta.label,
      description: stored.description,
      confidence: stored.confidence,
      evidenceCount: stored.evidenceCount,
      stale: true,
      needsAnalysis: true,
    };
  }

  if (included < GALLERY_BRIEF_MIN_INCLUDED_IMAGES) {
    return {
      label: meta.label,
      description: `Añade al menos ${GALLERY_BRIEF_MIN_INCLUDED_IMAGES} imágenes en Mundo visual para describir con precisión qué generar en ${meta.label.toLowerCase()}.`,
      stale: false,
      needsAnalysis: true,
    };
  }

  return {
    label: meta.label,
    description: fallbackDescription(doc, category),
    stale: false,
    needsAnalysis: true,
  };
}

export function resolveGalleryCategoryBriefings(doc: BrandKitDocument): ResolvedGalleryCategoryBriefing[] {
  return GALLERY_CATEGORY_ORDER.map((category) => resolveGalleryCategoryBriefing(doc, category));
}

export function promptHintForGalleryCategory(
  gallery: GalleryValue | undefined,
  category: GalleryGenerateCategory,
  fallbackSuffix: string,
): string {
  const brief = galleryBriefForCategory(gallery, category);
  const hint = brief?.promptHint?.trim();
  if (hint) return hint;
  return fallbackSuffix;
}

export function includedHarvestForBriefAnalysis(gallery: GalleryValue): GalleryValue["harvested"] {
  return [...gallery.harvested]
    .filter((item) => item.included !== false)
    .sort((a, b) => (b.rankScore ?? 0) - (a.rankScore ?? 0))
    .slice(0, GALLERY_BRIEF_MAX_VISION_FRAMES);
}

export function harvestFrameLabel(item: GalleryValue["harvested"][number], index: number): string {
  const signals = item.rankSignals?.slice(0, 2).join(", ");
  const provenance = item.provenance?.detail?.trim();
  const url = galleryItemSourceUrl(item);
  return `img_${index + 1}${provenance ? ` — ${provenance}` : ""}${signals ? ` (${signals})` : ""}${url ? ` [${url}]` : ""}`;
}
