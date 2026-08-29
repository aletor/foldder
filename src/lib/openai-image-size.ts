function parseAspectRatioValue(value: string | null | undefined): { width: number; height: number } | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed === "free") return null;
  const parts = trimmed.split(/[:/]/).map((part) => Number(part.trim()));
  if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
  const [width, height] = parts;
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

function roundToMultiple(value: number, step: number): number {
  return Math.max(step, Math.round(value / step) * step);
}

function parseSizePixels(size: string): number {
  const [w, h] = size.split("x").map((part) => Number(part));
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 1;
  return w * h;
}

/** Resuelve `size` para gpt-image-2 respetando ratio y resolución del nodo. */
export function resolveOpenAiImageSize(aspectRatioInput?: string, resolutionInput?: string): string {
  const res = (resolutionInput || "").trim().toLowerCase();
  const tier = res === "1k" || res === "1024" || res === "1024px"
    ? "1k"
    : res === "4k" || res === "4096" || res === "4096px"
      ? "4k"
      : "2k";
  const ratio = parseAspectRatioValue(aspectRatioInput || "16:9") ?? { width: 16, height: 9 };
  const longEdge = tier === "4k" ? 3824 : tier === "2k" ? 2560 : 1536;
  const landscape = ratio.width >= ratio.height;
  if (landscape) {
    const width = longEdge;
    const height = roundToMultiple((longEdge * ratio.height) / ratio.width, 16);
    return `${width}x${height}`;
  }
  const height = longEdge;
  const width = roundToMultiple((longEdge * ratio.width) / ratio.height, 16);
  return `${width}x${height}`;
}

export function openAiImageSizePixelFactor(aspectRatioInput?: string, resolutionInput?: string): number {
  const actual = parseSizePixels(resolveOpenAiImageSize(aspectRatioInput || "16:9", resolutionInput));
  const reference = parseSizePixels(resolveOpenAiImageSize("16:9", resolutionInput));
  if (reference <= 0) return 1;
  return actual / reference;
}
