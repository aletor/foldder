"use client";

/**
 * Loop — generación de imagen por fila.
 *
 * Reutiliza el MISMO pipeline que Image Creation (mismos clientes de stream y la
 * misma normalización de prompt). Lo único que cambia es que el prompt y las
 * referencias ya vienen resueltos por fila (no del snapshot del grafo).
 */

import { geminiGenerateWithServerProgress } from "@/lib/gemini-generate-stream-client";
import { openaiGenerateWithServerProgress } from "@/lib/openai-generate-stream-client";
import { normalizeGenerativeImagePrompt } from "@/lib/normalize-generative-image-prompt";

export type LoopImageProvider = "gemini" | "openai";

export interface LoopTemplateModel {
  modelKey: string;
  aspectRatio: string;
  resolution?: string;
  thinking?: boolean;
  provider?: LoopImageProvider;
}

function normalizeResolution(r: string | undefined): "1k" | "2k" | "4k" {
  return r === "1k" || r === "2k" || r === "4k" ? r : "1k";
}

export interface LoopGenerateResult {
  output: string;
  s3Key?: string;
}

export async function generateLoopImage(args: {
  prompt: string;
  images: string[];
  model: LoopTemplateModel;
  onProgress?: (pct: number) => void;
}): Promise<LoopGenerateResult> {
  const { prompt, images, model } = args;
  const isFlash25 = model.modelKey === "flash25";
  const isPro = model.modelKey === "pro3";
  const normalizedPrompt = normalizeGenerativeImagePrompt(prompt, {
    targetAspectRatio: model.aspectRatio || "16:9",
    textOnlyRecreation: images.length === 0,
  });
  const body = {
    prompt: normalizedPrompt,
    images,
    aspect_ratio: model.aspectRatio || "16:9",
    resolution: isFlash25 ? "1k" : normalizeResolution(model.resolution),
    model: model.modelKey || "flash31",
    thinking: !!model.thinking && isPro,
  };
  const onProgress = (pct: number) => args.onProgress?.(pct);
  const json =
    model.provider === "openai"
      ? await openaiGenerateWithServerProgress(body, onProgress)
      : await geminiGenerateWithServerProgress(body, onProgress);
  return { output: json.output, s3Key: typeof json.key === "string" ? json.key : undefined };
}
