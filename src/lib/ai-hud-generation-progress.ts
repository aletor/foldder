/**
 * Progreso del HUD por nodo — delega en `ai-active-jobs`.
 * @see aiActiveJobStartNode / aiActiveJobProgressNode / aiActiveJobEndNode
 */

import {
  aiActiveJobEndNode,
  aiActiveJobProgressNode,
  aiActiveJobStartNode,
  getActiveAiJobProgressForNode,
  getActiveAiJobsSnapshot,
  subscribeActiveAiJobs,
} from "@/lib/ai-active-jobs";

export function aiHudNanoBananaJobStart(nodeId: string) {
  aiActiveJobStartNode(nodeId, "Image Creation");
}

export function aiHudNanoBananaJobProgress(nodeId: string, pct: number) {
  aiActiveJobProgressNode(nodeId, pct);
}

export function aiHudNanoBananaJobEnd(nodeId: string) {
  aiActiveJobEndNode(nodeId);
}

/** @deprecated Usar getActiveAiJobProgressForNode */
export function setAiHudGenerationProgress(value: number | null) {
  if (value === null) return;
}

/** @deprecated Usar getActiveAiJobsSnapshot en AiRequestHud */
export function getAiHudGenerationProgressSnapshot(): number | null {
  const jobs = getActiveAiJobsSnapshot();
  const withPct = jobs.filter((j) => j.pct != null);
  if (withPct.length === 0) return null;
  return withPct[withPct.length - 1]?.pct ?? null;
}

export function getAiHudNanoBananaJobProgressForNode(nodeId: string): number | null {
  return getActiveAiJobProgressForNode(nodeId);
}

export function subscribeAiHudGenerationProgress(listener: () => void) {
  return subscribeActiveAiJobs(listener);
}
