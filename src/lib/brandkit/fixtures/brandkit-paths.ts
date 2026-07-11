import fs from "node:fs";
import path from "node:path";

export const BRANDKIT_FIXTURES_DIR = path.join(process.cwd(), "fixtures/brandkit");

/** PDF multipágina con logo raster recurrente y fotos de contenido (fixture genérico). */
export const SAMPLE_BRAND_DECK_PDF = path.join(BRANDKIT_FIXTURES_DIR, "sample-brand-deck.pdf");
export const SAMPLE_BRAND_DECK_FILENAME = "sample-brand-deck.pdf";

/**
 * Catálogo de ventas — caso de estrés BrandKit (logo vectorial portada/pág.2, identidad pág.3).
 * Fixture principal de aceptación Fase A.
 */
export const CATALOGO26_PDF = path.join(BRANDKIT_FIXTURES_DIR, "catalogo26.pdf");
export const CATALOGO26_FILENAME = "catalogo26.pdf";

/** Informe EINF Atresmedia — corporativo estándar (caso secundario). */
export const ATRESMEDIA_EINF_PDF = path.join(BRANDKIT_FIXTURES_DIR, "einf_2023_atresmedia.pdf");
export const ATRESMEDIA_EINF_FILENAME = "einf_2023_atresmedia.pdf";

/** @deprecated Usar ATRESMEDIA_EINF_* */
export const ATRESMEDIA_CATALOG_PDF = ATRESMEDIA_EINF_PDF;
/** @deprecated Usar ATRESMEDIA_EINF_* */
export const ATRESMEDIA_CATALOG_FILENAME = ATRESMEDIA_EINF_FILENAME;

export function hasCatalogo26Pdf(): boolean {
  return fs.existsSync(CATALOGO26_PDF);
}

export function hasAtresmediaEinfPdf(): boolean {
  return fs.existsSync(ATRESMEDIA_EINF_PDF);
}

/** @deprecated Usar hasAtresmediaEinfPdf */
export function hasAtresmediaCatalogPdf(): boolean {
  return hasAtresmediaEinfPdf();
}

/** Marca vectorial mínima para pruebas de corona SVG. */
export const BRAND_LOGO_MARK_SVG = path.join(BRANDKIT_FIXTURES_DIR, "brand-logo-mark.svg");
export const BRAND_LOGO_MARK_FILENAME = "brand-logo-mark.svg";

export function hasSampleBrandDeckPdf(): boolean {
  return fs.existsSync(SAMPLE_BRAND_DECK_PDF);
}

export function hasBrandLogoMarkSvg(): boolean {
  return fs.existsSync(BRAND_LOGO_MARK_SVG);
}

/** Pitch deck Lean Finance — portada con JPEG2000 + logo vectorial (regresión wasm/prepass). */
export const LEAN_FINANCE_PITCH_PDF = path.join(BRANDKIT_FIXTURES_DIR, "lean-finance-pitch-deck.pdf");
export const LEAN_FINANCE_PITCH_FILENAME = "lean-finance-pitch-deck.pdf";

/** Pitch deck ESADE Alumni — plantilla descargable, JPEG2000 + logo cian/azul. */
export const ESADE_PITCH_PDF = path.join(BRANDKIT_FIXTURES_DIR, "esade-pitch-deck.pdf");
export const ESADE_PITCH_FILENAME = "esade-pitch-deck.pdf";

export function hasLeanFinancePitchPdf(): boolean {
  return fs.existsSync(LEAN_FINANCE_PITCH_PDF);
}

export function hasEsadePitchPdf(): boolean {
  return fs.existsSync(ESADE_PITCH_PDF);
}
