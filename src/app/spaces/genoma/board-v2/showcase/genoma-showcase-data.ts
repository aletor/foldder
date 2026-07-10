import type {
  EssenceValue,
  GalleryValue,
  GenomaDocument,
  LogoValue,
  SlotState,
  SourceRef,
  VoiceValue,
} from "@/lib/genoma/genoma-types";
import { galleryItemSourceUrl } from "@/lib/genoma/genoma-gallery-media";

export const GENOMA_SHOWCASE_CHAPTER_LABEL = "08 — LA MARCA EN ACCIÓN";

export type ShowcaseSurfaceMode = "light" | "dark";

export type GenomaShowcaseData = {
  brandName: string;
  monogram: string;
  logoUrl?: string;
  headline?: string;
  tagline?: string;
  summary?: string;
  contactEmail?: string;
  galleryImageUrl?: string;
  ctaLabel: string;
};

function slotUsableValue<T>(slot: SlotState<unknown>, presentationMode: boolean): T | undefined {
  if (presentationMode && !slot.locked) return undefined;
  return slot.value as T | undefined;
}

function isPaletteResolved(doc: GenomaDocument, presentationMode: boolean): boolean {
  const slot = doc.slots.palette;
  if (presentationMode) return slot.locked && Boolean(slot.value);
  return (slot.status === "resolved" || slot.locked) && Boolean(slot.value);
}

function hasLogoResolved(doc: GenomaDocument, presentationMode: boolean): boolean {
  const logo = slotUsableValue<LogoValue>(doc.slots.logo, presentationMode);
  return Boolean(logo?.previewUrl?.trim());
}

function hasBrandName(doc: GenomaDocument): boolean {
  return Boolean(doc.brandName?.value?.trim());
}

export function shouldRenderGenomaShowcase(doc: GenomaDocument, presentationMode: boolean): boolean {
  if (!isPaletteResolved(doc, presentationMode)) return false;
  return hasLogoResolved(doc, presentationMode) || hasBrandName(doc);
}

function contactEmailFromSources(sources: SourceRef[]): string | undefined {
  const urlSource = sources.find((source) => source.kind === "url" && source.ref.trim());
  if (!urlSource) return undefined;
  try {
    const raw = urlSource.ref.trim();
    const hostname = new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.replace(/^www\./i, "");
    if (!hostname || !hostname.includes(".")) return undefined;
    return `hola@${hostname}`;
  } catch {
    return undefined;
  }
}

function voiceActionLabel(voice?: VoiceValue): string {
  const descriptor = voice?.descriptors?.[0]?.trim();
  if (!descriptor) return "Descubrir más";
  if (descriptor.length <= 28) return descriptor;
  return "Descubrir más";
}

function firstGalleryImage(gallery?: GalleryValue): string | undefined {
  if (!gallery?.harvested?.length) return undefined;
  for (const item of gallery.harvested) {
    const url = galleryItemSourceUrl(item);
    if (url) return url;
  }
  return undefined;
}

export function buildGenomaShowcaseData(
  doc: GenomaDocument,
  presentationMode: boolean,
): GenomaShowcaseData | null {
  if (!shouldRenderGenomaShowcase(doc, presentationMode)) return null;

  const brandName = doc.brandName?.value?.trim() ?? "Marca";
  const logo = slotUsableValue<LogoValue>(doc.slots.logo, presentationMode);
  const essence = slotUsableValue<EssenceValue>(doc.slots.essence, presentationMode);
  const voice = slotUsableValue<VoiceValue>(doc.slots.voice, presentationMode);
  const gallery = slotUsableValue<GalleryValue>(doc.slots.gallery, presentationMode);

  const headline = essence?.headline?.trim();
  const tagline = headline || essence?.summary?.trim();

  return {
    brandName,
    monogram: brandName.charAt(0).toUpperCase() || "M",
    logoUrl: logo?.previewUrl?.trim(),
    headline,
    tagline,
    summary: essence?.summary?.trim(),
    contactEmail: contactEmailFromSources(doc.sources),
    galleryImageUrl: firstGalleryImage(gallery),
    ctaLabel: voiceActionLabel(voice),
  };
}
