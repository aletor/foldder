/**
 * Espécimen tipográfico: Google Fonts, embebido (evidencia) o subida woff2.
 */

import {
  GOOGLE_FONTS_LIBRARY,
  googleFontStylesheetHref,
} from "@/app/spaces/freehand/google-fonts";
import type { TypographyValue } from "../model/trait-values";

export const GOOGLE_FONTS_OFL_LICENSE = "SIL Open Font License · Google Fonts";
export const EMBEDDED_SPECIMEN_LICENSE = "Fuente embebida en documento de marca";
export const IDENTIFIED_ONLY_SPECIMEN_LICENSE =
  "identificada en documento de marca — binario no disponible, espécimen renderizado con sustituta";
export const UPLOAD_SPECIMEN_LICENSE_SUFFIX = "uso de marca · archivo subido";

export function canonicalGoogleFontFamily(family: string): string | null {
  const norm = family.trim().toLowerCase();
  const match = GOOGLE_FONTS_LIBRARY.find((g) => g.family.toLowerCase() === norm);
  return match?.family ?? null;
}

export function isGoogleFontFamily(family: string): boolean {
  return canonicalGoogleFontFamily(family) !== null;
}

/** Resuelve espécimen real sin fingir ficheros que no tenemos. */
export function enrichTypographySpecimen(value: TypographyValue): TypographyValue {
  if (value.specimenSource === "upload" && value.specimenFontUrl) {
    return {
      ...value,
      specimenAvailable: true,
      specimenLicense: value.specimenLicense ?? `${value.family} · ${UPLOAD_SPECIMEN_LICENSE_SUFFIX}`,
    };
  }

  const googleFamily = canonicalGoogleFontFamily(value.family);
  if (googleFamily) {
    return {
      ...value,
      family: googleFamily,
      specimenAvailable: true,
      embedStatus: value.embedStatus ?? "substituted",
      specimenSource: "google-fonts",
      specimenCssUrl: googleFontStylesheetHref(googleFamily),
      specimenLicense: GOOGLE_FONTS_OFL_LICENSE,
    };
  }

  if (value.embedStatus === "embedded_extracted" && value.specimenFontFaces) {
    return {
      ...value,
      specimenAvailable: true,
      specimenSource: "embedded",
      specimenLicense: value.specimenLicense ?? EMBEDDED_SPECIMEN_LICENSE,
    };
  }

  if (value.embedStatus === "identified_only") {
    return {
      ...value,
      specimenAvailable: false,
      specimenSource: undefined,
      specimenCssUrl: undefined,
      specimenFontUrl: undefined,
      specimenLicense: value.specimenLicense ?? `${value.family} · ${IDENTIFIED_ONLY_SPECIMEN_LICENSE}`,
    };
  }

  if (value.embedStatus === "substituted") {
    return {
      ...value,
      specimenAvailable: false,
      specimenSource: undefined,
      specimenCssUrl: undefined,
      specimenFontUrl: undefined,
      specimenLicense: value.specimenLicense,
    };
  }

  return {
    ...value,
    specimenAvailable: false,
    specimenSource: undefined,
    specimenCssUrl: undefined,
    specimenFontUrl: undefined,
    specimenLicense: undefined,
  };
}

export function typographyValueWithUpload(
  value: TypographyValue,
  fontUrl: string,
  fileName: string,
): TypographyValue {
  return enrichTypographySpecimen({
    ...value,
    specimenAvailable: true,
    specimenSource: "upload",
    specimenFontUrl: fontUrl,
    specimenLicense: `${value.family} · ${UPLOAD_SPECIMEN_LICENSE_SUFFIX} (${fileName})`,
  });
}

export function specimenFontStack(value: TypographyValue): string {
  if (
    value.specimenAvailable &&
    (value.specimenSource === "google-fonts" ||
      value.specimenSource === "upload" ||
      value.embedStatus === "embedded_extracted")
  ) {
    return `'${value.family.replace(/'/g, "\\'")}', ${value.fallback}`;
  }
  return `${value.family}, ${value.fallback}`;
}

export const SPECIMEN_SAMPLE_TEXT = "El veloz murciélago hindú comió feliz.";

export function typographyWeightCss(weight: string): { fontWeight: number; fontStyle?: "italic" | "normal" } {
  const w = weight.trim().toLowerCase();
  if (w.includes("italic")) return { fontWeight: 400, fontStyle: "italic" };
  if (w.includes("light") || w.includes("thin")) return { fontWeight: 300 };
  if (w.includes("bold") || w.includes("black")) return { fontWeight: 700 };
  if (w.includes("medium")) return { fontWeight: 500 };
  if (w.includes("semibold")) return { fontWeight: 600 };
  return { fontWeight: 400 };
}
