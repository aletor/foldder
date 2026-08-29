export type NanoBananaImageProvider = "gemini" | "openai";
export type NanoBananaResolution = "1k" | "2k" | "4k";
export type NanoBananaAspectRatio = "16:9" | "9:16" | "4:3" | "3:4" | "1:1";

export const NANO_BANANA_ASPECT_OPTIONS: readonly NanoBananaAspectRatio[] = [
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "1:1",
];

export const NANO_BANANA_RESOLUTION_OPTIONS: readonly NanoBananaResolution[] = ["1k", "2k", "4k"];

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
