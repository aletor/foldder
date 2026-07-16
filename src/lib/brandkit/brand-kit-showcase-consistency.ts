import { contrastRatio } from "./brand-theme-color";
import type { BrandKitDocument, PaletteValue, TypographyValue } from "./brand-kit-types";
import type { BrandKitCampaign } from "./brand-kit-campaign";

export type ShowcaseConsistencyInput = {
  logoUrl?: string;
  galleryImageUrl?: string;
  campaignHeadline?: string;
};

export type ShowcaseConsistencyResult = {
  score: number;
  issues: string[];
};

function slotHasValue(doc: BrandKitDocument, slotId: keyof BrandKitDocument["slots"]): boolean {
  return Boolean(doc.slots[slotId]?.value);
}

export function computeShowcaseConsistency(
  doc: BrandKitDocument,
  input: ShowcaseConsistencyInput,
  brandVars: Record<string, string> = {},
): ShowcaseConsistencyResult {
  const issues: string[] = [];
  let score = 0;

  if (input.logoUrl) score += 18;
  else issues.push("Logo no disponible en la pieza");

  if (input.galleryImageUrl) score += 22;
  else issues.push("Sin imagen de galería aprobada");

  if (input.campaignHeadline?.trim()) score += 16;
  else issues.push("Headline de campaña vacío");

  const palette = doc.slots.palette?.value as PaletteValue | undefined;
  const primary = palette?.colors?.find((color) => color.role === "primary")?.hex;
  const cssPrimary = brandVars["--brand-primary"];
  if (primary || cssPrimary) score += 14;
  else issues.push("Color primario no definido");

  const typography = doc.slots.typography?.value as TypographyValue | undefined;
  if (typography?.families?.length) score += 12;
  else issues.push("Tipografía no compilada en la pieza");

  const ctaBg = brandVars["--brand-cta-bg"] ?? cssPrimary ?? primary;
  const ctaInk = brandVars["--brand-cta-ink"] ?? "#FFFFFF";
  if (ctaBg && contrastRatio(ctaInk, ctaBg) >= 4.5) score += 10;
  else issues.push("Contraste insuficiente en CTA");

  if (slotHasValue(doc, "essence") || slotHasValue(doc, "voice")) score += 8;
  else issues.push("Falta esencia o voz para el copy");

  if (doc.slots.logo?.locked) score += 10;
  else issues.push("Logo sin confirmar");

  return {
    score: Math.min(100, Math.max(0, score)),
    issues,
  };
}
