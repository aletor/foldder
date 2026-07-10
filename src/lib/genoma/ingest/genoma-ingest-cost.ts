/**
 * Coste orientativo del análisis de marca en ingesta (visión + voz LLM).
 * Seguro para importar desde cliente y servidor.
 */

export const GENOMA_PDF_INGEST_ANALYSIS_USD = 0.045;
export const GENOMA_DECK_LOGO_VISION_USD = 0.012;
export const GENOMA_BRAND_MANUAL_VISION_USD = 0.038;
export const GENOMA_BRAND_BOARD_VISION_USD = 0.022;
export const GENOMA_BRAND_BOARD_LOGO_FOCUS_USD = 0.012;
export const GENOMA_LOGO_CROP_VERIFY_USD = 0.003;
export const GENOMA_URL_INGEST_VOICE_USD = 0.012;

export type GenomaIngestPaidKind =
  | "pdf"
  | "url"
  | "deck_logo"
  | "brand_manual"
  | "brand_board"
  | "brand_board_logo_focus"
  | "logo_crop_verify";

export function estimateGenomaIngestAnalysisUsd(kind: GenomaIngestPaidKind): number {
  if (kind === "deck_logo") return GENOMA_DECK_LOGO_VISION_USD;
  if (kind === "brand_manual") return GENOMA_BRAND_MANUAL_VISION_USD;
  if (kind === "brand_board") return GENOMA_BRAND_BOARD_VISION_USD;
  if (kind === "brand_board_logo_focus") return GENOMA_BRAND_BOARD_LOGO_FOCUS_USD;
  if (kind === "logo_crop_verify") return GENOMA_LOGO_CROP_VERIFY_USD;
  return kind === "pdf" ? GENOMA_PDF_INGEST_ANALYSIS_USD : GENOMA_URL_INGEST_VOICE_USD;
}

export function genomaIngestAnalysisLabel(kind: GenomaIngestPaidKind): string {
  if (kind === "deck_logo") return "Genoma · logo en deck (PDF)";
  if (kind === "brand_manual") return "Genoma · manual de marca (PDF)";
  if (kind === "brand_board") return "Genoma · brand board (imagen)";
  if (kind === "brand_board_logo_focus") {
    return "Genoma · brand board · refuerzo logo (solo si hace falta)";
  }
  if (kind === "logo_crop_verify") {
    return "Genoma · verificación de recorte de logo (opcional)";
  }
  return kind === "pdf"
    ? "Genoma · análisis de marca (PDF)"
    : "Genoma · refinado de voz (web)";
}

export function genomaIngestAnalysisDescription(kind: GenomaIngestPaidKind, language: "es" | "en"): string {
  if (kind === "deck_logo") {
    return language === "es"
      ? "Visión multimodal sobre la portada del deck para detectar y recortar el logo."
      : "Multimodal vision on the deck cover to detect and crop the logo.";
  }
  if (kind === "brand_manual") {
    return language === "es"
      ? "Visión multimodal del manual (logo, paleta y tipografía) más extracción del render PDF."
      : "Multimodal vision on the brand manual (logo, palette, typography) plus PDF render extraction.";
  }
  if (kind === "brand_board") {
    return language === "es"
      ? "Una llamada de visión multimodal a la plancheta (logo, paleta con hex, tipografía y marca)."
      : "One multimodal vision call on the brand board (logo, hex palette, typography, brand name).";
  }
  if (kind === "brand_board_logo_focus") {
    return language === "es"
      ? "Segunda llamada de visión enfocada en el logo principal, solo si la primera no produce un recorte válido. Aprobada en el desglose; se libera la reserva si no se usa."
      : "Second vision call focused on the primary logo, only if the first pass fails to crop. Reserved upfront; released if unused.";
  }
  if (kind === "logo_crop_verify") {
    return language === "es"
      ? "Verificación rápida del recorte principal: confirma que el PNG es un logo completo y no un falso positivo."
      : "Quick check on the primary crop: confirms the PNG is a complete logo, not a false positive.";
  }
  if (kind === "pdf") {
    return language === "es"
      ? "Una llamada de visión multimodal sobre las páginas renderizadas (paleta, logo, tipografía y universo visual) más refinado de voz. Solo en el primer análisis de este documento."
      : "One multimodal vision pass on rendered pages (palette, logo, typography, visual universe) plus voice refinement. Only on the first analysis of this document.";
  }
  return language === "es"
    ? "Refinado de voz de marca con LLM sobre el contenido de la página."
    : "LLM voice refinement from the page content.";
}

export function usdToCostMicros(usd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  return Math.ceil(usd * 1_000_000);
}

export function reserveMicrosForGenomaIngest(kind: GenomaIngestPaidKind): number {
  const usd = estimateGenomaIngestAnalysisUsd(kind);
  return Math.max(1_000, Math.ceil(usd * 1_000_000 * 1.25));
}
