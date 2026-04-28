import type { BrainStrategy } from "@/app/spaces/project-assets-metadata";
import { isTrustedRemoteVisionAnalysis } from "@/lib/brain/brain-brand-summary";
import type { BrainAnalysisOrigin, VisualSignalSourceId } from "./brain-creative-memory-types";
import { VISUAL_SIGNAL_SOURCE_PRIORITY } from "./brain-creative-memory-types";

export { VISUAL_SIGNAL_SOURCE_PRIORITY };

export function hasTrustedRemoteVisionAnalyses(strategy: BrainStrategy | undefined): boolean {
  const list = strategy?.visualReferenceAnalysis?.analyses ?? [];
  return list.some(isTrustedRemoteVisionAnalysis);
}

export function getBrainSignalPriority(origin: BrainAnalysisOrigin | undefined): number {
  const map: Record<BrainAnalysisOrigin, VisualSignalSourceId> = {
    manual: "manual",
    remote_ai: "remote_vision_analysis",
    local_heuristic: "local_heuristic",
    fallback: "fallback",
    mock: "mock",
  };
  const id = origin ? map[origin] : "fallback";
  const idx = VISUAL_SIGNAL_SOURCE_PRIORITY.indexOf(id as VisualSignalSourceId);
  return idx === -1 ? VISUAL_SIGNAL_SOURCE_PRIORITY.length : idx;
}

export function isReliableBrainSignal(origin: BrainAnalysisOrigin | undefined, confidence?: number): boolean {
  if (origin === "mock") return false;
  if (origin === "fallback") return typeof confidence === "number" && confidence >= 0.45;
  if (origin === "remote_ai" || origin === "manual") return true;
  if (origin === "local_heuristic") return typeof confidence === "number" && confidence >= 0.5;
  return false;
}

/** Resuelve conflicto textual conservando la señal de mayor prioridad (índice menor = más fuerte). */
export function mergeBrainSignalsWithPriority(prev: string, next: string, prevPri: number, nextPri: number): string {
  const a = (prev || "").trim();
  const b = (next || "").trim();
  if (!a) return b;
  if (!b) return a;
  if (nextPri < prevPri) return b;
  if (prevPri < nextPri) return a;
  return a.length >= b.length ? a : b;
}
