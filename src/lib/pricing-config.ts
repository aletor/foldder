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

export function estimateGeminiUsd(
  model: string | undefined,
  inputTokens: number,
  outputTokens: number
): number {
  const { in: pi, out: po } = geminiCostPerMillion(model);
  return (inputTokens * pi + outputTokens * po) / 1_000_000;
}

/** Coste fijo por generación de imagen cuando no hay usageMetadata de tokens. */
export function estimateGeminiImageGenerationUsd(modelKey: string): number {
  switch (modelKey) {
    case "pro3":
      return 0.12;
    case "flash25":
      return 0.02;
    case "flash31":
    default:
      return 0.05;
  }
}

/** Veo: coste orientativo por segundo de salida (sin breakdown de tokens en la API). */
export const GEMINI_VEO_USD_PER_SECOND = 0.05;

export function estimateGeminiVeoVideoUsd(durationSeconds: number): number {
  const d = Math.max(0, durationSeconds);
  return Math.round(d * GEMINI_VEO_USD_PER_SECOND * 1_000_000) / 1_000_000;
}
