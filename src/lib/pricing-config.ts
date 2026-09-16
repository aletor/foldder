/**
 * Tarifas orientativas USD (ajustables en un solo sitio).
 * `recordApiUsage` y rutas que fijan `costUsd` manualmente deben basarse aquí cuando aplique.
 */

import { openAiImageOutputPixels } from "@/lib/openai-image-size";
import { coerceOpenAiImageModelKey } from "@/lib/openai-image-model";

/** USD / 1M tokens — OpenAI chat (aprox.). */
export function openaiCostPerMillion(model: string | undefined): { in: number; out: number } {
  const m = (model || "").toLowerCase();
  if (m.includes("gpt-4o-mini")) return { in: 0.15, out: 0.6 };
  if (m.includes("gpt-4.1-nano") || m.includes("4.1-nano")) return { in: 0.1, out: 0.4 };
  if (m.includes("gpt-4o")) return { in: 2.5, out: 10 };
  if (m.includes("gpt-3.5")) return { in: 0.5, out: 1.5 };
  return { in: 0.15, out: 0.6 };
}

/** USD / 1M tokens — Gemini texto / multimodal (aprox.). */
export function geminiCostPerMillion(model: string | undefined): { in: number; out: number } {
  const m = (model || "").toLowerCase();
  if (m.includes("pro") || m.includes("3-pro") || m.includes("veo")) {
    return { in: 1.25, out: 5 };
  }
  if (m.includes("2.5-flash") || m.includes("flash")) {
    return { in: 0.075, out: 0.3 };
  }
  return { in: 0.1, out: 0.4 };
}

export function estimateOpenAIUsd(
  model: string | undefined,
  inputTokens: number,
  outputTokens: number
): number {
  const { in: pi, out: po } = openaiCostPerMillion(model);
  return (inputTokens * pi + outputTokens * po) / 1_000_000;
}

/** USD / 1M tokens — embeddings OpenAI (orientativo). */
export function estimateOpenAIEmbeddingUsd(model: string | undefined, totalTokens: number): number {
  const m = (model || "").toLowerCase();
  const perM = m.includes("embedding-3-large") ? 0.13 : m.includes("embedding-3-small") ? 0.02 : 0.02;
  return (totalTokens * perM) / 1_000_000;
}

export function estimateOpenAITranscriptionUsd(
  durationSeconds: number,
  options?: { usdPerMinute?: number },
): number {
  const seconds = Math.max(1, Math.ceil(durationSeconds));
  const usdPerMinute = options?.usdPerMinute && options.usdPerMinute > 0 ? options.usdPerMinute : 0.006;
  return Math.round((seconds / 60) * usdPerMinute * 1_000_000) / 1_000_000;
}

export function estimateGeminiUsd(
  model: string | undefined,
  inputTokens: number,
  outputTokens: number
): number {
  const { in: pi, out: po } = geminiCostPerMillion(model);
  return (inputTokens * pi + outputTokens * po) / 1_000_000;
}

function normalizeGeminiImageResolution(resolution: string | undefined): "0.5k" | "1k" | "2k" | "4k" {
  const r = (resolution || "").trim().toLowerCase();
  if (r === "0.5k" || r === "512" || r === "512px" || r === "0.5") return "0.5k";
  if (r === "1k" || r === "1024" || r === "1024px") return "1k";
  if (r === "4k" || r === "4096" || r === "4096px") return "4k";
  return "2k";
}

/** Coste por generación de imagen cuando no hay usageMetadata de tokens. */
export function estimateGeminiImageGenerationUsd(modelKey: string, resolution?: string): number {
  const m = (modelKey || "").trim().toLowerCase();
  if (m === "pro3" || m.includes("3-pro")) {
    switch (normalizeGeminiImageResolution(resolution)) {
      case "0.5k":
      case "1k":
        return 0.12;
      case "4k":
        return 0.24;
      case "2k":
      default:
        return 0.134;
    }
  }
  if (m === "flash25" || m.includes("2.5-flash-image")) return 0.02;

  if (m === "flash31" || m.includes("3.1-flash-image")) {
    switch (normalizeGeminiImageResolution(resolution)) {
      case "0.5k":
        return 0.045;
      case "1k":
        return 0.067;
      case "4k":
        return 0.151;
      case "2k":
      default:
        return 0.101;
    }
  }

  return 0.101;
}

export type OpenAiImageQuality = "low" | "medium" | "high" | "max";

/** USD / 1M tokens — Images 2.5 Flare y Sunburst (mismas tarifas). */
export const OPENAI_IMAGE_TEXT_INPUT_USD_PER_MILLION = 5;
export const OPENAI_IMAGE_INPUT_USD_PER_MILLION = 8;
export const OPENAI_IMAGE_OUTPUT_USD_PER_MILLION = 30;

/**
 * Tokens de salida del calculador oficial Images 2.5 a 1024×1024 (sep 2026).
 * El coste de wallet escala esos tokens por los píxeles reales vs 1024².
 */
export const OPENAI_IMAGE_OUTPUT_TOKENS_AT_1024: Record<OpenAiImageQuality, number> = {
  low: 196,
  medium: 439,
  high: 1756,
  max: 7024,
};

const OPENAI_IMAGE_REF_PIXELS = 1024 * 1024;

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * Calidad de ChatGPT Images. Si el cliente manda `quality`, esa gana.
 * Si falta, el default de estudio es Alta (`high`). `xhigh` no se expone.
 */
export function resolveOpenAiImageQuality(
  _resolutionInput?: string,
  qualityInput?: string,
): OpenAiImageQuality {
  const q = (qualityInput || "").trim().toLowerCase();
  if (q === "low" || q === "medium" || q === "high" || q === "max") return q;
  return "high";
}

export function openAiImageQualityLabel(quality: OpenAiImageQuality): string {
  if (quality === "max") return "Máxima";
  if (quality === "high") return "Alta";
  if (quality === "low") return "Baja";
  return "Media";
}

export function openAiImageModelLabel(modelInput?: string): string {
  return coerceOpenAiImageModelKey(modelInput) === "sunburst" ? "Sunburst" : "Flare";
}

export function openAiImageWalletLabel(args: {
  model?: string;
  quality: OpenAiImageQuality;
  variants?: number;
}): string {
  const variants = Math.min(3, Math.max(1, Math.round(args.variants ?? 1)));
  const base = `ChatGPT · ${openAiImageModelLabel(args.model)} · ${openAiImageQualityLabel(args.quality)}`;
  return variants > 1 ? `${base} ×${variants}` : base;
}

export type OpenAiImageUsageLike = {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: {
    image_tokens?: number;
    text_tokens?: number;
  };
};

/** Coste real si Images 2.5 devuelve `usage`; si no hay tokens, null. */
export function estimateOpenAiImageUsageUsd(usage: OpenAiImageUsageLike | null | undefined): number | null {
  if (!usage) return null;
  const textIn = Math.max(0, usage.input_tokens_details?.text_tokens ?? 0);
  const imageIn = Math.max(0, usage.input_tokens_details?.image_tokens ?? 0);
  const imageOut = Math.max(0, usage.output_tokens ?? 0);
  if (textIn <= 0 && imageIn <= 0 && imageOut <= 0) return null;
  const usd =
    (textIn * OPENAI_IMAGE_TEXT_INPUT_USD_PER_MILLION +
      imageIn * OPENAI_IMAGE_INPUT_USD_PER_MILLION +
      imageOut * OPENAI_IMAGE_OUTPUT_USD_PER_MILLION) /
    1_000_000;
  return roundUsd(usd);
}

/**
 * Preflight wallet / fallback si la API no manda usage.
 * Calculador oficial 1024×1024 × (píxeles de salida / 1024²). Flare y Sunburst igual.
 */
export function estimateOpenAiImageGenerationUsd(
  resolution?: string,
  quality: OpenAiImageQuality = "high",
  aspectRatio?: string,
): number {
  const tokensAt1024 = OPENAI_IMAGE_OUTPUT_TOKENS_AT_1024[quality] ?? OPENAI_IMAGE_OUTPUT_TOKENS_AT_1024.high;
  const pixels = openAiImageOutputPixels(aspectRatio, resolution);
  const tokens = tokensAt1024 * (pixels / OPENAI_IMAGE_REF_PIXELS);
  return roundUsd((tokens * OPENAI_IMAGE_OUTPUT_USD_PER_MILLION) / 1_000_000);
}

/** Veo: coste orientativo por segundo de salida (sin breakdown de tokens en la API). */
export const GEMINI_VEO_USD_PER_SECOND = 0.05;

/** Seedance (Ark): orientativo por segundo de salida (la API no devuelve coste detallado). */
export const SEEDANCE_USD_PER_SECOND = 0.04;

/** AWS Fargate Linux/x86 us-east-1, precio orientativo por segundo. */
export const AWS_FARGATE_US_EAST_1_VCPU_SECOND = 0.000011244;
export const AWS_FARGATE_US_EAST_1_GB_SECOND = 0.000001235;

/** AWS storage/logs orientativo para panel admin. */
export const AWS_S3_STANDARD_USD_PER_GB_MONTH = 0.023;
export const AWS_ECR_PRIVATE_STORAGE_USD_PER_GB_MONTH = 0.10;
export const AWS_CLOUDWATCH_LOGS_INGEST_USD_PER_GB = 0.50;
export const AWS_CLOUDWATCH_LOGS_STORAGE_USD_PER_GB_MONTH = 0.03;
export const AWS_CODEBUILD_GENERAL1_SMALL_USD_PER_MINUTE = 0.005;

/** Multiplicador por resolución Veo (720p < 1080p < 4K) para la estimación en UI. */
export function veoResolutionMultiplier(resolution: string | undefined): number {
  const r = (resolution || "1080p").toLowerCase();
  if (r.includes("4k")) return 1.85;
  if (r.includes("1080")) return 1.2;
  return 1;
}

/** Ligera variación por ratio Seedance en la estimación de UI. */
export function seedanceFormatMultiplier(videoFormat: string | undefined): number {
  const f = (videoFormat || "16:9").toLowerCase();
  if (f.includes("9:16")) return 1.08;
  if (f.includes("1:1")) return 1.05;
  return 1;
}

export function estimateGeminiVeoVideoUsd(durationSeconds: number): number {
  const d = Math.max(0, durationSeconds);
  return Math.round(d * GEMINI_VEO_USD_PER_SECOND * 1_000_000) / 1_000_000;
}

export function estimateSeedanceVideoUsd(durationSeconds: number): number {
  const d = Math.max(0, durationSeconds);
  return Math.round(d * SEEDANCE_USD_PER_SECOND * 1_000_000) / 1_000_000;
}

export function estimateAwsFargateUsd(args: {
  runtimeSeconds: number;
  vcpu: number;
  memoryGb: number;
}): number {
  const billedSeconds = Math.max(60, Math.ceil(args.runtimeSeconds));
  const cost =
    billedSeconds *
    (args.vcpu * AWS_FARGATE_US_EAST_1_VCPU_SECOND +
      args.memoryGb * AWS_FARGATE_US_EAST_1_GB_SECOND);
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export function estimateVideoEditorRenderReserveUsd(args: {
  durationSeconds: number;
  fps?: number;
  height?: number;
  width?: number;
}): number {
  const timelineSeconds = Math.max(1, Math.ceil(args.durationSeconds));
  const width = Math.max(1, args.width ?? 1920);
  const height = Math.max(1, args.height ?? 1080);
  const fps = Math.max(1, args.fps ?? 30);
  const pixelFactor = Math.max(1, (width * height) / (1920 * 1080));
  const fpsFactor = Math.max(1, fps / 30);
  const estimatedRuntimeSeconds = Math.max(
    180,
    Math.ceil(timelineSeconds * 3.5 * pixelFactor * fpsFactor + 60),
  );
  return estimateAwsFargateUsd({
    runtimeSeconds: estimatedRuntimeSeconds,
    vcpu: 2,
    memoryGb: 4,
  });
}

/** Estimación previa (UI) según modelo, resolución (Veo), ratio y duración. */
export function estimateVideoGeneratorPreviewUsd(args: {
  model: "veo31" | "seedance2";
  resolution: string | undefined;
  durationSec: number;
  videoFormat: string | undefined;
}): { usdPerSecond: number; totalUsd: number } {
  const d = Math.max(0, args.durationSec);
  if (args.model === "seedance2") {
    const rate =
      SEEDANCE_USD_PER_SECOND * seedanceFormatMultiplier(args.videoFormat);
    return {
      usdPerSecond: Math.round(rate * 1_000_000) / 1_000_000,
      totalUsd: Math.round(d * rate * 1_000_000) / 1_000_000,
    };
  }
  const rate = GEMINI_VEO_USD_PER_SECOND * veoResolutionMultiplier(args.resolution);
  return {
    usdPerSecond: Math.round(rate * 1_000_000) / 1_000_000,
    totalUsd: Math.round(d * rate * 1_000_000) / 1_000_000,
  };
}
