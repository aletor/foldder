/**
 * Metadatos de Fase A por fuente — persistidos en `SourceRef.pageVisionPass` para la UI.
 */

import type { PageVisionPassRunAudit } from "./page-vision-pass-runner";
import { GENOMA_PAGE_VISION_PASS_VERSION } from "./page-vision-pass-version";

export type PageVisionPassSourceStatus =
  | "completed"
  | "partial"
  | "failed"
  | "skipped"
  | "not_applicable";

export type PageVisionPassSkipReason =
  | "duplicate_content"
  | "vision_gate_off"
  | "flag_disabled"
  | "missing_api_key"
  | "ingest_error";

export type PageVisionPassSourceMeta = {
  version: typeof GENOMA_PAGE_VISION_PASS_VERSION;
  status: PageVisionPassSourceStatus;
  skipReason?: PageVisionPassSkipReason;
  /** Páginas con respuesta OK del modelo. */
  pagesAnalyzed: number;
  /** Páginas planificadas para Fase A. */
  pagesSelected: number;
  totalPages: number;
  ranAt: string;
  /** Mensaje corto para micro / badge secundario. */
  summary?: string;
};

export function pageVisionPassMetaFromAudit(audit: PageVisionPassRunAudit): PageVisionPassSourceMeta {
  const okPages = audit.pages.filter((p) => p.ok).length;
  const status: PageVisionPassSourceStatus =
    okPages === 0 ? "failed" : okPages < audit.pages.length ? "partial" : "completed";
  return {
    version: audit.version,
    status,
    pagesAnalyzed: okPages,
    pagesSelected: audit.selectedPages.length,
    totalPages: audit.totalPages,
    ranAt: audit.generatedAt,
    summary: `Fase A · ${okPages}/${audit.pages.length} páginas`,
  };
}

export function skippedPageVisionPassMeta(input: {
  skipReason: PageVisionPassSkipReason;
  totalPages?: number;
  summary?: string;
}): PageVisionPassSourceMeta {
  return {
    version: GENOMA_PAGE_VISION_PASS_VERSION,
    status: "skipped",
    skipReason: input.skipReason,
    pagesAnalyzed: 0,
    pagesSelected: 0,
    totalPages: input.totalPages ?? 0,
    ranAt: new Date().toISOString(),
    summary: input.summary,
  };
}

export function pageVisionPassBadgeLabel(meta: PageVisionPassSourceMeta | undefined): string | null {
  if (!meta) return null;
  if (meta.status === "completed" || meta.status === "partial") {
    return `análisis v2 · ${meta.pagesAnalyzed} pág.`;
  }
  if (meta.status === "failed") return "análisis v2 · falló";
  if (meta.status === "skipped") {
    if (meta.skipReason === "flag_disabled") {
      return "sin análisis v2";
    }
    if (meta.skipReason === "duplicate_content") return "duplicado · sin v2";
    if (meta.skipReason === "missing_api_key") return "sin API key · v2 off";
    return "sin análisis v2";
  }
  return null;
}

export function pageVisionPassSkipDetail(meta: PageVisionPassSourceMeta | undefined): string | null {
  if (!meta || meta.status !== "skipped") return null;
  switch (meta.skipReason) {
    case "duplicate_content":
      return "Documento ya ingerido (mismo SHA) — no se repite Fase A.";
    case "flag_disabled":
      return "Fase A desactivada — define GENOMA_PAGE_VISION_PASS_ENABLED=1 en el servidor.";
    case "missing_api_key":
      return "Falta GEMINI_API_KEY o GOOGLE_API_KEY en el servidor.";
    case "vision_gate_off":
      return "Gate de visión cerrado — sin fuentes nuevas.";
    case "ingest_error":
      return "La ingesta abortó antes de completar Fase A.";
    default:
      return "Fase A no ejecutada.";
  }
}
