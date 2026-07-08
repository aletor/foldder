import type { SectionId } from "./types";
import type { BrandKitSourceType } from "./types";
import { affectedSections } from "./interpretation";

export type BrandKitEvent =
  | { type: "run.started"; runId: string; affected: SectionId[] }
  | {
      type: "section.updated";
      runId: string;
      section: SectionId;
      seq: number;
      final: boolean;
    }
  | { type: "run.completed"; runId: string; review: { pending: number; conflicts: number } }
  | { type: "run.failed"; runId: string; section?: SectionId; code: string; message: string };

export type BrandKitRunPhase = "analyze" | "reanalyze" | "upload";

export function createRunId(prefix = "bk"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function sectionsForSourceTypes(types: BrandKitSourceType[]): SectionId[] {
  const set = new Set<SectionId>();
  for (const t of types) {
    for (const s of affectedSections(t)) set.add(s);
  }
  return [...set];
}

/** Adaptador mínimo: fases de pipeline brain → eventos internos Brand Board. */
export function emitAnalyzeRunStarted(runId: string, sourceTypes: BrandKitSourceType[]): BrandKitEvent {
  return { type: "run.started", runId, affected: sectionsForSourceTypes(sourceTypes) };
}

export function emitAnalyzeRunCompleted(
  runId: string,
  review: { pending: number; conflicts: number },
): BrandKitEvent {
  return { type: "run.completed", runId, review };
}

export function emitSectionUpdated(runId: string, section: SectionId, seq: number, final = true): BrandKitEvent {
  return { type: "section.updated", runId, section, seq, final };
}

/** Traduce estado de job polling (futuro SSE) a eventos BrandKit. */
export function mapKnowledgePipelineStatusToEvent(input: {
  runId: string;
  status: "idle" | "uploading" | "analyzing" | "vision" | "done" | "error";
  errorMessage?: string;
}): BrandKitEvent | null {
  if (input.status === "analyzing") {
    return emitAnalyzeRunStarted(input.runId, ["pdf"]);
  }
  if (input.status === "vision") {
    return emitAnalyzeRunStarted(input.runId, ["image"]);
  }
  if (input.status === "done") {
    return emitAnalyzeRunCompleted(input.runId, { pending: 0, conflicts: 0 });
  }
  if (input.status === "error") {
    return {
      type: "run.failed",
      runId: input.runId,
      code: "pipeline_error",
      message: input.errorMessage ?? "Error en pipeline",
    };
  }
  return null;
}
