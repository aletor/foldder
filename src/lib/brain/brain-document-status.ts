import type { BrainDocumentWorkflowStatus } from "./brain-creative-memory-types";

/** Estados UI legados (español). */
export type LegacyBrainDocumentStatusLabel = "Subido" | "Analizado" | "Error";

const DEFAULT_MAX_RETRIES = 3;

export function normalizeBrainDocumentStatus(
  raw: string | undefined | null,
): BrainDocumentWorkflowStatus | LegacyBrainDocumentStatusLabel {
  const s = String(raw ?? "").trim();
  if (!s) return "uploaded";
  const lower = s.toLowerCase();
  if (lower === "subido" || lower === "uploaded") return "uploaded";
  if (lower === "analizado" || lower === "analyzed") return "analyzed";
  if (lower === "error") return "failed_retryable";
  if (
    lower === "queued" ||
    lower === "analyzing" ||
    lower === "failed_retryable" ||
    lower === "failed_final" ||
    lower === "stale"
  ) {
    return lower as BrainDocumentWorkflowStatus;
  }
  return "uploaded";
}

export function legacyLabelFromWorkflowStatus(
  status: BrainDocumentWorkflowStatus | LegacyBrainDocumentStatusLabel,
  retryCount?: number,
  maxRetries?: number,
): LegacyBrainDocumentStatusLabel {
  if (status === "analyzed") return "Analizado";
  if (status === "failed_final") return "Error";
  if (status === "failed_retryable") return "Error";
  if (status === "Error") return "Error";
  if (status === "Analizado") return "Analizado";
  if (status === "Subido") return "Subido";
  const rc = typeof retryCount === "number" ? retryCount : 0;
  const mr = typeof maxRetries === "number" ? maxRetries : DEFAULT_MAX_RETRIES;
  if (status === "stale" || status === "queued" || status === "analyzing" || status === "uploaded") {
    if (rc >= mr && status !== "uploaded") return "Error";
    return "Subido";
  }
  return "Subido";
}

export function shouldAnalyzeBrainDocument(input: {
  workflowStatus?: BrainDocumentWorkflowStatus | string | null;
  legacyStatus?: string | null;
  requiresUpgrade?: boolean;
  retryCount?: number;
  maxRetries?: number;
}): boolean {
  const ws = normalizeBrainDocumentStatus(input.workflowStatus ?? input.legacyStatus);
  const rc = typeof input.retryCount === "number" ? input.retryCount : 0;
  const mr = typeof input.maxRetries === "number" ? input.maxRetries : DEFAULT_MAX_RETRIES;

  if (ws === "failed_final") return false;
  if (ws === "analyzing") return false;
  if (ws === "queued") return true;
  if (ws === "uploaded") return true;
  if (ws === "stale" || input.requiresUpgrade) return true;
  if (ws === "analyzed") return Boolean(input.requiresUpgrade);
  if (ws === "failed_retryable") return rc < mr;
  if (ws === "Error") return rc < mr;
  return false;
}

export function markBrainDocumentAnalyzing<T extends Record<string, unknown>>(doc: T): T {
  return {
    ...doc,
    workflowStatus: "analyzing",
    lastAttemptAt: new Date().toISOString(),
  };
}

export function markBrainDocumentAnalyzed<T extends Record<string, unknown>>(doc: T, analyzedAt?: string): T {
  return {
    ...doc,
    workflowStatus: "analyzed",
    status: "Analizado",
    analyzedAt: analyzedAt ?? new Date().toISOString(),
    lastError: undefined,
  };
}

export function markBrainDocumentFailed<T extends Record<string, unknown>>(
  doc: T,
  err: unknown,
  opts?: { maxRetries?: number },
): T {
  const message = err instanceof Error ? err.message : String(err);
  const d = doc as unknown as { retryCount?: number };
  const rc = typeof d.retryCount === "number" ? d.retryCount : 0;
  const nextRc = rc + 1;
  const mr = opts?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const terminal = nextRc >= mr;
  return {
    ...doc,
    retryCount: nextRc,
    maxRetries: mr,
    lastError: message.slice(0, 2000),
    lastAttemptAt: new Date().toISOString(),
    workflowStatus: terminal ? "failed_final" : "failed_retryable",
    status: "Error",
  };
}

export function markBrainDocumentStale<T extends Record<string, unknown>>(doc: T, reasons: string[]): T {
  return {
    ...doc,
    workflowStatus: "stale",
    staleReasons: reasons,
    status: "Subido",
  };
}
