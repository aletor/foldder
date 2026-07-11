import type { Provenance, SlotId, SlotState } from "../brand-kit-types";

export type BrandKitCrawlPhaseId = "connect" | "crawl" | "visual" | "copy" | "llm" | "finalize";

export type BrandKitLlmStepId =
  | "voice"
  | "values"
  | "oneliner"
  | "logo_vision"
  | "logo_crop_verify"
  | "pdf_logo_vision"
  | "pdf_brand_vision"
  | "brand_board_vision"
  | "document_probe"
  | "batch";

export type BrandKitLlmBatchSubstep = "essence" | "voice" | "visualWorld";

export type BrandKitStreamEvent =
  | { type: "progress"; message: string; phase?: BrandKitCrawlPhaseId; step?: number; totalSteps?: number }
  | { type: "page_fetched"; url: string; pageIndex: number; pageTotal: number }
  | { type: "phase_complete"; phase: BrandKitCrawlPhaseId }
  | { type: "llm_status"; status: "running" | "skipped" | "done"; reason?: string }
  | {
      type: "llm_progress";
      step: BrandKitLlmStepId;
      substep?: BrandKitLlmBatchSubstep;
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
  | { type: "source_error"; fileName: string; message: string }
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

export const BRAND_KIT_CRAWL_USER_AGENT = "FoldderBot/1.0 (+https://foldder.com/bot)";
