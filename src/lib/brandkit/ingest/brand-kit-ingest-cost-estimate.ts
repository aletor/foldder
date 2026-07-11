/**
 * Estimación de coste de ingesta BrandKit v2 (cliente + servidor).
 * Desglosa síntesis IA y visiones adicionales antes de confirmar wallet.
 */

import { estimateGeminiUsd } from "@/lib/pricing-config";
import { triageBrandKitFilename } from "./triage";
import {
  estimateBrandKitIngestAnalysisUsd,
  brandKitIngestAnalysisLabel,
  usdToCostMicros,
  type BrandKitIngestPaidKind,
} from "./brand-kit-ingest-cost";
import {
  isBrandBoardFilename,
  isLikelyBrandBoardImage,
  type BrandBoardImageSignals,
} from "../brand-kit-brand-board-image-detect";

const BRAND_KIT_LLM_MODEL = "gemini-2.5-flash";

export type BrandKitIngestCostLine = {
  id: string;
  label: string;
  estimatedUsd: number;
  reserveMicros: number;
};

export type BrandKitIngestCostEstimate = {
  lines: BrandKitIngestCostLine[];
  totalEstimatedUsd: number;
  totalEstimatedMicros: number;
  totalReserveMicros: number;
  enableLlm: boolean;
};

export type BrandKitIngestFileCostHint = {
  name: string;
  mime: string;
  width?: number;
  height?: number;
  /** PDF — alineado con runtime `isLikelyDeckPdf`. */
  pageCount?: number;
  textSampleExcerpt?: string;
};

function roundedUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/** Probe (1–2) + batch semántico (1) */
export function estimateBrandKitIngestLlmSynthesisUsd(): number {
  const textCall = estimateGeminiUsd(BRAND_KIT_LLM_MODEL, 6500, 900);
  const probeCall = estimateGeminiUsd(BRAND_KIT_LLM_MODEL, 4200, 900);
  return roundedUsd(probeCall * 2 + textCall + 0.006);
}

function documentProbeLine(pageCount?: number): BrandKitIngestCostLine {
  const llmCalls = pageCount != null && pageCount > 4 ? 2 : 1;
  const perCall = estimateGeminiUsd(BRAND_KIT_LLM_MODEL, 4200, 900);
  const estimatedUsd = roundedUsd(perCall * llmCalls);
  const reserveMicros = Math.max(1_000, Math.ceil(usdToCostMicros(estimatedUsd) * 1.25));
  return {
    id: "document_probe",
    label: `BrandKit · document probe (${llmCalls} LLM)`,
    estimatedUsd,
    reserveMicros,
  };
}

function llmSynthesisLine(): BrandKitIngestCostLine {
  const textCall = estimateGeminiUsd(BRAND_KIT_LLM_MODEL, 6500, 900);
  const estimatedUsd = roundedUsd(textCall + 0.004);
  const reserveMicros = Math.max(1_000, Math.ceil(usdToCostMicros(estimatedUsd) * 1.5));
  return {
    id: "llm_synthesis",
    label: "BrandKit · batch IA (esencia, voz, mundo visual)",
    estimatedUsd,
    reserveMicros,
  };
}

function visionLine(kind: BrandKitIngestPaidKind): BrandKitIngestCostLine {
  const estimatedUsd = estimateBrandKitIngestAnalysisUsd(kind);
  const reserveMicros = Math.max(1_000, Math.ceil(usdToCostMicros(estimatedUsd) * 1.25));
  return {
    id: `vision_${kind}`,
    label: brandKitIngestAnalysisLabel(kind),
    estimatedUsd,
    reserveMicros,
  };
}

function usesDocumentProbe(hint: BrandKitIngestFileCostHint): boolean {
  const triage = triageBrandKitFilename(hint.name, hint.mime);
  return triage.kind === "brand_document" || triage.kind === "logo_image" || triage.kind === "gallery_image";
}

function isImageFile(hint: BrandKitIngestFileCostHint): boolean {
  return hint.mime.startsWith("image/") || /\.(png|jpe?g|webp|gif|svg|ico)$/i.test(hint.name);
}

function brandBoardSignalsFromHint(hint: BrandKitIngestFileCostHint): BrandBoardImageSignals | null {
  const width = hint.width ?? 0;
  const height = hint.height ?? 0;
  if (!width || !height) return null;
  return {
    width,
    height,
    area: width * height,
    textPresenceScore: 0.32,
    visualDensityScore: 0.48,
  };
}

function visionKindForFile(hint: BrandKitIngestFileCostHint, enableLlm: boolean): BrandKitIngestPaidKind | null {
  if (!enableLlm) return null;

  if (!isImageFile(hint)) return null;

  const triage = triageBrandKitFilename(hint.name, hint.mime);
  if (triage.kind === "brand_board_image") return "brand_board";

  if (triage.kind === "gallery_image") {
    const signals = brandBoardSignalsFromHint(hint);
    if (signals && isLikelyBrandBoardImage(hint.name, signals)) return "brand_board";
    if (isBrandBoardFilename(hint.name)) return "brand_board";
  }

  return null;
}

function visionKindsForFile(hint: BrandKitIngestFileCostHint, enableLlm: boolean): BrandKitIngestPaidKind[] {
  const kind = visionKindForFile(hint, enableLlm);
  if (!kind) return [];
  if (kind === "brand_board") return ["brand_board", "brand_board_logo_focus"];
  return [kind];
}

export function estimateBrandKitIngestCost(
  files: BrandKitIngestFileCostHint[],
  enableLlm: boolean,
): BrandKitIngestCostEstimate {
  const lines: BrandKitIngestCostLine[] = [];

  if (enableLlm) {
    let maxProbePages: number | undefined;
    for (const file of files) {
      if (!usesDocumentProbe(file)) continue;
      maxProbePages = Math.max(maxProbePages ?? 0, file.pageCount ?? 1);
    }
    if (maxProbePages != null) {
      lines.push(documentProbeLine(maxProbePages));
    }
    lines.push(llmSynthesisLine());
  }

  const visionKinds = new Set<BrandKitIngestPaidKind>();
  for (const file of files) {
    for (const kind of visionKindsForFile(file, enableLlm)) {
      visionKinds.add(kind);
    }
  }

  for (const kind of visionKinds) {
    lines.push(visionLine(kind));
  }

  const totalEstimatedUsd = roundedUsd(lines.reduce((sum, line) => sum + line.estimatedUsd, 0));
  const totalEstimatedMicros = usdToCostMicros(totalEstimatedUsd);
  const totalReserveMicros = lines.reduce((sum, line) => sum + line.reserveMicros, 0);

  return {
    lines,
    totalEstimatedUsd,
    totalEstimatedMicros,
    totalReserveMicros,
    enableLlm,
  };
}

export function formatBrandKitIngestCostDetailLines(
  estimate: BrandKitIngestCostEstimate,
  language: "es" | "en" = "es",
): string[] {
  if (!estimate.lines.length) {
    return language === "es"
      ? ["Sin coste de APIs de pago (IA desactivada)."]
      : ["No paid API cost (AI disabled)."];
  }

  const bulletLines = estimate.lines.map((line) => {
    const usd = line.estimatedUsd.toFixed(3);
    return language === "es" ? `• ${line.label}: ~$${usd}` : `• ${line.label}: ~$${usd}`;
  });

  const totalEst = estimate.totalEstimatedUsd.toFixed(3);
  const totalReserve = (estimate.totalReserveMicros / 1_000_000).toFixed(3);

  bulletLines.push(
    language === "es"
      ? `Total estimado: ~$${totalEst} · Reserva máxima: ~$${totalReserve}`
      : `Estimated total: ~$${totalEst} · Max reserve: ~$${totalReserve}`,
  );

  if (estimate.lines.length > 1) {
    bulletLines.splice(
      0,
      0,
      language === "es"
        ? "Esta ingesta puede usar varias llamadas de IA (secuenciales). Cada línea debe estar aprobada antes de empezar:"
        : "This ingest may use several AI calls (sequential). Each line must be approved before starting:",
    );
  }

  const hasConditionalFocus = estimate.lines.some((line) => line.id === "vision_brand_board_logo_focus");
  if (hasConditionalFocus) {
    bulletLines.push(
      language === "es"
        ? "Nota: el refuerzo de logo solo se ejecuta si la primera visión no recorta logo; si no hace falta, se libera su reserva."
        : "Note: logo focus runs only if the first vision pass fails to crop; otherwise its reserve is released.",
    );
  }

  const hasCropVerify = estimate.lines.some((line) => line.id === "vision_logo_crop_verify");
  if (hasCropVerify) {
    bulletLines.push(
      language === "es"
        ? "Nota: la verificación de recorte solo se ejecuta si hay candidato de logo; si no aplica, se libera su reserva."
        : "Note: crop verification runs only when a logo candidate exists; otherwise its reserve is released.",
    );
  }

  return bulletLines;
}

export function brandKitIngestCostEstimateLabel(
  estimate: BrandKitIngestCostEstimate,
  language: "es" | "en" = "es",
): string {
  if (!estimate.lines.length) {
    return language === "es" ? "BrandKit · ingestar archivos" : "BrandKit · ingest files";
  }
  if (estimate.lines.length === 1) {
    return estimate.lines[0]!.label;
  }
  return language === "es"
    ? `BrandKit · ingestar archivos (${estimate.lines.length} pasos de IA)`
    : `BrandKit · ingest files (${estimate.lines.length} AI steps)`;
}
