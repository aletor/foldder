import { geminiImageGenerate, GeminiGenerateError } from "@/lib/gemini-image-generate";
import { openAiImageGenerate, OpenAiGenerateError } from "@/lib/openai-image-generate";
import { normalizeGenerativeImagePrompt } from "@/lib/normalize-generative-image-prompt";
import type { PopulateShareTemplateModel } from "@/lib/populate-share-types";

function normalizeResolution(r: string | undefined): "1k" | "2k" | "4k" {
  return r === "1k" || r === "2k" || r === "4k" ? r : "1k";
}

export type PopulateShareGenerateResult = {
  output: string;
  s3Key?: string;
};

/** Generación server-side para formularios públicos (factura al ownerEmail). */
export async function generatePopulateShareImage(args: {
  prompt: string;
  images: string[];
  model: PopulateShareTemplateModel;
  ownerEmail: string;
}): Promise<PopulateShareGenerateResult> {
  const { prompt, images, model, ownerEmail } = args;
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
  const usageOpts = {
    usageRoute: "/api/populate-share/generate",
    usageUserEmail: ownerEmail,
  };

  if (model.provider === "openai") {
    const result = await openAiImageGenerate(body, undefined, usageOpts);
    return { output: result.output, s3Key: result.key };
  }

  try {
    const result = await geminiImageGenerate(body, undefined, usageOpts);
    return { output: result.output, s3Key: typeof result.key === "string" ? result.key : undefined };
  } catch (error) {
    if (error instanceof GeminiGenerateError) throw error;
    throw error;
  }
}

export { GeminiGenerateError, OpenAiGenerateError };
