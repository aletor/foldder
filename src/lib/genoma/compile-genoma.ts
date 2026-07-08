import type {
  CompiledArtifacts,
  EssenceValue,
  GalleryValue,
  GenomaDocument,
  LogoValue,
  PaletteValue,
  TypographyValue,
  VisualWorldValue,
  VoiceValue,
} from "./genoma-types";

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function slotValue<T>(doc: GenomaDocument, slotId: keyof GenomaDocument["slots"]): T | undefined {
  const slot = doc.slots[slotId];
  if (slot?.status !== "resolved" || slot.value === undefined) return undefined;
  return slot.value as T;
}

export function buildGenomaStylePrompt(doc: GenomaDocument, version = 0): string {
  const palette = slotValue<PaletteValue>(doc, "palette");
  const typography = slotValue<TypographyValue>(doc, "typography");
  const voice = slotValue<VoiceValue>(doc, "voice");
  const essence = slotValue<EssenceValue>(doc, "essence");
  const brand = doc.brandName?.value ?? "marca";

  const colors = palette?.colors?.slice(0, 5).map((c) => `${c.role}:${c.hex}`).join(", ") ?? "sin paleta";
  const fonts =
    typography?.families?.map((f) => `${f.role}=${f.family}`).join("; ") ?? "sans-serif neutra";
  const tone = voice?.summary?.trim() || voice?.descriptors?.join(", ") || "profesional";
  const rules = voice?.rules?.join("; ") ?? "";
  const valueLabels = essence?.beliefs?.map((belief) => belief.label).join(", ") ?? "";
  const claim = essence?.summary?.trim() || essence?.headline?.trim() || "";
  const visualWorld = slotValue<VisualWorldValue>(doc, "visualWorld");
  const visualSummary = visualWorld?.summary?.trim();
  const gallery = slotValue<GalleryValue>(doc, "gallery");
  const upExamples =
    gallery?.generated?.filter((g) => g.verdict === "up").map((g) => g.previewUrl ?? g.assetId).slice(0, 3) ?? [];
  const downExamples =
    gallery?.generated?.filter((g) => g.verdict === "down").map((g) => g.previewUrl ?? g.assetId).slice(0, 3) ?? [];

  return [
    `Brand editorial photo for ${brand}.`,
    `Palette: ${colors}.`,
    `Typography mood: ${fonts}.`,
    `Voice: ${tone}.`,
    rules ? `Copy rules: ${rules}.` : "",
    valueLabels ? `Values: ${valueLabels}.` : "",
    claim ? `Tagline context: ${claim}.` : "",
    visualSummary ? `Visual world: ${visualSummary}.` : "",
    upExamples.length ? `Prefer style like: ${upExamples.join(", ")}.` : "",
    downExamples.length ? `Avoid style like: ${downExamples.join(", ")}.` : "",
    `Prompt version ${version}. Photorealistic brand imagery, no text overlays, no logos.`,
  ]
    .filter(Boolean)
    .join(" ");
}

function buildCopyRules(doc: GenomaDocument): string {
  const voice = slotValue<VoiceValue>(doc, "voice");
  const essence = slotValue<EssenceValue>(doc, "essence");
  const parts: string[] = [];
  if (essence?.summary?.trim()) parts.push(essence.summary.trim());
  if (voice?.summary?.trim()) parts.push(voice.summary.trim());
  if (voice?.rules?.length) parts.push(voice.rules.join("\n"));
  const labels = essence?.beliefs?.map((belief) => belief.label).filter(Boolean).join(", ");
  if (labels) parts.push(labels);
  if (voice?.avoid?.length) parts.push(`Evitar: ${voice.avoid.join("; ")}`);
  return parts.filter(Boolean).join("\n");
}

export async function compileGenoma(
  doc: GenomaDocument,
): Promise<{ compiled: CompiledArtifacts; compiledHash: string }> {
  const palette = slotValue<PaletteValue>(doc, "palette");
  const typography = slotValue<TypographyValue>(doc, "typography");
  const voice = slotValue<VoiceValue>(doc, "voice");
  const essence = slotValue<EssenceValue>(doc, "essence");
  const visualWorld = slotValue<VisualWorldValue>(doc, "visualWorld");
  const visualSummary = visualWorld?.summary?.trim();
  const visualTraits = visualWorld?.visualTraits?.join(", ") ?? "";
  const logo = slotValue<LogoValue>(doc, "logo");
  const gallery = slotValue<GalleryValue>(doc, "gallery");
  const version = gallery?.stylePromptVersion ?? 0;

  const negativeItems = visualWorld?.limits ?? [];
  const negativePrompt = [
    "text overlay",
    "watermark",
    "distorted logo",
    "off-brand colors",
    ...negativeItems,
  ].join(", ");

  const compiled: CompiledArtifacts = {
    stylePrompt: buildGenomaStylePrompt(doc, version),
    negativePrompt,
    paletteTokens: {
      schema: "foldder.brand-tokens.v1",
      brand: doc.brandName?.value ?? null,
      colors: palette?.colors ?? [],
    },
    fontStack: {
      families: typography?.families ?? [],
    },
    copyRules: buildCopyRules(doc),
    logoPackManifest: logo
      ? {
          assetId: logo.assetId,
          previewUrl: logo.previewUrl,
          format: logo.format,
          variants: logo.variants,
        }
      : {},
  };

  const stablePayload = JSON.stringify({
    brand: doc.brandName?.value ?? null,
    palette: palette?.colors ?? [],
    typography: typography?.families ?? [],
    voice: voice?.summary ?? voice?.descriptors ?? [],
    essence: essence?.summary ?? essence?.beliefs ?? [],
    headline: essence?.headline ?? null,
    visualSummary: visualSummary ?? null,
    visualLimits: visualWorld?.limits ?? [],
    stylePromptVersion: version,
  });
  const compiledHash = await sha256Hex(stablePayload);

  return { compiled, compiledHash };
}
