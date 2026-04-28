import type { BrainVisualImageAnalysis } from "@/app/spaces/project-assets-metadata";

/**
 * True si la fila de visión ya permite crear un slot ADN por imagen (incluye pending/queued mientras no sea failed).
 * Los JSON antiguos sin `analysisStatus` se tratan como listos, igual que en otras heurísticas del Brain.
 */
export function analysisEligibleForKnowledgeVisualDnaSlot(a: BrainVisualImageAnalysis): boolean {
  if (a.analysisStatus === "failed") return false;
  const st = a.analysisStatus ?? "analyzed";
  return st === "analyzed" || st === "pending" || st === "queued" || st === "analyzing";
}
