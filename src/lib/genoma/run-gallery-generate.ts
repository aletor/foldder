import { randomUUID } from "node:crypto";
import { compileGenoma } from "./compile-genoma";
import { buildGalleryToneExplanation } from "./genoma-gallery-tone";
import {
  GALLERY_GENERATE_PLAN,
  GENOMA_GALLERY_IMAGE_COUNT,
  type GalleryGeneratedItem,
} from "./genoma-gallery-plan";
import { GENOMA_GALLERY_PER_IMAGE_USD } from "./genoma-gallery-cost";
import type { GalleryValue, GenomaDocument } from "./genoma-types";
import { geminiImageGenerate } from "@/lib/gemini-image-generate";

const IMAGE_MODEL = "gemini-2.5-flash-image";

export type GenomaGalleryStreamEvent =
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

export async function* runGenomaGalleryGenerate(input: {
  genoma: GenomaDocument;
  stylePromptVersion: number;
  userEmail: string;
}): AsyncGenerator<GenomaGalleryStreamEvent> {
  const gallerySlot = input.genoma.slots.gallery;
  const gallery = gallerySlot?.value as GalleryValue | undefined;
  const docForPrompt = {
    ...input.genoma,
    slots: {
      ...input.genoma.slots,
      gallery: {
        ...gallerySlot,
        value: gallery
          ? { ...gallery, stylePromptVersion: input.stylePromptVersion }
          : { harvested: [], generated: [], stylePromptVersion: input.stylePromptVersion },
      },
    },
  } satisfies GenomaDocument;

  const { compiled } = await compileGenoma(docForPrompt);
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

  const generated: GalleryGeneratedItem[] = [];
  let lastError: string | undefined;

  for (let index = 0; index < GALLERY_GENERATE_PLAN.length; index += 1) {
    const slot = GALLERY_GENERATE_PLAN[index];
    yield {
      type: "progress",
      index: index + 1,
      total: GENOMA_GALLERY_IMAGE_COUNT,
      category: slot.category,
      categoryLabel: slot.categoryLabel,
      message: `Generando ${slot.categoryLabel} (${index + 1}/${GENOMA_GALLERY_IMAGE_COUNT})…`,
    };

    try {
      const result = await geminiImageGenerate(
        {
          prompt: `${stylePrompt} ${slot.promptSuffix}`,
          model: "flash25",
          aspect_ratio: "1:1",
          resolution: "1k",
        },
        undefined,
        {
          usageRoute: "/api/spaces/genoma/gallery/generate",
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
      console.error(`[genoma/gallery/generate] ${slot.category} ${index + 1}`, error);
    }
  }

  if (!generated.length) {
    yield { type: "error", message: lastError ?? "No se pudo generar ninguna imagen de estilo" };
    return;
  }

  const nextGallery: GalleryValue = {
    harvested: gallery?.harvested ?? [],
    generated: [...(gallery?.generated ?? []), ...generated],
    stylePromptVersion: input.stylePromptVersion,
    styleToneExplanation: toneExplanation,
  };

  yield {
    type: "done",
    gallery: nextGallery,
    addedCount: generated.length,
    partial: generated.length < GENOMA_GALLERY_IMAGE_COUNT,
    stylePrompt,
  };
}

export function galleryGenerateActualCostUsd(count: number): number {
  return Math.max(GENOMA_GALLERY_PER_IMAGE_USD * count, 0.01);
}

export { IMAGE_MODEL, GENOMA_GALLERY_IMAGE_COUNT };
