/**
 * Trazabilidad de vectorización del logo coronado (job Genoma).
 */

import type { VectorizeTrace, VectorizeTraceStatus } from "../model/evidence";
import type { LogoValue } from "../model/trait-values";

export function buildVectorizeSkippedTrace(
  reason: string,
  evaluatedFlags: Record<string, unknown> = {},
): VectorizeTrace {
  return {
    attempted: false,
    status: "skipped_reason",
    skippedReason: reason,
    evaluatedFlags,
  };
}

export function buildVectorizeAttemptTrace(input: {
  vectorUrl?: string;
  reason?: string;
  walletReservationId?: string;
  evaluatedFlags?: Record<string, unknown>;
}): VectorizeTrace {
  const ok = Boolean(input.vectorUrl?.trim());
  const status: VectorizeTraceStatus = ok ? "ok" : "failed_reason";
  return {
    attempted: true,
    status,
    failedReason: ok ? undefined : input.reason ?? "vectorize_no_output",
    walletReservationId: input.walletReservationId,
    evaluatedFlags: input.evaluatedFlags,
  };
}

export function vectorizeEvaluatedFlags(input: {
  logo: LogoValue;
  hadVectorUrl: boolean;
  isNativeVector?: boolean;
}): Record<string, unknown> {
  return {
    hadVectorUrl: input.hadVectorUrl,
    isNativeVector: input.isNativeVector ?? false,
    sourcePageNumber: input.logo.sourcePageNumber ?? null,
    hasSourceBbox: Boolean(input.logo.sourceBbox),
  };
}

export function logVectorizeSkipped(reason: string, flags: Record<string, unknown>): void {
  console.info(
    `[vectorize] skipped: reason=${reason} evaluatedFlags=${JSON.stringify(flags)}`,
  );
}
