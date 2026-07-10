/**
 * Compuerta fail-closed: export del libro de estilo requiere logo vectorial
 * cuando el logo coronado es raster (no SVG/data URL vector nativo).
 */

import { buildBookView } from "./book-view";
import type { Genome } from "../model/trait";
import { getTrait } from "../model/trait";
import type { LogoValue } from "../model/trait-values";
import type { CandidateDerived, VectorizeTrace } from "../model/evidence";

export type StyleGuideVectorizeBlockCode =
  | "VECTORIZE_REQUIRED"
  | "VECTORIZE_FAILED"
  | "VECTORIZE_PENDING";

export type StyleGuideVectorizeGateResult =
  | { allowed: true; trace: VectorizeTrace | null; usedRasterBypass: boolean }
  | {
      allowed: false;
      code: StyleGuideVectorizeBlockCode;
      message: string;
      trace: VectorizeTrace | null;
      cta: "pay_wallet" | "retry_vectorize" | "wait_vectorize";
    };

export type StyleGuideExportOptions = {
  /** Opt-in explícito: permite logo raster en el PDF (no recomendado). */
  allowRasterLogoBypass?: boolean;
};

function isNativeVectorLogoUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  return u.startsWith("data:image/svg+xml") || u.endsWith(".svg") || u.includes("image/svg+xml");
}

function crownedLogoDerived(genome: Genome): CandidateDerived | undefined {
  const trait = getTrait(genome, "logo.primary");
  const crownedId = trait?.crownedIds[0];
  if (!trait || !crownedId) return undefined;
  return trait.candidates.find((c) => c.id === crownedId)?.derived;
}

function crownedLogoValue(genome: Genome): LogoValue | null {
  const view = buildBookView(genome);
  if (view.logo.primary.state !== "crowned" || !view.logo.primary.value) return null;
  return view.logo.primary.value;
}

/** Evalúa si hace falta vectorización y si el export puede continuar. */
export function evaluateStyleGuideVectorizeGate(
  genome: Genome,
  options: StyleGuideExportOptions = {},
): StyleGuideVectorizeGateResult {
  const logo = crownedLogoValue(genome);
  if (!logo?.imageUrl) {
    return { allowed: true, trace: null, usedRasterBypass: false };
  }

  const derived = crownedLogoDerived(genome);
  const trace = derived?.vectorize ?? null;

  if (derived?.vectorUrl?.trim()) {
    return { allowed: true, trace, usedRasterBypass: false };
  }

  if (isNativeVectorLogoUrl(logo.imageUrl)) {
    return { allowed: true, trace, usedRasterBypass: false };
  }

  if (options.allowRasterLogoBypass === true) {
    console.info(
      `[vectorize] export bypass: allowRasterLogoBypass=true logoSignature=${getTrait(genome, "logo.primary")?.candidates.find((c) => c.id === getTrait(genome, "logo.primary")?.crownedIds[0])?.signature ?? "—"}`,
    );
    return { allowed: true, trace, usedRasterBypass: true };
  }

  const walletBlocked =
    trace?.failedReason?.includes("insufficient_balance") ||
    trace?.skippedReason?.includes("insufficient_balance");
  if (walletBlocked) {
    return {
      allowed: false,
      code: "VECTORIZE_REQUIRED",
      message: "Saldo insuficiente para vectorizar el logo. Recarga el wallet para exportar el libro.",
      trace,
      cta: "pay_wallet",
    };
  }

  if (trace?.status === "failed_reason") {
    return {
      allowed: false,
      code: "VECTORIZE_FAILED",
      message: trace.failedReason ?? "La vectorización del logo falló. Reintenta antes de exportar.",
      trace,
      cta: "retry_vectorize",
    };
  }

  if (trace?.attempted === true && !derived?.vectorUrl) {
    return {
      allowed: false,
      code: "VECTORIZE_FAILED",
      message: trace.failedReason ?? "La vectorización no produjo un SVG utilizable.",
      trace,
      cta: "retry_vectorize",
    };
  }

  if (trace?.skippedReason === "vectorize_pending") {
    return {
      allowed: false,
      code: "VECTORIZE_REQUIRED",
      message: "La vectorización del logo está pendiente. Espera a que termine antes de exportar.",
      trace,
      cta: "wait_vectorize",
    };
  }

  return {
    allowed: false,
    code: "VECTORIZE_REQUIRED",
    message: "El logo confirmado requiere vectorización antes de exportar el libro de estilo.",
    trace,
    cta: trace?.attempted ? "retry_vectorize" : "pay_wallet",
  };
}

export function logVectorizeExportDecision(
  genome: Genome,
  gate: StyleGuideVectorizeGateResult,
): void {
  const trait = getTrait(genome, "logo.primary");
  const crowned = trait?.crownedIds[0]
    ? trait.candidates.find((c) => c.id === trait.crownedIds[0])
    : undefined;
  const trace = crowned?.derived?.vectorize;
  console.info(
    `[vectorize] export gate: allowed=${gate.allowed} ` +
      `attempted=${trace?.attempted ?? false} status=${trace?.status ?? "none"} ` +
      `walletReservationId=${trace?.walletReservationId ?? "—"} ` +
      `hasVectorUrl=${Boolean(crowned?.derived?.vectorUrl)} ` +
      `logoSignature=${crowned?.signature ?? "—"} ` +
      `evaluatedFlags=${JSON.stringify(trace?.evaluatedFlags ?? {})}`,
  );
}
