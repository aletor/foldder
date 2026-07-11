"use client";

import React from "react";
import type { BrandKitCrawlPhaseId, BrandKitLlmStepId, BrandKitStreamEvent } from "@/lib/brandkit/crawl/types";
import type { SlotId } from "@/lib/brandkit/brand-kit-types";
import { BRAND_KIT_SLOT_LABELS } from "@/lib/brandkit/brand-kit-types";

export type BrandKitCrawlProgressState = {
  phase: BrandKitCrawlPhaseId;
  message: string;
  step: number;
  totalSteps: number;
  pages: { url: string; pathname: string }[];
  llmStatus?: "running" | "skipped" | "done";
  llmReason?: string;
  llmSteps: Partial<Record<BrandKitLlmStepId, "running" | "done" | "skipped" | "failed">>;
  triagePlan?: { name: string; kind: string; action: string }[];
  resolvedSlots: Set<SlotId>;
  activeSlot?: SlotId;
};

const LLM_STEP_LABELS: Record<BrandKitLlmStepId, string> = {
  logo_vision: "Logo (visión)",
  logo_crop_verify: "Verificando recorte del logo",
  pdf_logo_vision: "Logo (deck PDF)",
  pdf_brand_vision: "Manual de marca (PDF)",
  brand_board_vision: "Brand board (imagen)",
  document_probe: "Documento (probe)",
  voice: "Voz",
  values: "Creencias",
  oneliner: "Headline",
  batch: "ADN (batch)",
};

const BATCH_SUBSTEP_LABELS: Record<import("@/lib/brandkit/crawl/types").BrandKitLlmBatchSubstep, string> = {
  essence: "Esencia",
  voice: "Voz",
  visualWorld: "Mundo visual",
};

const PHASES: { id: BrandKitCrawlPhaseId; label: string }[] = [
  { id: "connect", label: "Conectar" },
  { id: "crawl", label: "Explorar web" },
  { id: "visual", label: "Visual" },
  { id: "copy", label: "Texto" },
  { id: "llm", label: "IA" },
  { id: "finalize", label: "Listo" },
];

export function createInitialCrawlProgress(): BrandKitCrawlProgressState {
  return {
    phase: "connect",
    message: "Conectando…",
    step: 0,
    totalSteps: 6,
    pages: [],
    llmSteps: {},
    resolvedSlots: new Set(),
  };
}

function pathnameFromUrl(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
}

export function reduceCrawlProgress(state: BrandKitCrawlProgressState, event: BrandKitStreamEvent): BrandKitCrawlProgressState {
  if (event.type === "progress") {
    return {
      ...state,
      phase: event.phase ?? state.phase,
      message: event.message,
      step: event.step ?? state.step,
      totalSteps: event.totalSteps ?? state.totalSteps,
    };
  }

  if (event.type === "page_fetched") {
    const pathname = pathnameFromUrl(event.url);
    if (state.pages.some((page) => page.url === event.url)) return state;
    return {
      ...state,
      phase: "crawl",
      pages: [...state.pages, { url: event.url, pathname }],
      message: `Página ${event.pageIndex}/${event.pageTotal}: ${pathname}`,
    };
  }

  if (event.type === "triage_plan") {
    return {
      ...state,
      phase: "connect",
      triagePlan: event.items,
      message: `Plan: ${event.items.length} archivo${event.items.length === 1 ? "" : "s"}`,
    };
  }

  if (event.type === "llm_progress") {
    const message =
      event.step === "batch" && event.substep
        ? `${BATCH_SUBSTEP_LABELS[event.substep]}: ${event.detail ?? ""}`.trim()
        : (event.detail ?? LLM_STEP_LABELS[event.step]);
    return {
      ...state,
      phase: event.status === "running" ? "llm" : state.phase,
      llmSteps: { ...state.llmSteps, [event.step]: event.status },
      message,
    };
  }

  if (event.type === "llm_status") {
    return {
      ...state,
      phase: event.status === "running" ? "llm" : state.phase,
      llmStatus: event.status,
      llmReason: event.reason,
      message:
        event.status === "running"
          ? "Sintetizando voz y valores con IA…"
          : event.status === "skipped"
            ? event.reason ?? "IA omitida"
            : "IA completada",
    };
  }

  if (event.type === "slot_update") {
    const nextResolved = new Set(state.resolvedSlots);
    const status = event.patch.status;
    if (status && status !== "pending") {
      nextResolved.add(event.slotId);
    }
    const logoValue = event.slotId === "logo" ? (event.patch.value as { previewUrl?: string } | undefined) : undefined;
    const logoReady = event.slotId === "logo" && Boolean(logoValue?.previewUrl);
    return {
      ...state,
      activeSlot: status === "pending" ? event.slotId : state.activeSlot,
      resolvedSlots: nextResolved,
      phase: logoReady ? "visual" : state.phase,
      message: logoReady ? "Logo recortado listo" : status === "pending" ? `Analizando ${BRAND_KIT_SLOT_LABELS[event.slotId]}…` : state.message,
    };
  }

  if (event.type === "phase_complete") {
    return { ...state, phase: event.phase };
  }

  if (event.type === "done") {
    return { ...state, phase: "finalize", step: state.totalSteps, message: "ADN listo" };
  }

  return state;
}

type BrandKitCrawlProgressProps = {
  progress: BrandKitCrawlProgressState;
  compact?: boolean;
};

export function BrandKitCrawlProgress({ progress, compact = false }: BrandKitCrawlProgressProps) {
  const percent = Math.min(100, Math.round((progress.step / Math.max(progress.totalSteps, 1)) * 100));

  return (
    <div className="brandKit-crawl-progress" role="status" aria-live="polite">
      <div className="brandKit-crawl-progress__header">
        <div className="brandKit-crawl-progress__title">{progress.message}</div>
        <div className="brandKit-crawl-progress__percent">{percent}%</div>
      </div>

      <div className="brandKit-crawl-progress__bar" aria-hidden>
        <div className="brandKit-crawl-progress__bar-fill" style={{ width: `${percent}%` }} />
      </div>

      {compact ? (
        <div className="brandKit-crawl-progress__compact-phases" aria-hidden>
          {PHASES.map((phase) => {
            const phaseIndex = PHASES.findIndex((item) => item.id === phase.id);
            const currentIndex = PHASES.findIndex((item) => item.id === progress.phase);
            const done = phaseIndex < currentIndex || progress.phase === "finalize";
            const active = phase.id === progress.phase;
            return (
              <span
                key={phase.id}
                className={`brandKit-crawl-progress__compact-dot${done ? " is-done" : ""}${active ? " is-active" : ""}`}
                title={phase.label}
              />
            );
          })}
        </div>
      ) : (
        <>
          <div className="brandKit-crawl-progress__phases">
            {PHASES.map((phase) => {
              const phaseIndex = PHASES.findIndex((item) => item.id === phase.id);
              const currentIndex = PHASES.findIndex((item) => item.id === progress.phase);
              const done = phaseIndex < currentIndex || progress.phase === "finalize";
              const active = phase.id === progress.phase;
              return (
                <span
                  key={phase.id}
                  className={`brandKit-crawl-progress__phase${done ? " is-done" : ""}${active ? " is-active" : ""}`}
                >
                  {phase.label}
                </span>
              );
            })}
          </div>

          {progress.pages.length ? (
            <div className="brandKit-crawl-progress__pages">
              {progress.pages.slice(-4).map((page) => (
                <span key={page.url} className="brandKit-crawl-progress__page">
                  {page.pathname}
                </span>
              ))}
            </div>
          ) : null}

          {progress.triagePlan?.length ? (
            <div className="brandKit-crawl-progress__triage">
              {progress.triagePlan.map((item) => (
                <div key={item.name} className="brandKit-crawl-progress__triage-row">
                  <span>{item.name}</span>
                  <span>{item.action}</span>
                </div>
              ))}
            </div>
          ) : null}

          {progress.llmStatus === "skipped" && progress.llmReason ? (
            <div className="brandKit-crawl-progress__note">{progress.llmReason}</div>
          ) : null}

          {Object.keys(progress.llmSteps).length ? (
            <div className="brandKit-crawl-progress__llm-steps">
              {(Object.keys(LLM_STEP_LABELS) as BrandKitLlmStepId[]).map((stepId) => {
                const status = progress.llmSteps[stepId];
                if (!status) return null;
                const label = stepId === "batch" ? LLM_STEP_LABELS.batch : LLM_STEP_LABELS[stepId];
                return (
                  <span
                    key={stepId}
                    className={`brandKit-crawl-progress__llm-step is-${status}`}
                    title={progress.llmSteps[stepId]}
                  >
                    {label}
                  </span>
                );
              })}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
