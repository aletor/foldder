"use client";

import type { Genome } from "@/lib/genoma/model/trait";
import {
  downloadGenomaStyleGuideHtml,
  genomaStyleGuideFilename,
} from "@/lib/genoma/projection/style-guide-render";
import type { GenomaStyleGuideExportMode } from "@/lib/genoma/projection/style-guide-export-types";
import type { StyleGuideVectorizeBlockCode } from "@/lib/genoma/projection/style-guide-vectorize-gate";
import type { StyleGuideFontBlockCode } from "@/lib/genoma/projection/style-guide-font-gate";
import type { VectorizeTrace } from "@/lib/genoma/model/evidence";

export type StyleGuideExportBlockCode = StyleGuideVectorizeBlockCode | StyleGuideFontBlockCode;

export class StyleGuideExportBlockedError extends Error {
  code: StyleGuideExportBlockCode;
  cta?: "pay_wallet" | "retry_vectorize" | "wait_vectorize";
  trace?: VectorizeTrace | null;
  missingFamilies?: string[];

  constructor(payload: {
    code: StyleGuideExportBlockCode;
    message: string;
    cta?: "pay_wallet" | "retry_vectorize" | "wait_vectorize";
    trace?: VectorizeTrace | null;
    missingFamilies?: string[];
  }) {
    super(payload.message);
    this.name = "StyleGuideExportBlockedError";
    this.code = payload.code;
    this.cta = payload.cta;
    this.trace = payload.trace;
    this.missingFamilies = payload.missingFamilies;
  }
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function downloadGenomaStyleGuidePdf(
  genome: Genome,
  options: {
    projectName?: string;
    exportMode?: GenomaStyleGuideExportMode;
    /** Opt-in explícito: exportar con logo raster (no recomendado). */
    allowRasterLogoBypass?: boolean;
    /** Solo para desarrollo local sin Chromium. */
    htmlFallbackOnChromiumUnavailable?: boolean;
  } = {},
): Promise<void> {
  const generatedAt = new Date().toISOString();
  const filename = genomaStyleGuideFilename(options.projectName, generatedAt);

  const response = await fetch("/api/spaces/genoma/style-guide/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      genome,
      projectName: options.projectName,
      exportMode: options.exportMode ?? "operativo",
      generatedAt,
      allowRasterLogoBypass: options.allowRasterLogoBypass === true,
    }),
  });

  if (response.status === 422) {
    const payload = (await response.json().catch(() => null)) as {
      code?: StyleGuideExportBlockCode;
      message?: string;
      cta?: "pay_wallet" | "retry_vectorize" | "wait_vectorize";
      trace?: VectorizeTrace | null;
      missingFamilies?: string[];
    } | null;
    throw new StyleGuideExportBlockedError({
      code: payload?.code ?? "VECTORIZE_REQUIRED",
      message: payload?.message ?? "Export del libro de estilo bloqueado.",
      cta: payload?.cta,
      trace: payload?.trace,
      missingFamilies: payload?.missingFamilies,
    });
  }

  if (response.status === 503) {
    if (options.htmlFallbackOnChromiumUnavailable) {
      await downloadGenomaStyleGuideHtml(genome, options.projectName, options.exportMode);
      return;
    }
    throw new Error("chromium_not_available");
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
    const detail = payload?.message?.trim() || payload?.error?.trim();
    throw new Error(
      detail === "pdf_generation_failed"
        ? "No se pudo generar el PDF del libro de estilo."
        : detail ?? "No se pudo generar el PDF",
    );
  }

  const blob = await response.blob();
  triggerBlobDownload(blob, filename);
}
