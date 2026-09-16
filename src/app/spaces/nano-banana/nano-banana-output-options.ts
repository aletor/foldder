import { coerceOpenAiImageModelKey, OPENAI_IMAGE_API_MODELS } from "@/lib/openai-image-model";

export type NanoBananaImageProvider = "gemini" | "openai";
export type NanoBananaResolution = "1k" | "2k" | "4k";
export type NanoBananaAspectRatio = "16:9" | "9:16" | "4:3" | "3:4" | "1:1";
export type NanoBananaOpenAiModelKey = "flare" | "sunburst";
export type NanoBananaOpenAiQuality = "medium" | "high" | "max";

export const NANO_BANANA_ASPECT_OPTIONS: readonly NanoBananaAspectRatio[] = [
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "1:1",
];

export const NANO_BANANA_RESOLUTION_OPTIONS: readonly NanoBananaResolution[] = ["1k", "2k", "4k"];

export const NANO_BANANA_GEMINI_MODELS = [
  { key: "flash25", label: "Flash" },
  { key: "flash31", label: "3.1" },
  { key: "pro3", label: "Pro" },
] as const;

export const NANO_BANANA_OPENAI_MODELS = [
  { key: "flare", label: "Flare" },
  { key: "sunburst", label: "Sunburst" },
] as const;

export const NANO_BANANA_OPENAI_QUALITIES = [
  { key: "medium", label: "Media" },
  { key: "high", label: "Alta" },
  { key: "max", label: "Máxima" },
] as const;

/** IDs de Images 2.5. Flare es el default al migrar desde gpt-image-2. */
export { OPENAI_IMAGE_API_MODELS };

export function coerceNanoBananaOpenAiModelKey(value: unknown): NanoBananaOpenAiModelKey {
  return coerceOpenAiImageModelKey(value);
}

export { resolveOpenAiImageApiModel } from "@/lib/openai-image-model";

export function isNanoBananaOpenAiQuality(value: unknown): value is NanoBananaOpenAiQuality {
  return value === "medium" || value === "high" || value === "max";
}

export function nanoBananaOpenAiQualityLabel(quality: NanoBananaOpenAiQuality): string {
  if (quality === "max") return "Máxima";
  if (quality === "high") return "Alta";
  return "Media";
}

/** Calidad explícita del nodo. Si no hay, Alta (trabajo diario); Máxima es opt-in. */
export function coerceNanoBananaOpenAiQuality(quality: unknown): NanoBananaOpenAiQuality {
  if (isNanoBananaOpenAiQuality(quality)) return quality;
  return "high";
}

export function parseStoredNanoBananaOpenAiQuality(value: unknown): NanoBananaOpenAiQuality | undefined {
  return isNanoBananaOpenAiQuality(value) ? value : undefined;
}

export function nanoBananaModelLabel(modelKey: string, openai: boolean): string {
  if (openai) {
    const row = NANO_BANANA_OPENAI_MODELS.find((m) => m.key === coerceNanoBananaOpenAiModelKey(modelKey));
    return row?.label ?? "Flare";
  }
  const row = NANO_BANANA_GEMINI_MODELS.find((m) => m.key === modelKey);
  return row?.label ?? "3.1";
}

export function resolveNanoBananaImageProvider(value: unknown): NanoBananaImageProvider {
  return value === "openai" ? "openai" : "gemini";
}

export function normalizeNanoBananaResolution(value: string | undefined): NanoBananaResolution {
  if (value === "1k" || value === "2k" || value === "4k") return value;
  return "1k";
}

export function coerceNanoBananaAspect(value: string | undefined): NanoBananaAspectRatio {
  const raw = (value || "16:9").trim();
  if ((NANO_BANANA_ASPECT_OPTIONS as readonly string[]).includes(raw)) {
    return raw as NanoBananaAspectRatio;
  }
  const compact = raw.replace(/\s+/g, "").replace("/", ":");
  if ((NANO_BANANA_ASPECT_OPTIONS as readonly string[]).includes(compact)) {
    return compact as NanoBananaAspectRatio;
  }
  if (compact === "16:9" || compact === "1.78:1") return "16:9";
  if (compact === "9:16" || compact === "0.56:1") return "9:16";
  if (compact === "4:3") return "4:3";
  if (compact === "3:4") return "3:4";
  if (compact === "1:1" || compact === "square") return "1:1";
  return "16:9";
}

export function isNanoBananaResolutionEnabled(
  provider: NanoBananaImageProvider,
  modelKey: string,
  resolution: NanoBananaResolution,
): boolean {
  if (provider === "openai") return true;
  if ((modelKey || "flash31") === "flash25") return resolution === "1k";
  return true;
}

export function coerceNanoBananaResolution(
  provider: NanoBananaImageProvider,
  modelKey: string,
  resolution: string | undefined,
): NanoBananaResolution {
  const normalized = normalizeNanoBananaResolution(resolution);
  if (isNanoBananaResolutionEnabled(provider, modelKey, normalized)) return normalized;
  return "1k";
}

export function nanoBananaResolutionSelectOptions(
  provider: NanoBananaImageProvider,
  modelKey: string,
): Array<{ value: NanoBananaResolution; label: string; disabled: boolean }> {
  return NANO_BANANA_RESOLUTION_OPTIONS.map((value) => ({
    value,
    label: value.toUpperCase(),
    disabled: !isNanoBananaResolutionEnabled(provider, modelKey, value),
  }));
}

export function nanoBananaAspectSelectOptions(): Array<{
  value: NanoBananaAspectRatio;
  label: string;
}> {
  return NANO_BANANA_ASPECT_OPTIONS.map((value) => ({ value, label: value }));
}

/** Preset de UI más cercano a un lienzo en píxeles (el generate usa el ratio real, no este). */
export function nearestNanoBananaAspect(width: number, height: number): NanoBananaAspectRatio {
  const target = Math.max(1, width) / Math.max(1, height);
  let best: NanoBananaAspectRatio = "16:9";
  let bestDiff = Infinity;
  for (const ratio of NANO_BANANA_ASPECT_OPTIONS) {
    const [w, h] = ratio.split(":").map(Number);
    if (!w || !h) continue;
    const diff = Math.abs(w / h - target);
    if (diff < bestDiff) {
      best = ratio;
      bestDiff = diff;
    }
  }
  return best;
}
