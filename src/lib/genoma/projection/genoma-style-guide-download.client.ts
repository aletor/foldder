"use client";

import type { GenomaDocument } from "../genoma-types";
import { vectorizeGenomaLogo } from "@/app/spaces/genoma/genoma-ingest-client";
import { getTrait } from "../model/trait";
import { buildBookView } from "./book-view";
import { genomaDocumentToGenome } from "./genoma-document-to-genome";
import type { GenomaStyleGuideExportMode } from "./style-guide-export-types";
import {
  downloadGenomaStyleGuideHtml,
  genomaStyleGuideFilename,
} from "./style-guide-render";
import { evaluateStyleGuideVectorizeGate } from "./style-guide-vectorize-gate";

export type GenomaStyleGuideDownloadPhase = "vectorizing" | "downloading";

export type GenomaStyleGuideDownloadResult =
  | { ok: true; usedHtmlFallback?: boolean }
  | { ok: false; message: string; code?: string; cta?: string };

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function isNativeVectorUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  return u.startsWith("data:image/svg+xml") || u.endsWith(".svg") || u.includes("image/svg+xml");
}

async function maybeVectorizeLogo(
  genome: ReturnType<typeof genomaDocumentToGenome>,
  onPhase?: (phase: GenomaStyleGuideDownloadPhase) => void,
): Promise<ReturnType<typeof genomaDocumentToGenome>> {
  const gate = evaluateStyleGuideVectorizeGate(genome);
  if (gate.allowed) return genome;

  const view = buildBookView(genome);
  const logo = view.logo.primary.value;
  if (!logo?.imageUrl || isNativeVectorUrl(logo.imageUrl)) return genome;

  const trait = getTrait(genome, "logo.primary");
  const crownedId = trait?.crownedIds[0] ?? trait?.candidates[0]?.id;
  const crowned = crownedId ? trait?.candidates.find((c) => c.id === crownedId) : undefined;
  if (!crowned) return genome;

  onPhase?.("vectorizing");
  const result = await vectorizeGenomaLogo({
    logoUrl: logo.imageUrl,
    logoSignature: crowned.signature,
    vectorSource: crowned.derived?.vectorSource,
  });

  if (!result.vectorUrl?.trim()) {
    throw new Error(
      result.reason === "insufficient_balance"
        ? "Saldo insuficiente para vectorizar el logo."
        : result.reason ?? "No se pudo vectorizar el logo.",
    );
  }

  const nextCandidates = trait!.candidates.map((c) =>
    c.id === crowned.id
      ? {
          ...c,
          derived: { ...c.derived, vectorUrl: result.vectorUrl, vectorize: { attempted: true, status: "ok" as const } },
        }
      : c,
  );

  return {
    ...genome,
    traits: {
      ...genome.traits,
      "logo.primary": { ...trait!, candidates: nextCandidates },
    },
  };
}

export async function downloadGenomaDocumentStyleGuidePdf(
  doc: GenomaDocument,
  options: {
    exportMode?: GenomaStyleGuideExportMode;
    projectName?: string;
    onPhase?: (phase: GenomaStyleGuideDownloadPhase) => void;
    allowRasterLogoBypass?: boolean;
  } = {},
): Promise<GenomaStyleGuideDownloadResult> {
  const projectName = options.projectName?.trim() || doc.brandName?.value?.trim() || "Genoma";

  try {
    let genome = genomaDocumentToGenome(doc);
    genome = await maybeVectorizeLogo(genome, options.onPhase);

    options.onPhase?.("downloading");
    const response = await fetch("/api/spaces/genoma/style-guide/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        genome,
        exportMode: options.exportMode ?? "operativo",
        projectName,
        allowRasterLogoBypass: options.allowRasterLogoBypass === true,
      }),
    });

    if (response.status === 503) {
      await downloadGenomaStyleGuideHtml(genome, projectName, options.exportMode);
      return { ok: true, usedHtmlFallback: true };
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        code?: string;
        cta?: string;
        error?: string;
      } | null;
      return {
        ok: false,
        message: payload?.message ?? payload?.error ?? "No se pudo generar el PDF del libro de estilo.",
        code: payload?.code,
        cta: payload?.cta,
      };
    }

    const blob = await response.blob();
    const filename = genomaStyleGuideFilename(projectName, new Date().toISOString());
    triggerBlobDownload(blob, filename);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Error al descargar el libro de estilo.",
    };
  }
}
