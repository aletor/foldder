import type { Provenance, SlotId, SlotState } from "../genoma-types";

export type GenomaCrawlPhaseId = "connect" | "crawl" | "visual" | "copy" | "llm" | "finalize";

export type GenomaLlmStepId = "voice" | "values" | "oneliner" | "logo_vision" | "pdf_logo_vision" | "batch";

export type GenomaLlmBatchSubstep = "essence" | "voice" | "visualWorld";

export type GenomaStreamEvent =
  | { type: "progress"; message: string; phase?: GenomaCrawlPhaseId; step?: number; totalSteps?: number }
  | { type: "page_fetched"; url: string; pageIndex: number; pageTotal: number }
  | { type: "phase_complete"; phase: GenomaCrawlPhaseId }
  | { type: "llm_status"; status: "running" | "skipped" | "done"; reason?: string }
  | {
      type: "llm_progress";
      step: GenomaLlmStepId;
      substep?: GenomaLlmBatchSubstep;
      status: "running" | "done" | "skipped" | "failed";
      detail?: string;
    }
  | { type: "brand_name"; value: string; provenance: Provenance }
  | { type: "slot_update"; slotId: SlotId; patch: Partial<SlotState<unknown>> }
  | {
      type: "source_added";
      kind: "url" | "file";
      ref: string;
      contentSha256?: string;
      pdfStorageKey?: string;
      pageCount?: number;
    }
  | { type: "triage_plan"; items: { name: string; kind: string; action: string }[] }
  | { type: "done"; jobId: string }
  | { type: "error"; message: string };

export type CrawlPageSnapshot = {
  url: string;
  html: string;
  cssTexts: string[];
};

export type LogoCandidateSignal = {
  url: string;
  score: number;
  provenance: Provenance;
  format: "svg" | "png" | "jpg" | "webp" | "ico";
  widthHint?: number;
  heightHint?: number;
};

export type CrawlBudget = {
  maxPages: number;
  maxMs: number;
  maxBytes: number;
  maxAssetBytes: number;
};

export const DEFAULT_CRAWL_BUDGET: CrawlBudget = {
  maxPages: 12,
  maxMs: 120_000,
  maxAssetBytes: 15 * 1024 * 1024,
  maxBytes: 80 * 1024 * 1024,
};

export const GENOMA_CRAWL_USER_AGENT = "FoldderBot/1.0 (+https://foldder.com/bot)";
