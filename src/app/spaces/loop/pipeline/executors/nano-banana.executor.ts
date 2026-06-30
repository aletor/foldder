"use client";

/**
 * Executor de Image Creation (nanoBanana) para tuberías de Loop.
 * Reusa exactamente el pipeline de generación de Loop/Image Creation (`generateLoopImage`).
 */

import { estimateGeminiImageGenerationUsd } from "@/lib/pricing-config";
import { generateLoopImage, type LoopImageProvider } from "../../loop-generate";
import {
  bindableVarsForNodeType,
  collectImageRefs,
  portText,
  type NodeExecutor,
} from "../node-executor";
import { resolveMediaRefsForApi } from "../resolve-media-ref-for-api";

const IMAGE_HANDLES = ["image", "image2", "image3", "image4"];

function provider(data: Record<string, unknown>): LoopImageProvider {
  return data.imageProvider === "openai" ? "openai" : "gemini";
}

export const nanoBananaExecutor: NodeExecutor = {
  type: "nanoBanana",
  mode: "input-binding",

  getBindableVariables(node) {
    return bindableVarsForNodeType(node.type);
  },

  async execute({ node, inputs, overrides, ctx }) {
    const data = node.data ?? {};
    const prompt = String(
      overrides.prompt ?? data.promptText ?? portText(inputs, "prompt") ?? "",
    ).trim();
    const imageRefs = collectImageRefs(inputs, IMAGE_HANDLES);
    const images = await resolveMediaRefsForApi(imageRefs);
    if (imageRefs.length > 0 && images.length === 0) {
      throw new Error(
        "No se pudo leer la imagen de referencia. Si es una vista previa local, espera a que termine de subir o reconecta el Media Input.",
      );
    }

    const result = await generateLoopImage({
      prompt,
      images,
      model: {
        modelKey: String(data.modelKey ?? "flash31"),
        aspectRatio: String(data.aspect_ratio ?? "16:9"),
        resolution: String(data.resolution ?? "2k"),
        thinking: !!data.thinking,
        provider: provider(data),
      },
      onProgress: ctx.onProgress,
    });

    return { kind: "image", url: result.output, s3Key: result.s3Key };
  },

  estimateCost({ node }) {
    const data = node.data ?? {};
    const costUsd = estimateGeminiImageGenerationUsd(
      String(data.modelKey ?? "flash31"),
      String(data.resolution ?? "2k"),
    );
    return { costUsd, label: "Generar imagen" };
  },
};
