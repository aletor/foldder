import type { BrandKitCrawlProgressState } from "@/app/spaces/brandKit/BrandKitCrawlProgress";
import type { BrandKitDocument } from "../brand-kit-types";
import { brandKitBoardActionItems, summarizeBrandKitBoard } from "../brand-kit-board-status";
import { countPendingBrandKitConflicts } from "../brand-kit-reconcile";
import { isFirstBrandKitMaterial } from "../brand-kit-first-material";

export type BrandKitSidebarPhase = "empty" | "ingesting" | "review" | "ready";

export type SidebarIngestStepId =
  | "received"
  | "reading"
  | "logo"
  | "colorType"
  | "visual"
  | "text"
  | "done";

export type SidebarIngestStep = {
  id: SidebarIngestStepId;
  label: string;
  status: "pending" | "running" | "done";
};

const INGEST_STEP_DEFS: { id: SidebarIngestStepId; label: string }[] = [
  { id: "received", label: "Recibido" },
  { id: "reading", label: "Leyendo" },
  { id: "logo", label: "Logo" },
  { id: "colorType", label: "Color y tipo" },
  { id: "visual", label: "Imágenes" },
  { id: "text", label: "Texto" },
  { id: "done", label: "Listo" },
];

function sectionDone(progress: BrandKitCrawlProgressState, key: "logo" | "colorType" | "visual" | "text"): boolean {
  if (key === "logo") return progress.resolvedSlots.has("logo");
  if (key === "colorType") {
    return progress.resolvedSlots.has("palette") && progress.resolvedSlots.has("typography");
  }
  if (key === "visual") {
    return progress.resolvedSlots.has("visualWorld") || progress.resolvedSlots.has("gallery");
  }
  if (key === "text") {
    return progress.resolvedSlots.has("essence") || progress.resolvedSlots.has("voice");
  }
  return false;
}

function sectionRunning(progress: BrandKitCrawlProgressState, id: SidebarIngestStepId): boolean {
  if (id === "received") {
    return progress.phase === "connect" && !progress.triagePlan?.length && progress.step < 1;
  }
  if (id === "reading") {
    return (
      progress.phase === "connect" ||
      progress.phase === "crawl" ||
      progress.phase === "copy" ||
      (progress.phase === "visual" && !progress.resolvedSlots.has("logo"))
    );
  }
  if (id === "logo") {
    return progress.activeSlot === "logo" || (progress.phase === "visual" && !sectionDone(progress, "logo"));
  }
  if (id === "colorType") {
    return (
      progress.activeSlot === "palette" ||
      progress.activeSlot === "typography" ||
      (!sectionDone(progress, "colorType") &&
        sectionDone(progress, "logo") &&
        progress.phase !== "llm" &&
        progress.phase !== "finalize")
    );
  }
  if (id === "visual") {
    return (
      progress.activeSlot === "visualWorld" ||
      progress.activeSlot === "gallery" ||
      (sectionDone(progress, "colorType") && !sectionDone(progress, "visual") && progress.phase !== "llm")
    );
  }
  if (id === "text") {
    return (
      progress.phase === "llm" ||
      progress.activeSlot === "essence" ||
      progress.activeSlot === "voice" ||
      progress.llmStatus === "running"
    );
  }
  if (id === "done") {
    return progress.phase === "finalize";
  }
  return false;
}

function sectionComplete(progress: BrandKitCrawlProgressState, id: SidebarIngestStepId): boolean {
  if (id === "received") {
    return Boolean(progress.triagePlan?.length) || progress.step > 0 || progress.phase !== "connect";
  }
  if (id === "reading") {
    return (
      progress.resolvedSlots.size > 0 ||
      progress.phase === "visual" ||
      progress.phase === "llm" ||
      progress.phase === "finalize" ||
      sectionDone(progress, "logo")
    );
  }
  if (id === "logo") return sectionDone(progress, "logo");
  if (id === "colorType") return sectionDone(progress, "colorType");
  if (id === "visual") return sectionDone(progress, "visual");
  if (id === "text") {
    return (
      sectionDone(progress, "text") ||
      progress.llmStatus === "done" ||
      (progress.phase === "finalize" && !progress.llmStatus)
    );
  }
  if (id === "done") return progress.phase === "finalize";
  return false;
}

export function buildSidebarIngestSteps(progress: BrandKitCrawlProgressState): SidebarIngestStep[] {
  let foundRunning = false;
  return INGEST_STEP_DEFS.map((def) => {
    if (sectionComplete(progress, def.id)) {
      return { ...def, status: "done" as const };
    }
    if (!foundRunning && sectionRunning(progress, def.id)) {
      foundRunning = true;
      return { ...def, status: "running" as const };
    }
    return { ...def, status: "pending" as const };
  });
}

export function resolveBrandKitSidebarPhase(
  doc: BrandKitDocument,
  options: { isAnalyzing: boolean },
): BrandKitSidebarPhase {
  if (options.isAnalyzing) return "ingesting";
  const summary = summarizeBrandKitBoard(doc);
  if (summary.sources === 0) return "empty";
  const conflicts = countPendingBrandKitConflicts(doc.slots);
  const needsReview =
    conflicts > 0 || (!isFirstBrandKitMaterial(doc) && summary.needsYou > 0);
  if (needsReview) return "review";
  return "ready";
}

export function sidebarReviewActionItems(doc: BrandKitDocument) {
  return brandKitBoardActionItems(doc);
}

export function sidebarIngestPercent(progress: BrandKitCrawlProgressState): number {
  const steps = buildSidebarIngestSteps(progress);
  const done = steps.filter((s) => s.status === "done").length;
  const running = steps.some((s) => s.status === "running") ? 0.5 : 0;
  return Math.min(100, Math.round(((done + running) / steps.length) * 100));
}
