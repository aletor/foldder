/**
 * Coste orientativo del análisis de marca en ingesta (visión + voz LLM).
 * Seguro para importar desde cliente y servidor.
 */

export const GENOMA_PDF_INGEST_ANALYSIS_USD = 0.045;
export const GENOMA_URL_INGEST_VOICE_USD = 0.012;

export type GenomaIngestPaidKind = "pdf" | "url";

export function estimateGenomaIngestAnalysisUsd(kind: GenomaIngestPaidKind): number {
  return kind === "pdf" ? GENOMA_PDF_INGEST_ANALYSIS_USD : GENOMA_URL_INGEST_VOICE_USD;
}

export function genomaIngestAnalysisLabel(kind: GenomaIngestPaidKind): string {
  return kind === "pdf"
    ? "Genoma · análisis de marca (PDF)"
    : "Genoma · refinado de voz (web)";
}

export function genomaIngestAnalysisDescription(kind: GenomaIngestPaidKind, language: "es" | "en"): string {
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
