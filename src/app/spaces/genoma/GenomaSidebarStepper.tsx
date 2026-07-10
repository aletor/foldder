"use client";

import React from "react";
import type { GenomaCrawlProgressState } from "./GenomaCrawlProgress";
import {
  buildSidebarIngestSteps,
  sidebarIngestPercent,
  type SidebarIngestStep,
} from "@/lib/genoma/studio/sidebar-phase";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";

function StepMark({ status }: { status: SidebarIngestStep["status"] }) {
  if (status === "running") {
    return (
      <svg
        aria-hidden
        className="genoma-sidebar-stepper__spinner"
        width="14"
        height="14"
        viewBox="0 0 20 20"
        fill="none"
      >
        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.15" />
        <path d="M10 2a8 8 0 0 1 8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
      </svg>
    );
  }
  if (status === "done") return <span className="genoma-sidebar-stepper__mark is-done">✓</span>;
  return <span className="genoma-sidebar-stepper__mark">·</span>;
}

type GenomaSidebarStepperProps = {
  progress: GenomaCrawlProgressState;
};

export function GenomaSidebarStepper({ progress }: GenomaSidebarStepperProps) {
  const steps = buildSidebarIngestSteps(progress);
  const percent = sidebarIngestPercent(progress);

  return (
    <section className="genoma-sidebar-stepper" aria-label={genomaLocaleEs.sidebarIngestTitle} role="status">
      <div className="genoma-sidebar-stepper__hero">
        <span className="genoma-sidebar-stepper__dot" aria-hidden />
        <p className="genoma-sidebar-stepper__title">{genomaLocaleEs.sidebarIngestTitle}</p>
        <span className="genoma-sidebar-stepper__percent">{percent}%</span>
      </div>

      <div className="genoma-sidebar-stepper__bar" aria-hidden>
        <div className="genoma-sidebar-stepper__bar-fill" style={{ width: `${percent}%` }} />
      </div>

      {progress.message ? (
        <p className="genoma-sidebar-stepper__detail">{progress.message}</p>
      ) : null}

      <ol className="genoma-sidebar-stepper__list">
        {steps.map((step) => (
          <li
            key={step.id}
            className={`genoma-sidebar-stepper__row is-${step.status}`}
          >
            <span className="genoma-sidebar-stepper__status">
              <StepMark status={step.status} />
            </span>
            <span className="genoma-sidebar-stepper__label">{step.label}</span>
          </li>
        ))}
      </ol>

      {progress.llmStatus === "skipped" && progress.llmReason ? (
        <p className="genoma-sidebar-stepper__note">{progress.llmReason}</p>
      ) : null}
    </section>
  );
}
