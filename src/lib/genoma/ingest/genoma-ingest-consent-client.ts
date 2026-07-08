/**
 * Cliente — consentimiento de coste antes de análisis de marca con APIs de pago.
 */

import type { Genome } from "../model/trait";
import {
  genomaIngestAnalysisDescription,
  genomaIngestAnalysisLabel,
  reserveMicrosForGenomaIngest,
  usdToCostMicros,
  estimateGenomaIngestAnalysisUsd,
  type GenomaIngestPaidKind,
} from "./genoma-ingest-cost";
import {
  dispatchWalletOpen,
  dispatchWalletRefresh,
  requestWalletCostDecision,
  type WalletCostDecisionResult,
  type WalletStatusResponse,
} from "@/lib/wallet-client-events";
import { freshGenomaIngestOperationId } from "./paid-operations";

export async function fileContentSha256Hex(file: File): Promise<string> {
  const data = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function isPdfFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return file.type === "application/pdf" || name.endsWith(".pdf");
}

export function genomeHasSourceSha256(genome: Genome, sha256: string): boolean {
  return genome.sources.some((s) => s.contentSha256 === sha256);
}

export async function resolveGenomaIngestPaidKind(input: {
  files?: FileList | File[];
  url?: string;
  genome: Genome;
}): Promise<GenomaIngestPaidKind | null> {
  if (input.url?.trim()) return "url";

  for (const file of Array.from(input.files ?? [])) {
    if (isPdfFile(file)) return "pdf";
  }
  return null;
}

async function readWalletStatus(): Promise<WalletStatusResponse | null> {
  try {
    const response = await fetch("/api/billing/wallet?limit=8", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    const json = (await response.json().catch(() => null)) as WalletStatusResponse | null;
    if (!response.ok || !json) return null;
    return json;
  } catch {
    return null;
  }
}

export async function confirmGenomaIngestPaidAnalysis(input: {
  kind: GenomaIngestPaidKind;
  contentSignature: string;
}): Promise<WalletCostDecisionResult & { operationId?: string }> {
  const wallet = await readWalletStatus();
  const estimatedUsd = estimateGenomaIngestAnalysisUsd(input.kind);
  const estimatedCostMicros = usdToCostMicros(estimatedUsd);
  const reserveMicros = reserveMicrosForGenomaIngest(input.kind);
  const operationId = freshGenomaIngestOperationId(input.contentSignature);

  if (!wallet?.configured) {
    const ok = window.confirm(
      `${genomaIngestAnalysisLabel(input.kind)}\n\n${genomaIngestAnalysisDescription(input.kind, "es")}\n\nCoste orientativo: ~$${estimatedUsd.toFixed(3)} USD.\n\n¿Continuar con el análisis?`,
    );
    return { allowed: ok, reason: ok ? "approved" : "cancelled", operationId: ok ? operationId : undefined };
  }

  const available = wallet.account?.availableMicros ?? 0;
  const blocked =
    wallet.account?.status === "blocked" ||
    wallet.account?.billingReviewRequired === true;

  if (blocked || available < reserveMicros) {
    dispatchWalletRefresh("preflight_blocked");
    dispatchWalletOpen("insufficient_balance");
    return { allowed: false, reason: "insufficient_balance" };
  }

  const decision = await requestWalletCostDecision({
    id: `${operationId}:${Date.now()}`,
    label: genomaIngestAnalysisLabel(input.kind),
    route: "/api/spaces/genoma/ingest",
    category: "analysis",
    estimatedCostMicros,
    reserveMicros,
    tone: "confirm",
    wallet,
  });

  if (!decision.allowed) {
    dispatchWalletRefresh("preflight_blocked");
    if (decision.reason === "insufficient_balance") dispatchWalletOpen("insufficient_balance");
  }

  return { ...decision, operationId: decision.allowed ? operationId : undefined };
}
