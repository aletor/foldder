import { normalizeBrandKitDocument } from "@/lib/brandkit/brand-kit-defaults";
import { buildBrandKitStylePrompt } from "@/lib/brandkit/compile-brand-kit";
import { galleryStyleReferenceUrls } from "@/lib/brandkit/brand-kit-gallery-generate-profile";
import type {
  BrandKitDocument,
  BrandKitNodeData,
  GalleryValue,
  LogoValue,
  PaletteValue,
  VisualWorldValue,
} from "@/lib/brandkit/brand-kit-types";

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

function resolvedPalette(doc: BrandKitDocument): PaletteValue | undefined {
  const slot = doc.slots.palette;
  if (slot?.status === "resolved" && slot.value) return slot.value as PaletteValue;
  return undefined;
}

function resolvedLogoUrl(doc: BrandKitDocument): string | undefined {
  const slot = doc.slots.logo;
  if (slot?.status !== "resolved" || !slot.value) return undefined;
  const logo = slot.value as LogoValue;
  return (logo.previewUrl ?? logo.assetId)?.trim() || undefined;
}

function paletteDirective(palette: PaletteValue | undefined): string {
  const colors = (palette?.colors ?? [])
    .map((color) => `${color.role} ${color.hex}`)
    .filter(Boolean)
    .slice(0, 5);
  if (!colors.length) return "";
  return [
    `BRAND PALETTE (apply unless the user brief names different colors): ${colors.join(", ")}.`,
    "Use these brand colors on kits, accents, boards, lighting gels, and graphic elements so the image reads on-brand — not only ambient photographic color.",
  ].join(" ");
}

function logoDirective(hasLogoRef: boolean): string {
  if (!hasLogoRef) {
    return "Do not invent a logo. Typography mood only; no fake lettering unless the user brief asks for text.";
  }
  return [
    "A BrandKit logo reference image is attached.",
    "Place that exact brand mark once where sports branding naturally appears (jersey badge, corner board, or subtle stadium branding).",
    "Do not invent a different logo, do not fill the frame with text, and do not invent other trademarks.",
  ].join(" ");
}

function imageCreatorStyleImageUrls(
  gallery: GalleryValue | undefined,
  logoUrl: string | undefined,
): string[] {
  const urls: string[] = [];
  if (logoUrl) urls.push(logoUrl);
  const galleryLimit = Math.max(0, STYLE_IMAGE_LIMIT - urls.length);
  for (const url of galleryStyleReferenceUrls(gallery, galleryLimit)) {
    if (!urls.includes(url)) urls.push(url);
  }
  if (urls.length >= STYLE_IMAGE_LIMIT) return urls.slice(0, STYLE_IMAGE_LIMIT);
  for (const item of gallery?.generated ?? []) {
    if (item.verdict === "down") continue;
    const url = (item.previewUrl ?? item.assetId)?.trim();
    if (!url || urls.includes(url)) continue;
    urls.push(url);
    if (urls.length >= STYLE_IMAGE_LIMIT) break;
  }
  return urls.slice(0, STYLE_IMAGE_LIMIT);
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
  const logoUrl = resolvedLogoUrl(doc);
  const palette = resolvedPalette(doc);
  const styleBlock = [
    style,
    paletteDirective(palette),
    logoDirective(Boolean(logoUrl)),
    limits.length ? `Visual limits: ${limits.join("; ")}.` : "",
    "Visual world and gallery references guide atmosphere and materials; brand palette and logo mark must still read as this brand.",
  ]
    .filter(Boolean)
    .join(" ");

  const useful = style.length > 24 || Boolean(palette?.colors?.length) || Boolean(logoUrl);
  return {
    connected: useful,
    styleBlock: useful ? styleBlock : "",
    styleImageUrls: useful ? imageCreatorStyleImageUrls(gallery, logoUrl) : [],
  };
}

/** El brief del usuario va primero y gana si choca con la marca. */
export function mergeImageCreatorPrompt(userPrompt: string, styleBlock: string): string {
  const user = userPrompt.trim();
  const style = styleBlock.trim();
  if (!style) return user;
  if (!user) {
    return ["BRAND STYLE", style].join("\n");
  }
  return [
    "USER BRIEF (authoritative for subject, action, and any colors/logo instructions it states):",
    user,
    "",
    "If the brief conflicts with brand style on subject or action, follow the brief. If the brief does not specify colors or logo treatment, apply the BrandKit palette and logo mark from BRAND STYLE.",
    "",
    "BRAND STYLE:",
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
