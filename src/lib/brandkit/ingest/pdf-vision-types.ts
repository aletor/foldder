/**
 * Contrato JSON del pase de visión unificado por documento (BrandKit).
 */

import type { PdfPaletteRole } from "@/lib/brain/pdf-brand-extract";
import type { ImageCategory } from "../model/trait-ids";

export const BRAND_KIT_PDF_VISION_PASS_VERSION = "2026-07-06-unified-1";

export type BrandKitVisionLogoPolarity = "light_mark" | "dark_mark";

/** Bbox normalizado 0–1 respecto al ancho/alto de la página renderizada. */
export type BrandKitVisionNormalizedBbox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BrandKitVisionLogoHint = {
  page: number;
  bbox: BrandKitVisionNormalizedBbox;
  polarity: BrandKitVisionLogoPolarity;
  isEmitterLogo: boolean;
};

export type BrandKitVisionThirdPartyLogo = {
  page: number;
  bbox: BrandKitVisionNormalizedBbox;
  label?: string;
};

export type BrandKitVisionPaletteEntry = {
  role: PdfPaletteRole;
  approxHex: string;
  wherePresent?: string;
  /** false = color de foto/contenido, no de identidad */
  isBrandColor?: boolean;
  /** "photo" = tono de fotografía/retrato; excluir de paleta de marca */
  source?: "brand" | "photo";
};

export type BrandKitVisionTypographyHint = {
  primaryFamily?: string;
  secondaryFamily?: string;
  primaryWeights?: string[];
  secondaryWeights?: string[];
  primaryStyle?: string;
  secondaryStyle?: string;
  visibleInTitles?: boolean;
};

export type BrandKitVisionVisualEntry = {
  category: ImageCategory;
  description: string;
  imageRefIndex?: number;
};

export type BrandKitPdfVisionResult = {
  version: string;
  logo?: {
    emitter?: BrandKitVisionLogoHint;
    thirdParty?: BrandKitVisionThirdPartyLogo[];
  };
  palette: BrandKitVisionPaletteEntry[];
  typography?: BrandKitVisionTypographyHint;
  visual: BrandKitVisionVisualEntry[];
  confidence: number;
  provider: "gemini-vision" | "mock";
};

export function isVisionPaletteBrandEntry(entry: BrandKitVisionPaletteEntry): boolean {
  if (entry.isBrandColor === false) return false;
  if (entry.source === "photo") return false;
  return true;
}

export type BrandKitVisionPageImage = {
  mimeType: string;
  base64: string;
  pageNumber: number;
  width: number;
  height: number;
};
