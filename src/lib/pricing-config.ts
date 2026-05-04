/**
 * Tarifas orientativas USD (ajustables en un solo sitio).
 * `recordApiUsage` y rutas que fijan `costUsd` manualmente deben basarse aquí cuando aplique.
 */

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
  if (m === "pro3" || m.includes("3-pro")) return 0.12;
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
