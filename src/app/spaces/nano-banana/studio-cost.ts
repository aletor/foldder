import {
  estimateGeminiImageGenerationUsd,
  estimateOpenAiImageGenerationUsd,
  resolveOpenAiImageQuality,
} from "@/lib/pricing-config";
import { shouldRunAnalyzeAreas } from "./studio-generate-payload";
import type { StudioCard } from "./studio-types";
import type { NanoBananaImageProvider } from "./nano-banana-output-options";

export const ANALYZE_AREAS_USD = 0.02;

export type StudioCostBreakdown = {
  generateUsd: number;
  analyzeUsd: number;
  variantCount: number;
  totalUsd: number;
};

export function clampStudioVariantCount(value: unknown): 1 | 2 | 3 {
  const n = Math.round(Number(value));
  if (n >= 3) return 3;
  if (n === 2) return 2;
  return 1;
}

export function estimateStudioGenerateUsd(args: {
  provider: NanoBananaImageProvider;
  modelKey: string;
  resolution: string;
  aspectRatio: string;
  quality?: string;
}): number {
  if (args.provider === "openai") {
    return estimateOpenAiImageGenerationUsd(
      args.resolution,
      resolveOpenAiImageQuality(args.resolution, args.quality),
      args.aspectRatio,
    );
  }
  return estimateGeminiImageGenerationUsd(args.modelKey, args.resolution);
}

export function estimateStudioJobUsd(args: {
  provider: NanoBananaImageProvider;
  modelKey: string;
  resolution: string;
  aspectRatio: string;
  cards: StudioCard[];
  hasBaseImage: boolean;
  variantCount?: number;
  quality?: string;
}): StudioCostBreakdown {
  const variantCount = clampStudioVariantCount(args.variantCount);
  const generateUsd = estimateStudioGenerateUsd(args);
  const analyzeUsd =
    args.hasBaseImage && shouldRunAnalyzeAreas(args.cards) ? ANALYZE_AREAS_USD : 0;
  const totalUsd = Math.round((generateUsd * variantCount + analyzeUsd) * 1_000_000) / 1_000_000;
  return { generateUsd, analyzeUsd, variantCount, totalUsd };
}

export function formatStudioUsd(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return "0 $";
  return `~${usd.toFixed(2).replace(".", ",")} $`;
}
