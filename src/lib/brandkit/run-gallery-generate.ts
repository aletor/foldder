import { compileBrandKit } from "./compile-brand-kit";
import { buildGalleryToneExplanation } from "./brand-kit-gallery-tone";
import {
  GALLERY_GENERATE_PLAN,
  BRAND_KIT_GALLERY_IMAGE_COUNT,
  GALLERY_CATEGORY_ORDER,
  GALLERY_CATEGORY_SLOT_COUNT,
  mergeSingleGallerySlot,
  slotForCategoryVariant,
  slotsForCategory,
  type GalleryGenerateCategory,
  type GalleryGeneratedItem,
} from "./brand-kit-gallery-plan";
import { promptHintForGalleryCategory } from "./brand-kit-gallery-brief";
import { gallerySlotKey } from "./brand-kit-gallery-image-state";
import { buildGalleryImagePrompt } from "./brand-kit-gallery-category-guidance";
import {
  estimateGalleryImageUnitUsd,
  estimateGalleryGenerateCostUsd,
  galleryCategoryGenerateProfile,
  galleryStyleReferenceUrls,
  GALLERY_REFERENCE_STYLE_LEAD,
} from "./brand-kit-gallery-generate-profile";
import type { GalleryValue, BrandKitDocument } from "./brand-kit-types";
import { geminiImageGenerate, GeminiGenerateError } from "@/lib/gemini-image-generate";

const IMAGE_MODEL = "gemini-2.5-flash-image";

/** Política absoluta: `src/lib/paid-api-policy.ts` — una variante = una llamada; sin rellamada en catch. */

const GALLERY_POLICY_BLOCK_MESSAGE =
  "Generación bloqueada por copyright o seguridad. Las imágenes cosechadas pueden incluir actores, logos o sets reconocibles — exclúyelas en la galería o re-analiza briefs con escenas más genéricas.";

export type BrandKitGalleryStreamEvent =
  | {
      type: "tone";
      explanation: string;
      stylePrompt: string;
    }
  | {
      type: "progress";
      index: number;
      total: number;
      category: string;
      categoryLabel: string;
      message: string;
    }
  | {
      type: "image_done";
      index: number;
      item: GalleryGeneratedItem;
    }
  | {
      type: "done";
      gallery: GalleryValue;
      addedCount: number;
      partial: boolean;
      stylePrompt: string;
    }
  | { type: "error"; message: string };

export type BrandKitGalleryGenerateOptions = {
  category?: GalleryGenerateCategory;
  variantIndex?: number;
};

function resolveGeneratePlan(category?: GalleryGenerateCategory, variantIndex?: number) {
  if (category != null && variantIndex != null) {
    const slot = slotForCategoryVariant(category, variantIndex);
    return slot ? [slot] : [];
  }
  if (category) return slotsForCategory(category);
  return GALLERY_GENERATE_PLAN;
}

function mergeGeneratedForCategory(
  existing: GalleryGeneratedItem[],
  category: GalleryGenerateCategory | undefined,
  incoming: GalleryGeneratedItem[],
  variantIndex?: number,
): GalleryGeneratedItem[] {
  if (category != null && variantIndex != null) {
    const item = incoming[0];
    if (!item) return existing;
    return mergeSingleGallerySlot(existing, category, variantIndex, item);
  }
  if (!category) {
    const kept = existing.filter((item) => {
      const itemCategory = item.category ?? "general";
      return itemCategory === "general" || !GALLERY_CATEGORY_ORDER.includes(itemCategory);
    });
    return [
      ...kept,
      ...incoming.map((item) => ({
        ...item,
        variantIndex: item.variantIndex,
        verdict: item.verdict ?? "up",
      })),
    ];
  }
  const kept = existing.filter((item) => (item.category ?? "general") !== category);
  return [
    ...kept,
    ...incoming.map((item, index) => ({
      ...item,
      category,
      variantIndex: item.variantIndex ?? index,
      verdict: item.verdict ?? "up",
    })),
  ];
}

function mapGalleryGenerateError(error: unknown): string {
  if (error instanceof GeminiGenerateError && /copyright|safety filter|content blocked/i.test(error.message)) {
    return GALLERY_POLICY_BLOCK_MESSAGE;
  }
  return error instanceof Error ? error.message : "Error generando imagen";
}

export async function* runBrandKitGalleryGenerate(input: {
  brandKit: BrandKitDocument;
  stylePromptVersion: number;
  userEmail: string;
  category?: GalleryGenerateCategory;
  variantIndex?: number;
}): AsyncGenerator<BrandKitGalleryStreamEvent> {
  const gallerySlot = input.brandKit.slots.gallery;
  const gallery = gallerySlot?.value as GalleryValue | undefined;
  const docForPrompt = {
    ...input.brandKit,
    slots: {
      ...input.brandKit.slots,
      gallery: {
        ...gallerySlot,
        value: gallery
          ? { ...gallery, stylePromptVersion: input.stylePromptVersion }
          : { harvested: [], generated: [], stylePromptVersion: input.stylePromptVersion },
      },
    },
  } satisfies BrandKitDocument;

  const { compiled } = await compileBrandKit(docForPrompt);
  const stylePrompt = compiled.stylePrompt?.trim();
  if (!stylePrompt || stylePrompt.length < 40) {
    yield {
      type: "error",
      message: "Completa paleta, tipografía o mundo visual antes de generar imágenes de estilo.",
    };
    return;
  }

  const toneExplanation = buildGalleryToneExplanation(docForPrompt, stylePrompt);
  yield { type: "tone", explanation: toneExplanation, stylePrompt };

  const plan = resolveGeneratePlan(input.category, input.variantIndex);
  const total = plan.length;
  if (!total) {
    yield { type: "error", message: "No se encontró la variante de galería solicitada." };
    return;
  }
  const generated: GalleryGeneratedItem[] = [];
  let lastError: string | undefined;
  const slotIssues: GalleryValue["slotIssues"] = { ...(gallery?.slotIssues ?? {}) };

  for (let index = 0; index < plan.length; index += 1) {
    const slot = plan[index];
    const profile = galleryCategoryGenerateProfile(slot.category);
    const styleRefs = galleryStyleReferenceUrls(gallery, 2, slot.category);

    yield {
      type: "progress",
      index: index + 1,
      total,
      category: slot.category,
      categoryLabel: slot.categoryLabel,
      message: `Generando ${slot.categoryLabel} (${index + 1}/${total})…`,
    };

    try {
      const promptSuffix = promptHintForGalleryCategory(
        gallery,
        slot.category,
        slot.promptSuffix,
        docForPrompt,
        slot.variantIndex,
      );
      const basePrompt = buildGalleryImagePrompt(
        slot.category,
        stylePrompt,
        promptSuffix,
        docForPrompt,
        slot.variantIndex,
      );
      const prompt = styleRefs.length
        ? `${GALLERY_REFERENCE_STYLE_LEAD} ${basePrompt}`
        : basePrompt;

      const result = await geminiImageGenerate(
        {
          prompt,
          images: styleRefs.length ? styleRefs : undefined,
          model: profile.model,
          aspect_ratio: profile.aspect_ratio,
          resolution: profile.resolution,
        },
        undefined,
        {
          usageRoute: "/api/spaces/brandKit/gallery/generate",
          usageUserEmail: input.userEmail,
        },
      );

      const item: GalleryGeneratedItem = {
        assetId: result.key,
        previewUrl: result.output,
        promptVersion: input.stylePromptVersion,
        category: slot.category,
        categoryLabel: slot.categoryLabel,
        variantIndex: slot.variantIndex,
        verdict: "up",
      };
      generated.push(item);
      delete slotIssues[gallerySlotKey(slot.category, slot.variantIndex)];
      yield { type: "image_done", index: index + 1, item };
    } catch (error) {
      lastError = mapGalleryGenerateError(error);
      slotIssues[gallerySlotKey(slot.category, slot.variantIndex)] = {
        error: lastError,
        at: new Date().toISOString(),
        noCharge: true,
      };
      console.error(`[brandKit/gallery/generate] ${slot.category} ${index + 1}`, error);
    }
  }

  const hasSlotErrors = Object.keys(slotIssues).length > 0;
  if (!generated.length && !hasSlotErrors) {
    yield { type: "error", message: lastError ?? "No se pudo generar ninguna imagen de estilo" };
    return;
  }

  const priorGenerated = gallery?.generated ?? [];
  const nextGenerated = generated.length
    ? mergeGeneratedForCategory(priorGenerated, input.category, generated, input.variantIndex)
    : priorGenerated;

  const priorStrip = gallery?.nodeFaceStripUrls?.filter((url) => Boolean(url?.trim())) ?? [];
  const freezeStrip =
    priorStrip.length > 0
      ? priorStrip.slice(0, 4)
      : nextGenerated
          .map((item) => item.previewUrl?.trim())
          .filter((url): url is string => Boolean(url))
          .slice(0, 4);

  const nextGallery: GalleryValue = {
    ...(gallery ?? { harvested: [], generated: [], stylePromptVersion: 0 }),
    harvested: gallery?.harvested ?? [],
    generated: nextGenerated,
    stylePromptVersion: input.stylePromptVersion,
    styleToneExplanation: toneExplanation,
    slotIssues: Object.keys(slotIssues).length ? slotIssues : undefined,
    ...(freezeStrip.length ? { nodeFaceStripUrls: freezeStrip } : {}),
  };

  const expectedTotal =
    input.variantIndex != null
      ? 1
      : input.category
        ? GALLERY_CATEGORY_SLOT_COUNT
        : BRAND_KIT_GALLERY_IMAGE_COUNT;

  yield {
    type: "done",
    gallery: nextGallery,
    addedCount: generated.length,
    partial: generated.length < expectedTotal || hasSlotErrors,
    stylePrompt,
  };
}

export function galleryGenerateActualCostUsd(
  count: number,
  category?: GalleryGenerateCategory,
): number {
  if (category) {
    return Math.max(estimateGalleryImageUnitUsd(category) * count, 0.01);
  }
  if (count >= BRAND_KIT_GALLERY_IMAGE_COUNT) {
    return Math.max(estimateGalleryGenerateCostUsd(BRAND_KIT_GALLERY_IMAGE_COUNT), 0.01);
  }
  const premiumUnit = estimateGalleryImageUnitUsd("people_mood");
  const standardUnit =
    (estimateGalleryImageUnitUsd("places") +
      estimateGalleryImageUnitUsd("objects") +
      estimateGalleryImageUnitUsd("textures")) /
    3;
  return Math.max(premiumUnit * Math.min(count, 4) + standardUnit * Math.max(0, count - 4), 0.01);
}

export { IMAGE_MODEL, BRAND_KIT_GALLERY_IMAGE_COUNT };
