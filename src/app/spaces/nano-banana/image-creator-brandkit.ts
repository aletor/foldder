import { normalizeBrandKitDocument } from "@/lib/brandkit/brand-kit-defaults";
import { buildBrandKitStylePrompt } from "@/lib/brandkit/compile-brand-kit";
import { galleryStyleReferenceUrls } from "@/lib/brandkit/brand-kit-gallery-generate-profile";
import type { BrandKitDocument, BrandKitNodeData, GalleryValue, VisualWorldValue } from "@/lib/brandkit/brand-kit-types";

const STYLE_IMAGE_LIMIT = 2;

function coerceBrandKitRaw(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function stripGalleryUrlSentences(prompt: string): string {
  return prompt
    .replace(/\s*Prefer style like: [^.]+\./g, "")
    .replace(/\s*Avoid style like: [^.]+\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function imageCreatorStyleImageUrls(gallery: GalleryValue | undefined): string[] {
  const harvested = galleryStyleReferenceUrls(gallery, STYLE_IMAGE_LIMIT);
  if (harvested.length >= STYLE_IMAGE_LIMIT) return harvested;
  const extra: string[] = [];
  for (const item of gallery?.generated ?? []) {
    if (item.verdict === "down") continue;
    const url = (item.previewUrl ?? item.assetId)?.trim();
    if (!url || harvested.includes(url) || extra.includes(url)) continue;
    extra.push(url);
    if (harvested.length + extra.length >= STYLE_IMAGE_LIMIT) break;
  }
  return [...harvested, ...extra];
}

export type ImageCreatorBrandPack = {
  connected: boolean;
  styleBlock: string;
  styleImageUrls: string[];
};

export function imageCreatorBrandFromBrandKitData(data: unknown): ImageCreatorBrandPack {
  const row = (data && typeof data === "object" ? data : null) as BrandKitNodeData | null;
  const doc = normalizeBrandKitDocument(coerceBrandKitRaw(row?.brandKit)) as BrandKitDocument;
  const style = stripGalleryUrlSentences(buildBrandKitStylePrompt(doc));
  const visual = doc.slots.visualWorld?.status === "resolved" ? (doc.slots.visualWorld.value as VisualWorldValue) : undefined;
  const limits = (visual?.limits ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 6);
  const gallery = doc.slots.gallery?.status === "resolved" ? (doc.slots.gallery.value as GalleryValue) : undefined;
  const styleBlock = [
    style,
    limits.length ? `Visual limits: ${limits.join("; ")}.` : "",
    "Palette, visual world, and typography mood come from the connected BrandKit.",
    "Typography describes graphic character only. Do not draw words, logos, or lettering unless the user brief explicitly asks for text.",
  ]
    .filter(Boolean)
    .join(" ");

  const useful = style.length > 24;
  return {
    connected: useful,
    styleBlock: useful ? styleBlock : "",
    styleImageUrls: useful ? imageCreatorStyleImageUrls(gallery) : [],
  };
}

/** El brief del usuario va primero y gana si choca con la marca. */
export function mergeImageCreatorPrompt(userPrompt: string, styleBlock: string): string {
  const user = userPrompt.trim();
  const style = styleBlock.trim();
  if (!style) return user;
  if (!user) {
    return [
      "BRAND STYLE",
      style,
      "Do not render words, logos, or lettering.",
    ].join("\n");
  }
  return [
    "USER BRIEF (authoritative — if this conflicts with brand style, follow this brief):",
    user,
    "",
    "The user brief wins on subject, medium, palette, mood, composition, and typography. Brand style only fills what the brief does not specify.",
    "",
    "BRAND STYLE (supporting):",
    style,
  ].join("\n");
}

/** Las imágenes del usuario ocupan los primeros huecos; el estilo de marca usa los que queden. */
export function appendBrandStyleImages(userImages: string[], styleUrls: string[], max: number): string[] {
  const out = userImages.filter(Boolean);
  for (const url of styleUrls) {
    if (out.length >= max) break;
    if (!url || out.includes(url)) continue;
    out.push(url);
  }
  return out.slice(0, max);
}
