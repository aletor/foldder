/** Snapshot de usageMetadata Gemini para métricas Nivel 1 (incl. thinking tokens). */

export type PageVisionGeminiUsageSnapshot = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  thoughtsTokenCount?: number;
  cachedContentTokenCount?: number;
  toolUsePromptTokenCount?: number;
  finishReason?: string;
  maxOutputTokens?: number;
};

export function snapshotGeminiUsageMetadata(
  response: unknown,
  options?: { maxOutputTokens?: number },
): PageVisionGeminiUsageSnapshot | undefined {
  const r = response as {
    usageMetadata?: PageVisionGeminiUsageSnapshot;
    candidates?: Array<{ finishReason?: string }>;
  };
  const usage = r?.usageMetadata;
  if (!usage || typeof usage !== "object") {
    const finishReason = r?.candidates?.[0]?.finishReason;
    if (!finishReason && options?.maxOutputTokens == null) return undefined;
    return {
      finishReason,
      maxOutputTokens: options?.maxOutputTokens,
    };
  }
  return {
    promptTokenCount: usage.promptTokenCount,
    candidatesTokenCount: usage.candidatesTokenCount,
    totalTokenCount: usage.totalTokenCount,
    thoughtsTokenCount: usage.thoughtsTokenCount,
    cachedContentTokenCount: usage.cachedContentTokenCount,
    toolUsePromptTokenCount: usage.toolUsePromptTokenCount,
    finishReason: r?.candidates?.[0]?.finishReason,
    maxOutputTokens: options?.maxOutputTokens,
  };
}
