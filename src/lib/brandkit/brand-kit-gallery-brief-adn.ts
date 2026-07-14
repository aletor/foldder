import type { BrandKitDocument, GalleryValue } from "./brand-kit-types";
import type { EssenceValue, PaletteValue, VisualWorldValue, VoiceValue } from "./brand-kit-types";
import type { GalleryGenerateCategory } from "./brand-kit-gallery-plan";
import { GALLERY_CATEGORY_SLOT_COUNT } from "./brand-kit-gallery-plan";
import { slotValue } from "./brand-kit-gallery-tone-utils";
import {
  formatImageStyleForContext,
  galleryBriefMediumInstruction,
  resolveBrandImageStyle,
} from "./brand-kit-visual-style";
import { placesAdnSuggestsPopulatedVenue } from "./brand-kit-gallery-places-guidance";

export type GalleryBriefSourceParts = {
  brandName?: string;
  visualSummary?: string;
  moodTags?: string[];
  imageMedium?: string;
  imageStyleTags?: string[];
  essenceHeadline?: string;
  voiceSummary?: string;
  voiceDescriptors?: string[];
  includedAssetIds: string[];
};

export function galleryBriefSourcePartsFromDoc(doc: BrandKitDocument): GalleryBriefSourceParts {
  const gallery = doc.slots.gallery?.value as GalleryValue | undefined;
  const visual = slotValue<VisualWorldValue>(doc, "visualWorld");
  const voice = slotValue<VoiceValue>(doc, "voice");
  const essence = slotValue<EssenceValue>(doc, "essence");

  return {
    brandName: doc.brandName?.value,
    visualSummary: visual?.summary,
    moodTags: visual?.moodTags,
    imageMedium: visual?.imageMedium ?? resolveBrandImageStyle(visual).medium,
    imageStyleTags: visual?.imageStyleTags,
    essenceHeadline: essence?.headline?.trim() || essence?.summary?.trim(),
    voiceSummary: voice?.summary,
    voiceDescriptors: voice?.descriptors,
    includedAssetIds: (gallery?.harvested ?? [])
      .filter((item) => item.included !== false)
      .map((item) => item.assetId),
  };
}

export function galleryBriefSourcePartsFromSynthesis(input: {
  brandName?: string;
  essence?: EssenceValue | null;
  voice?: VoiceValue | null;
  visualWorld?: VisualWorldValue | null;
}): Omit<GalleryBriefSourceParts, "includedAssetIds"> {
  const visual = input.visualWorld ?? undefined;
  return {
    brandName: input.brandName,
    visualSummary: visual?.summary,
    moodTags: visual?.moodTags,
    imageMedium: visual?.imageMedium ?? resolveBrandImageStyle(visual).medium,
    imageStyleTags: visual?.imageStyleTags,
    essenceHeadline: input.essence?.headline?.trim() || input.essence?.summary?.trim(),
    voiceSummary: input.voice?.summary,
    voiceDescriptors: input.voice?.descriptors,
  };
}

export function hasGalleryAdnContext(doc: BrandKitDocument): boolean {
  const visual = slotValue<VisualWorldValue>(doc, "visualWorld");
  const voice = slotValue<VoiceValue>(doc, "voice");
  const essence = slotValue<EssenceValue>(doc, "essence");

  if (visual?.summary?.trim()) return true;
  if (essence?.headline?.trim() || essence?.summary?.trim()) return true;
  if (voice?.summary?.trim()) return true;
  if (voice?.descriptors?.some((entry) => entry.trim())) return true;
  if (visual?.moodTags?.some((entry) => entry.trim())) return true;
  if (visual?.visualTraits?.some((entry) => entry.trim())) return true;
  return false;
}

export function buildGalleryBriefBrandContext(doc: BrandKitDocument, stylePrompt?: string): string {
  const brand = doc.brandName?.value?.trim() || "Marca";
  const visual = slotValue<VisualWorldValue>(doc, "visualWorld");
  const voice = slotValue<VoiceValue>(doc, "voice");
  const essence = slotValue<EssenceValue>(doc, "essence");
  const palette = slotValue<PaletteValue>(doc, "palette");

  const lines = [`Marca: ${brand}`];
  if (visual?.summary?.trim()) lines.push(`Mundo visual: ${visual.summary.trim()}`);
  if (visual?.moodTags?.length) lines.push(`Mood: ${visual.moodTags.join(", ")}`);
  lines.push(`Medio artístico: ${formatImageStyleForContext(visual)}`);
  if (visual?.visualTraits?.length) {
    lines.push("Rasgos:", ...visual.visualTraits.map((trait) => `- ${trait}`));
  }
  if (visual?.limits?.length) lines.push("Evitar:", ...visual.limits.map((limit) => `- ${limit}`));
  if (voice?.summary?.trim()) lines.push(`Voz: ${voice.summary.trim()}`);
  if (voice?.descriptors?.length) {
    lines.push("Tono:", ...voice.descriptors.slice(0, 6).map((descriptor) => `- ${descriptor}`));
  }
  if (essence?.headline?.trim()) lines.push(`Esencia: ${essence.headline.trim()}`);
  else if (essence?.summary?.trim()) lines.push(`Esencia: ${essence.summary.trim()}`);
  if (essence?.purpose?.trim()) lines.push(`Propósito: ${essence.purpose.trim()}`);
  if (essence?.promise?.trim()) lines.push(`Promesa: ${essence.promise.trim()}`);
  if (essence?.brandContext?.trim()) lines.push(`Contexto de producto: ${essence.brandContext.trim()}`);
  if (palette?.colors?.length) {
    lines.push(
      "Paleta:",
      ...palette.colors.slice(0, 6).map((color) => `- ${color.role}: ${color.hex}`),
    );
  }
  if (stylePrompt?.trim()) lines.push(`Style prompt compilado: ${stylePrompt.trim()}`);
  lines.push(galleryBriefMediumInstruction(visual));
  return lines.join("\n");
}

function paletteHint(doc: BrandKitDocument): string {
  const palette = slotValue<PaletteValue>(doc, "palette");
  return (
    palette?.colors
      ?.slice(0, 3)
      .map((color) => color.hex)
      .join(", ") ?? ""
  );
}

function moodHint(doc: BrandKitDocument): string {
  const visual = slotValue<VisualWorldValue>(doc, "visualWorld");
  return visual?.moodTags?.slice(0, 2).join(" and ") || "editorial";
}

function voiceHint(doc: BrandKitDocument): string {
  const voice = slotValue<VoiceValue>(doc, "voice");
  const descriptor = voice?.descriptors?.find((entry) => entry.trim())?.trim();
  return voice?.summary?.trim() || descriptor || "";
}

export function promptHintFromAdn(doc: BrandKitDocument, category: GalleryGenerateCategory): string {
  return promptHintsFromAdn(doc, category)[0] ?? "";
}

export function promptHintsFromAdn(
  doc: BrandKitDocument,
  category: GalleryGenerateCategory,
): string[] {
  const brand = doc.brandName?.value?.trim() || "brand";
  const colors = paletteHint(doc);
  const mood = moodHint(doc);
  const voice = voiceHint(doc);
  const visual = slotValue<VisualWorldValue>(doc, "visualWorld");
  const essence = slotValue<EssenceValue>(doc, "essence");
  const traits = visual?.visualTraits?.map((entry) => entry.trim()).filter(Boolean) ?? [];
  const moods = visual?.moodTags?.map((entry) => entry.trim()).filter(Boolean) ?? [];
  const purpose = essence?.purpose?.trim() || essence?.summary?.trim() || "";
  const { medium } = resolveBrandImageStyle(visual);
  const mediumWord =
    medium === "illustration"
      ? "illustrated"
      : medium === "collage"
        ? "collage"
        : medium === "3d_render"
          ? "3D rendered"
          : medium === "graphic_design"
            ? "graphic design"
            : medium === "mixed"
              ? "mixed-media"
              : "editorial";

  const pick = (items: string[], index: number, fallback: string) =>
    items[index]?.trim() || items[0]?.trim() || fallback;

  switch (category) {
    case "people_mood":
      return Array.from({ length: GALLERY_CATEGORY_SLOT_COUNT }, (_, index) => {
        const trait = pick(traits, index, "authentic human presence");
        const moodTag = pick(moods, index, mood);
        const frames = [
          `${mediumWord} portrait for ${brand}, ${trait}, ${moodTag} mood, ${colors || "brand palette"}, ${voice || "editorial"} tone.`,
          `Candid human moment for ${brand}, ${trait}, ${moodTag} atmosphere, natural light, no stock look.`,
          `Environmental portrait for ${brand}, ${trait}, medium distance, ${moodTag} tone, ${purpose ? `context: ${purpose}` : "brand-faithful context"}.`,
          `Human gesture or interaction for ${brand}, ${moodTag} emotional tone, ${trait}, coherent with brand offering.`,
        ];
        return frames[index] ?? frames[0];
      });
    case "places":
      return Array.from({ length: GALLERY_CATEGORY_SLOT_COUNT }, (_, index) => {
        const trait = pick(traits, index, "architectural atmosphere");
        const moodTag = pick(moods, index, mood);
        const populated = placesAdnSuggestsPopulatedVenue({
          moodTags: moods,
          visualTraits: traits,
          purpose,
        });
        const frames = [
          `Uninhabited location plate for ${brand}: ${trait}, ${moodTag} light, ${colors || "brand colors"} — architecture and spatial atmosphere only.`,
          `Wide establishing shot for ${brand}: ${trait}, ${moodTag} atmosphere, empty or sparsely occupied exterior or landscape.`,
          `Lived-in environment for ${brand}: ${moodTag} tones, ${trait}, ambient tools or objects native to the place, no portrait focal subject.`,
          populated
            ? `Populated venue for ${brand}: ${moodTag} atmosphere, distant crowd as soft background mass, place still leads — no portrait or product hero.`
            : `Alternative uninhabited space for ${brand}: material and light focus, ${trait}, ${moodTag} mood — no people unless essential to the location.`,
        ];
        return frames[index] ?? frames[0];
      });
    case "objects":
      return Array.from({ length: GALLERY_CATEGORY_SLOT_COUNT }, (_, index) => {
        const trait = pick(traits, index, "refined material finish");
        const moodTag = pick(moods, index, mood);
        const frames = [
          `Hero still life for ${brand}, ${purpose ? `faithful to ${purpose}` : "brand offering"}, ${colors || "brand palette"}, ${moodTag} lighting.`,
          `Secondary product or prop for ${brand}, ${trait}, ${moodTag} still life, coherent product category.`,
          `Grouped objects for ${brand}, complementary props, ${colors || "brand palette"}, shallow depth of field.`,
          `Close product detail for ${brand}, ${trait}, functional and category-faithful, ${moodTag} light.`,
        ];
        return frames[index] ?? frames[0];
      });
    case "textures":
      return Array.from({ length: GALLERY_CATEGORY_SLOT_COUNT }, (_, index) => {
        const trait = pick(traits, index, "tactile surface");
        const moodTag = pick(moods, index, mood);
        const materials = ["fabric weave", "brushed metal", "stone grain", "coated surface"];
        const material = materials[index] ?? materials[0];
        return `Macro full-frame ${material} for ${brand}, ${trait}, ${moodTag} color cast, visible grain, no people or UI, ${mediumWord} treatment.`;
      });
    default:
      return Array.from({ length: GALLERY_CATEGORY_SLOT_COUNT }, (_, index) => {
        const trait = pick(traits, index, "coherent visual tone");
        const moodTag = pick(moods, index, mood);
        const frames = [
          `Wide brand atmosphere for ${brand}, ${moodTag} mood, ${colors || "brand palette"}, ${trait}.`,
          `Medium editorial scene for ${brand}, ${moodTag} light, ${trait}, ${purpose ? `aligned with ${purpose}` : "brand context"}.`,
          `Layered atmospheric composition for ${brand}, ${moodTag} tones, ${colors || "brand palette"}.`,
          `Alternative brand synthesis for ${brand}, ${trait}, ${moodTag} mood, distinct focal point.`,
        ];
        return frames[index] ?? frames[0];
      });
  }
}
