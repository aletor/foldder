"use client";

/**
 * Executor de Image Creation (nanoBanana) para tuberías de Loop.
 * Reusa exactamente el pipeline de generación de Loop/Image Creation (`generateLoopImage`).
 */

import { estimateGeminiImageGenerationUsd } from "@/lib/pricing-config";
import { generateLoopImage, type LoopImageProvider } from "../../loop-generate";
import {
  bindableVarsForNodeType,
  portText,
  type NodeExecutor,
  type PortInputs,
} from "../node-executor";
import { resolveMediaRefForApi } from "../resolve-media-ref-for-api";

const IMAGE_HANDLES = ["image", "image2", "image3", "image4"] as const;

function loopImageRefError(rowIndex: number, refIndex: number, handle: string): string {
  return (
    `Fila ${rowIndex + 1} · Ref ${refIndex} (${handle}): imagen inválida o vacía. ` +
    "Revisa la conexión, la columna del Dataset en esa fila o que el archivo esté subido."
  );
}

async function resolveLoopImageRefsForRow(inputs: PortInputs, rowIndex: number): Promise<string[]> {
  const images: string[] = [];
  let refIndex = 0;
  for (const handle of IMAGE_HANDLES) {
    const val = inputs.byHandle[handle];
    if (!val || val.kind !== "image" || !val.url?.trim()) continue;
    refIndex += 1;
    const resolved = await resolveMediaRefForApi({ url: val.url, s3Key: val.s3Key });
    if (!resolved) {
      throw new Error(loopImageRefError(rowIndex, refIndex, handle));
    }
    images.push(resolved);
  }
  return images;
}

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
    const images = await resolveLoopImageRefsForRow(inputs, ctx.rowIndex);

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
