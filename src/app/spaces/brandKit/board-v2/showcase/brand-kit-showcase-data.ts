import type {
  EssenceValue,
  GalleryValue,
  BrandKitDocument,
  LogoValue,
  SlotState,
  SourceRef,
  VoiceValue,
} from "@/lib/brandkit/brand-kit-types";
import { deriveBrandKitCampaign, type BrandKitCampaign } from "@/lib/brandkit/brand-kit-campaign";
import { resolveShowcaseGalleryImage } from "@/lib/brandkit/brand-kit-gallery-image-state";
import {
  resolveShowcaseRequirements,
  showcaseRequirementsMet,
  type ShowcaseRequirement,
} from "@/lib/brandkit/brand-kit-showcase-requirements";

export const BRAND_KIT_SHOWCASE_CHAPTER_LABEL = "08 — APLICACIONES DE MARCA";

export type ShowcaseSurfaceMode = "light" | "dark";

export type BrandKitShowcaseData = {
  brandName: string;
  monogram: string;
  logoUrl?: string;
  headline?: string;
  tagline?: string;
  summary?: string;
  contactEmail?: string;
  galleryImageUrl?: string;
  ctaLabel: string;
  campaign: BrandKitCampaign;
  requirements: ShowcaseRequirement[];
  canRenderMockups: boolean;
};

function slotUsableValue<T>(slot: SlotState<unknown>, presentationMode: boolean): T | undefined {
  if (presentationMode && !slot.locked) return undefined;
  return slot.value as T | undefined;
}

function isPaletteResolved(doc: BrandKitDocument, presentationMode: boolean): boolean {
  const slot = doc.slots.palette;
  if (presentationMode) return slot.locked && Boolean(slot.value);
  return (slot.status === "resolved" || slot.locked) && Boolean(slot.value);
}

function hasLogoResolved(doc: BrandKitDocument, presentationMode: boolean): boolean {
  const logo = slotUsableValue<LogoValue>(doc.slots.logo, presentationMode);
  return Boolean(logo?.previewUrl?.trim());
}

function hasBrandName(doc: BrandKitDocument): boolean {
  return Boolean(doc.brandName?.value?.trim());
}

/** Mínimo para mostrar la sección de aplicaciones (puede ser checklist). */
export function shouldShowBrandKitApplications(doc: BrandKitDocument, presentationMode: boolean): boolean {
  if (!isPaletteResolved(doc, presentationMode)) return false;
  return hasLogoResolved(doc, presentationMode) || hasBrandName(doc);
}

/** @deprecated Usar shouldShowBrandKitApplications — alias de compatibilidad. */
export function shouldRenderBrandKitShowcase(doc: BrandKitDocument, presentationMode: boolean): boolean {
  return shouldShowBrandKitApplications(doc, presentationMode);
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

function firstGalleryImage(gallery: GalleryValue | undefined, galleryLocked: boolean): string | undefined {
  return resolveShowcaseGalleryImage(gallery, galleryLocked);
}

export function buildBrandKitShowcaseData(
  doc: BrandKitDocument,
  presentationMode: boolean,
): BrandKitShowcaseData | null {
  if (!shouldShowBrandKitApplications(doc, presentationMode)) return null;

  const brandName = doc.brandName?.value?.trim() ?? "Marca";
  const logo = slotUsableValue<LogoValue>(doc.slots.logo, presentationMode);
  const essence = slotUsableValue<EssenceValue>(doc.slots.essence, presentationMode);
  const voice = slotUsableValue<VoiceValue>(doc.slots.voice, presentationMode);
  const gallery = slotUsableValue<GalleryValue>(doc.slots.gallery, presentationMode);
  const campaign = deriveBrandKitCampaign(doc, presentationMode);
  const requirements = resolveShowcaseRequirements(doc, presentationMode);
  const canRenderMockups = showcaseRequirementsMet(requirements);

  return {
    brandName,
    monogram: brandName.charAt(0).toUpperCase() || "M",
    logoUrl: logo?.previewUrl?.trim(),
    headline: campaign.headline,
    tagline: campaign.subheadline || essence?.summary?.trim(),
    summary: essence?.summary?.trim(),
    contactEmail: contactEmailFromSources(doc.sources),
    galleryImageUrl: firstGalleryImage(gallery, Boolean(doc.slots.gallery?.locked)),
    ctaLabel: campaign.cta,
    campaign,
    requirements,
    canRenderMockups,
  };
}
