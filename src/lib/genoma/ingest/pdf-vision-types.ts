/**
 * Contrato JSON del pase de visión unificado por documento (Genoma).
 */

import type { PdfPaletteRole } from "@/lib/brain/pdf-brand-extract";
import type { ImageCategory } from "../model/trait-ids";

export const GENOMA_PDF_VISION_PASS_VERSION = "2026-07-06-unified-1";

export type GenomaVisionLogoPolarity = "light_mark" | "dark_mark";

/** Bbox normalizado 0–1 respecto al ancho/alto de la página renderizada. */
export type GenomaVisionNormalizedBbox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type GenomaVisionLogoHint = {
  page: number;
  bbox: GenomaVisionNormalizedBbox;
  polarity: GenomaVisionLogoPolarity;
  isEmitterLogo: boolean;
};

export type GenomaVisionThirdPartyLogo = {
  page: number;
  bbox: GenomaVisionNormalizedBbox;
  label?: string;
};

export type GenomaVisionPaletteEntry = {
  role: PdfPaletteRole;
  approxHex: string;
  wherePresent?: string;
  /** false = color de foto/contenido, no de identidad */
  isBrandColor?: boolean;
  /** "photo" = tono de fotografía/retrato; excluir de paleta de marca */
  source?: "brand" | "photo";
};

export type GenomaVisionTypographyHint = {
  primaryFamily?: string;
  secondaryFamily?: string;
  primaryWeights?: string[];
  secondaryWeights?: string[];
  primaryStyle?: string;
  secondaryStyle?: string;
  visibleInTitles?: boolean;
};

export type GenomaVisionVisualEntry = {
  category: ImageCategory;
  description: string;
  imageRefIndex?: number;
};

export type GenomaPdfVisionResult = {
  version: string;
  logo?: {
    emitter?: GenomaVisionLogoHint;
    thirdParty?: GenomaVisionThirdPartyLogo[];
  };
  palette: GenomaVisionPaletteEntry[];
  typography?: GenomaVisionTypographyHint;
  visual: GenomaVisionVisualEntry[];
  confidence: number;
  provider: "gemini-vision" | "mock";
};

export function isVisionPaletteBrandEntry(entry: GenomaVisionPaletteEntry): boolean {
  if (entry.isBrandColor === false) return false;
  if (entry.source === "photo") return false;
  return true;
}

export type GenomaVisionPageImage = {
  mimeType: string;
  base64: string;
  pageNumber: number;
  width: number;
  height: number;
};
