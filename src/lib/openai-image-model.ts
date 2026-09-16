export const OPENAI_IMAGE_API_MODELS = {
  flare: "gpt-image-2.5-flare",
  sunburst: "gpt-image-2.5-sunburst",
} as const;

export type OpenAiImageModelKey = keyof typeof OPENAI_IMAGE_API_MODELS;

/** Default Images 2.5 (Flare), sucesor de gpt-image-2. */
export const OPENAI_IMAGE_MODEL = OPENAI_IMAGE_API_MODELS.flare;

export function coerceOpenAiImageModelKey(value: unknown): OpenAiImageModelKey {
  const m = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (m === "sunburst" || m === OPENAI_IMAGE_API_MODELS.sunburst) return "sunburst";
  return "flare";
}

export function resolveOpenAiImageApiModel(modelInput?: string): string {
  return OPENAI_IMAGE_API_MODELS[coerceOpenAiImageModelKey(modelInput)];
}
