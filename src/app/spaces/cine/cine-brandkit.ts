import { normalizeBrandKitDocument } from "@/lib/brandkit/brand-kit-defaults";
import { buildBrandKitStylePrompt } from "@/lib/brandkit/compile-brand-kit";
import { galleryStyleReferenceUrls } from "@/lib/brandkit/brand-kit-gallery-generate-profile";
import type {
  BrandKitDocument,
  BrandKitNodeData,
  EssenceValue,
  GalleryValue,
  LogoValue,
  PaletteValue,
  VisualWorldValue,
  VoiceValue,
} from "@/lib/brandkit/brand-kit-types";
import type { CineMode } from "../cine-types";

const STYLE_IMAGE_LIMIT = 2;

const LOGO_FRIENDLY_MODES: ReadonlySet<CineMode> = new Set([
  "advertising",
  "product_video",
  "brand_story",
  "social_video",
]);

const LOGO_SCENE_RE =
  /\b(logo|logotipo|marca|branding|end\s*card|packshot|bumper|cierre\s+de\s+marca|identidad\s+visual|brand\s+mark)\b/i;

function coerceBrandKitRaw(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function trimList(items: string[], limit: number): string[] {
  return items
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, limit);
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

function beliefLabels(essence: EssenceValue | undefined): string[] {
  if (!essence?.beliefs?.length) return [];
  return essence.beliefs
    .map((belief) => belief.label?.trim())
    .filter((label): label is string => Boolean(label));
}

function paletteDirective(palette: PaletteValue | undefined): string {
  const colors = (palette?.colors ?? [])
    .map((color) => `${color.role} ${color.hex}`)
    .filter(Boolean)
    .slice(0, 5);
  if (!colors.length) return "";
  return [
    `BRAND PALETTE (apply unless the script/direction names different colors): ${colors.join(", ")}.`,
    "Use these colors in wardrobe accents, set dressing, gels, graphics and commercial environments so the piece reads on-brand.",
  ].join(" ");
}

function logoAnalyzeDirective(hasLogo: boolean, brandName: string): string {
  if (!hasLogo) {
    return "No BrandKit logo asset is available. Do not invent a logo mark; keep typography as overlay-only later.";
  }
  return [
    `A BrandKit logo exists for ${brandName || "the brand"}.`,
    "Plan logo placement only when the mode or script warrants it (spot end cards, packshots, brand bumpers, stadium/kit branding, product moments).",
    "For narrative short-film scenes without brand cues, do not force the logo into characters or every frame.",
    "When a logo moment is planned, note it in visualNotes / onScreenText planning (on-screen text stays overlay; the logo mark may appear in-camera only in those brand moments).",
  ].join(" ");
}

function logoFrameDirective(includeLogo: boolean): string {
  if (!includeLogo) {
    return "Do not render logos, trademarks or brand lettering in this frame. Atmosphere and palette may follow BrandKit; the mark stays out.";
  }
  return [
    "A BrandKit logo reference image is attached when available.",
    "Place that exact brand mark once where branding naturally belongs in this shot (end card, packshot, jersey badge, corner board, or subtle environmental branding).",
    "Do not invent a different logo, do not fill the frame with text, and do not invent other trademarks.",
  ].join(" ");
}

function styleImageUrls(
  gallery: GalleryValue | undefined,
  logoUrl: string | undefined,
  includeLogo: boolean,
): string[] {
  const urls: string[] = [];
  if (includeLogo && logoUrl) urls.push(logoUrl);
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

export type CineBrandPack = {
  connected: boolean;
  enabled: boolean;
  brandName: string;
  hasLogo: boolean;
  logoUrl?: string;
  /** Bloque para /api/spaces/cine/analyze (voz, esencia, mundo, paleta, logo). */
  analyzeBlock: string;
  /** Bloque visual para prompts de frames / personajes / fondos. */
  styleBlock: string;
  /** Refs de galería (sin forzar logo). */
  galleryImageUrls: string[];
  /** Refs incluyendo logo cuando hay asset. */
  logoFirstImageUrls: string[];
  hints: string[];
};

export function cineBrandFromBrandKitData(data: unknown): CineBrandPack {
  const row = (data && typeof data === "object" ? data : null) as BrandKitNodeData | null;
  const doc = normalizeBrandKitDocument(coerceBrandKitRaw(row?.brandKit)) as BrandKitDocument;
  const brandName = doc.brandName?.value?.trim() || "";
  const voice = doc.slots.voice?.status === "resolved" ? (doc.slots.voice.value as VoiceValue) : undefined;
  const essence = doc.slots.essence?.status === "resolved" ? (doc.slots.essence.value as EssenceValue) : undefined;
  const visual =
    doc.slots.visualWorld?.status === "resolved"
      ? (doc.slots.visualWorld.value as VisualWorldValue)
      : undefined;
  const gallery =
    doc.slots.gallery?.status === "resolved" ? (doc.slots.gallery.value as GalleryValue) : undefined;
  const palette = resolvedPalette(doc);
  const logoUrl = resolvedLogoUrl(doc);
  const styleBase = stripGalleryUrlSentences(buildBrandKitStylePrompt(doc));
  const limits = (visual?.limits ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 6);

  const tone = trimList([...(voice?.descriptors ?? []), ...(voice?.summary ? [voice.summary] : [])], 8);
  const claims = trimList([...(essence?.headline ? [essence.headline] : []), ...beliefLabels(essence)], 8);
  const avoid = trimList(voice?.avoid ?? [], 10);
  const rules = trimList(voice?.rules ?? [], 8);

  const analyzeBlock = [
    brandName ? `Brand: ${brandName}.` : "",
    essence?.summary?.trim() ? `Essence: ${essence.summary.trim()}.` : "",
    essence?.purpose?.trim() ? `Purpose: ${essence.purpose.trim()}.` : "",
    essence?.promise?.trim() ? `Promise: ${essence.promise.trim()}.` : "",
    claims.length ? `Approved claims / beliefs: ${claims.join("; ")}.` : "",
    tone.length ? `Voice tone: ${tone.join(", ")}.` : "",
    rules.length ? `Voice rules: ${rules.join("; ")}.` : "",
    avoid.length ? `Avoid in VO/dialogue tone: ${avoid.join("; ")}.` : "",
    visual?.summary?.trim() ? `Visual world: ${visual.summary.trim()}.` : "",
    (visual?.visualTraits ?? []).length
      ? `Visual traits: ${visual!.visualTraits!.slice(0, 8).join(", ")}.`
      : "",
    limits.length ? `Visual limits: ${limits.join("; ")}.` : "",
    paletteDirective(palette),
    logoAnalyzeDirective(Boolean(logoUrl), brandName),
    "The user script and explicit visualDirection win on conflicts. BrandKit conditions tone, character wardrobe accents, locations, VO voice and commercial brand moments.",
  ]
    .filter(Boolean)
    .join(" ");

  const styleBlock = [
    styleBase,
    paletteDirective(palette),
    limits.length ? `Visual limits: ${limits.join("; ")}.` : "",
    "Brand visual world and gallery references guide atmosphere and materials; follow the scene action from the script first.",
  ]
    .filter(Boolean)
    .join(" ");

  const useful = Boolean(
    brandName ||
      logoUrl ||
      palette?.colors?.length ||
      voice?.summary?.trim() ||
      voice?.descriptors?.length ||
      voice?.rules?.length ||
      essence?.summary?.trim() ||
      essence?.headline?.trim() ||
      essence?.purpose?.trim() ||
      visual?.summary?.trim() ||
      (visual?.visualTraits ?? []).length ||
      galleryStyleReferenceUrls(gallery, 1).length,
  );

  const hints: string[] = [];
  if (brandName) hints.push(brandName);
  if (tone.length) hints.push(`Voz: ${tone.slice(0, 3).join(", ")}`);
  if (essence?.summary) hints.push(`Esencia: ${essence.summary.slice(0, 80)}`);
  if (visual?.summary) hints.push(`Mundo: ${visual.summary.slice(0, 80)}`);
  if (palette?.colors?.length) hints.push(`Paleta: ${palette.colors.slice(0, 3).map((c) => c.hex).join(" ")}`);
  if (logoUrl) hints.push("Logo disponible");
  const galleryCount = styleImageUrls(gallery, undefined, false).length;
  if (galleryCount) hints.push(`Galería: ${galleryCount} ref${galleryCount === 1 ? "" : "s"}`);

  return {
    connected: true,
    enabled: useful,
    brandName,
    hasLogo: Boolean(logoUrl),
    logoUrl,
    analyzeBlock: useful ? analyzeBlock : "",
    styleBlock: useful ? styleBlock : "",
    galleryImageUrls: useful ? styleImageUrls(gallery, undefined, false) : [],
    logoFirstImageUrls: useful ? styleImageUrls(gallery, logoUrl, true) : [],
    hints: hints.slice(0, 7),
  };
}

/** Logo en frame cuando el modo es comercial o la escena pide marca. */
export function shouldIncludeCineBrandLogo(args: {
  mode?: CineMode;
  sceneText?: string;
}): boolean {
  if (args.mode && LOGO_FRIENDLY_MODES.has(args.mode)) return true;
  return LOGO_SCENE_RE.test(args.sceneText ?? "");
}

export function cineBrandStyleImageUrls(
  pack: CineBrandPack,
  includeLogo: boolean,
): string[] {
  if (!pack.enabled) return [];
  if (includeLogo && pack.hasLogo) return pack.logoFirstImageUrls;
  return pack.galleryImageUrls;
}

/** El guion / dirección del usuario va primero; BrandKit condiciona. */
export function mergeCineBrandStylePrompt(
  basePrompt: string,
  styleBlock: string,
  opts?: { includeLogo?: boolean },
): string {
  const base = basePrompt.trim();
  const style = styleBlock.trim();
  if (!style) return base;
  const logoLine = logoFrameDirective(Boolean(opts?.includeLogo));
  if (!base) {
    return ["BRAND STYLE", style, logoLine].join("\n");
  }
  const withoutHardLogoBan = opts?.includeLogo
    ? base
        .replace(
          /Do not render any written text, subtitles, captions, logos or typography inside the image\.[^\n]*/gi,
          "Do not render subtitles, captions or invented typography inside the image. On-screen text overlays are added later. The BrandKit logo mark may appear only as directed below.",
        )
        .replace(/No typography, logos, subtitles, watermarks or UI\./gi, "No subtitles, watermarks or UI. Logo only if BrandKit directs it below.")
    : base;
  return [
    withoutHardLogoBan,
    "",
    "BRAND STYLE (follow unless the scene/script conflicts; script wins on action and subject):",
    style,
    logoLine,
  ].join("\n");
}

export function appendCineBrandStyleImages(
  userImages: string[],
  styleUrls: string[],
  max: number,
): string[] {
  const out = userImages.filter(Boolean);
  for (const url of styleUrls) {
    if (out.length >= max) break;
    if (!url || out.includes(url)) continue;
    out.push(url);
  }
  return out.slice(0, max);
}

export const EMPTY_CINE_BRAND_PACK: CineBrandPack = {
  connected: false,
  enabled: false,
  brandName: "",
  hasLogo: false,
  analyzeBlock: "",
  styleBlock: "",
  galleryImageUrls: [],
  logoFirstImageUrls: [],
  hints: [],
};
