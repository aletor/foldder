import type { BrandKitBoardMeta, BrandKitSourceType, SectionId } from "./types";
import type { BrandKitEvent } from "./run-event-adapter";
import {
  createRunId,
  emitAnalyzeRunCompleted,
  emitAnalyzeRunStarted,
  emitSectionUpdated,
} from "./run-event-adapter";
import { normalizeBrandKitBoardMeta } from "./interpretation";

export type BrandKitPipelinePhase = "idle" | "uploading" | "analyzing" | "vision" | "done" | "error";

export function derivePipelinePhase(input: {
  busy: boolean;
  detail: string;
  queued: number;
}): BrandKitPipelinePhase {
  if (!input.busy && input.queued === 0) return "idle";
  const detail = input.detail.toLowerCase();
  if (detail.includes("error") || detail.includes("fallo") || detail.includes("no se pudo")) return "error";
  if (detail.includes("visión") || detail.includes("vision") || detail.includes("referencias visuales")) {
    return "vision";
  }
  if (detail.includes("analiz") || detail.includes("fusionando") || detail.includes("estrategia")) {
    return "analyzing";
  }
  if (detail.includes("subiendo") || detail.includes("upload") || input.queued > 0) return "uploading";
  if (!input.busy) return "done";
  return "uploading";
}

export function sourceTypesFromPipelineDetail(detail: string): BrandKitSourceType[] {
  const d = detail.toLowerCase();
  const types = new Set<BrandKitSourceType>();
  if (d.includes("url")) types.add("url");
  if (d.includes("pdf") || d.includes("documento")) types.add("pdf");
  if (d.includes("imagen") || d.includes("looks") || d.includes("visión") || d.includes("vision")) types.add("image");
  if (d.includes("logo")) types.add("logo");
  if (types.size === 0) types.add("pdf");
  return [...types];
}

export function buildPipelineTransitionEvents(input: {
  previousPhase: BrandKitPipelinePhase;
  nextPhase: BrandKitPipelinePhase;
  runId: string;
  detail: string;
  boardMeta?: BrandKitBoardMeta;
}): BrandKitEvent[] {
  const events: BrandKitEvent[] = [];
  const review = normalizeBrandKitBoardMeta(input.boardMeta).review;

  if (input.nextPhase === "analyzing" && input.previousPhase !== "analyzing" && input.previousPhase !== "vision") {
    events.push(emitAnalyzeRunStarted(input.runId, sourceTypesFromPipelineDetail(input.detail)));
  }
  if (input.nextPhase === "vision" && input.previousPhase !== "vision") {
    events.push(emitAnalyzeRunStarted(input.runId, ["image"]));
  }

  if (input.nextPhase === "analyzing" && input.previousPhase === "analyzing") {
    const step = inferAnalyzeProgressStep(input.detail);
    if (step) events.push(emitSectionUpdated(input.runId, step.section, step.seq, step.final));
  }

  if (input.nextPhase === "error" && input.previousPhase !== "error") {
    events.push({
      type: "run.failed",
      runId: input.runId,
      code: "pipeline_error",
      message: input.detail || "Error en pipeline",
    });
  }

  const finished =
    (input.nextPhase === "idle" || input.nextPhase === "done") &&
    input.previousPhase !== "idle" &&
    input.previousPhase !== "done";
  if (finished) {
    events.push(emitAnalyzeRunCompleted(input.runId, review));
  }

  return events;
}

function inferAnalyzeProgressStep(detail: string): { section: SectionId; seq: number; final: boolean } | null {
  const d = detail.toLowerCase();
  if (d.includes("fusionando")) return { section: "messages", seq: 4, final: false };
  if (d.includes("estrategia")) return { section: "tone", seq: 5, final: true };
  if (d.includes("analizando conocimiento")) return { section: "palette", seq: 1, final: true };
  return null;
}

export function createPipelineRunId(): string {
  return createRunId("pipeline");
}
