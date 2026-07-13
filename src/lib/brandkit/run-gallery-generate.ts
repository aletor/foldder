import { compileBrandKit } from "./compile-brand-kit";
import { buildGalleryToneExplanation } from "./brand-kit-gallery-tone";
import {
  GALLERY_GENERATE_PLAN,
  BRAND_KIT_GALLERY_IMAGE_COUNT,
  GALLERY_CATEGORY_SLOT_COUNT,
  slotsForCategory,
  type GalleryGenerateCategory,
  type GalleryGeneratedItem,
} from "./brand-kit-gallery-plan";
import { promptHintForGalleryCategory } from "./brand-kit-gallery-brief";
import { buildGalleryImagePrompt } from "./brand-kit-gallery-category-guidance";
import { BRAND_KIT_GALLERY_PER_IMAGE_USD } from "./brand-kit-gallery-cost";
import type { GalleryValue, BrandKitDocument } from "./brand-kit-types";
import { geminiImageGenerate } from "@/lib/gemini-image-generate";

const IMAGE_MODEL = "gemini-2.5-flash-image";

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
};

function resolveGeneratePlan(category?: GalleryGenerateCategory) {
  if (category) return slotsForCategory(category);
  return GALLERY_GENERATE_PLAN;
}

function mergeGeneratedForCategory(
  existing: GalleryGeneratedItem[],
  category: GalleryGenerateCategory | undefined,
  incoming: GalleryGeneratedItem[],
): GalleryGeneratedItem[] {
  if (!category) return [...existing, ...incoming];
  const kept = existing.filter((item) => (item.category ?? "general") !== category);
  return [...kept, ...incoming];
}

export async function* runBrandKitGalleryGenerate(input: {
  brandKit: BrandKitDocument;
  stylePromptVersion: number;
  userEmail: string;
  category?: GalleryGenerateCategory;
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

  const plan = resolveGeneratePlan(input.category);
  const total = plan.length;
  const generated: GalleryGeneratedItem[] = [];
  let lastError: string | undefined;

  for (let index = 0; index < plan.length; index += 1) {
    const slot = plan[index];
    yield {
      type: "progress",
      index: index + 1,
      total,
      category: slot.category,
      categoryLabel: slot.categoryLabel,
      message: `Generando ${slot.categoryLabel} (${index + 1}/${total})…`,
    };

    try {
      const promptSuffix = promptHintForGalleryCategory(gallery, slot.category, slot.promptSuffix);
      const prompt = buildGalleryImagePrompt(slot.category, stylePrompt, promptSuffix, docForPrompt);
      const result = await geminiImageGenerate(
        {
          prompt,
          model: "flash25",
          aspect_ratio: "1:1",
          resolution: "1k",
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
      };
      generated.push(item);
      yield { type: "image_done", index: index + 1, item };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Error generando imagen";
      console.error(`[brandKit/gallery/generate] ${slot.category} ${index + 1}`, error);
    }
  }

  if (!generated.length) {
    yield { type: "error", message: lastError ?? "No se pudo generar ninguna imagen de estilo" };
    return;
  }

  const priorGenerated = gallery?.generated ?? [];
  const nextGenerated = mergeGeneratedForCategory(priorGenerated, input.category, generated);

  const nextGallery: GalleryValue = {
    ...(gallery ?? { harvested: [], generated: [], stylePromptVersion: 0 }),
    harvested: gallery?.harvested ?? [],
    generated: nextGenerated,
    stylePromptVersion: input.stylePromptVersion,
    styleToneExplanation: toneExplanation,
  };

  const expectedTotal = input.category ? GALLERY_CATEGORY_SLOT_COUNT : BRAND_KIT_GALLERY_IMAGE_COUNT;

  yield {
    type: "done",
    gallery: nextGallery,
    addedCount: generated.length,
    partial: generated.length < expectedTotal,
    stylePrompt,
  };
}

export function galleryGenerateActualCostUsd(count: number): number {
  return Math.max(BRAND_KIT_GALLERY_PER_IMAGE_USD * count, 0.01);
}

export { IMAGE_MODEL, BRAND_KIT_GALLERY_IMAGE_COUNT };
