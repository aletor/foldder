import type { ProjectAssetsMetadata } from "@/app/spaces/project-assets-metadata";
import type { BrainVisualCollageInventoryRow } from "@/lib/brain/brain-visual-dna-collage";
import { aggregateVisualPatterns } from "@/lib/brain/brain-visual-analysis";
import type { VisualDnaSlot } from "./types";
import {
  buildVisualDnaSlotGeminiRequestBody,
  buildVisualDnaSlotMosaicPayload,
} from "./mosaic-payload";

export type GenerateVisualDnaSlotMosaicParams = {
  slot: VisualDnaSlot;
  sourceImageId?: string;
  sourceDocumentId?: string;
  sourceImageUrl?: string;
  row: BrainVisualCollageInventoryRow;
  assets: ProjectAssetsMetadata;
  /** Debe invocar la misma API que el tablero global (p. ej. geminiGenerateWithServerProgress). */
  generateImage: (body: Record<string, unknown>) => Promise<{ output?: string }>;
};

export type GenerateVisualDnaSlotMosaicResult =
  | {
      ok: true;
      imageUrl: string;
      mosaicPrompt: string;
      safeRulesDigest: string[];
      diagnostics: {
        mode: "visual_dna_slot";
        slotId: string;
        imageCount: number;
        safeRulesCount: number;
        brainContextChars: number;
      };
    }
  | { ok: false; error: string };

/**
 * Ejecuta la generación del mosaico ADN para un slot concreto (sin mutar `assets`).
 */
export async function generateVisualDnaSlotMosaic(
  params: GenerateVisualDnaSlotMosaicParams,
): Promise<GenerateVisualDnaSlotMosaicResult> {
  const aggregated = aggregateVisualPatterns(params.assets.strategy.visualReferenceAnalysis?.analyses ?? []);
  const { prompt, images, safeRulesDigest, brainContextSnippet } = buildVisualDnaSlotMosaicPayload({
    slotId: params.slot.id,
    sourceDocumentId: params.sourceDocumentId ?? params.slot.sourceDocumentId,
    row: params.row,
    aggregated,
    safeCreativeRules: params.assets.strategy.safeCreativeRules,
    corporateContext: params.assets.knowledge.corporateContext ?? "",
  });

  const body = buildVisualDnaSlotGeminiRequestBody({ prompt, images });

  try {
    const json = await params.generateImage(body);
    const out = json.output?.trim();
    if (!out) return { ok: false, error: "Salida vacía del generador" };
    return {
      ok: true,
      imageUrl: out,
      mosaicPrompt: prompt,
      safeRulesDigest,
      diagnostics: {
        mode: "visual_dna_slot",
        slotId: params.slot.id,
        imageCount: images.length,
        safeRulesCount: safeRulesDigest.length,
        brainContextChars: brainContextSnippet.length,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export function applyMosaicSuccessToSlot(
  slot: VisualDnaSlot,
  input: {
    imageUrl: string;
    mosaicPrompt: string;
    diagnostics?: unknown;
    safeRulesDigest: string[];
  },
): VisualDnaSlot {
  const now = new Date().toISOString();
  return {
    ...slot,
    status: "ready",
    updatedAt: now,
    lastError: undefined,
    mosaic: {
      ...slot.mosaic,
      imageUrl: input.imageUrl,
      provider: "nano_banana",
      prompt: input.mosaicPrompt,
      diagnostics: input.diagnostics,
    },
    lastGenerationPrompts: {
      mosaicUserPrompt: input.mosaicPrompt,
      safeRulesDigest: input.safeRulesDigest,
    },
  };
}

export function applyMosaicFailureToSlot(slot: VisualDnaSlot, error: string): VisualDnaSlot {
  const now = new Date().toISOString();
  return {
    ...slot,
    status: "failed",
    updatedAt: now,
    lastError: error.slice(0, 2000),
    mosaic: {
      ...slot.mosaic,
      diagnostics: { error: error.slice(0, 500) },
    },
  };
}
