"use client";

import React from "react";
import type { BrandKitCrawlProgressState } from "./BrandKitCrawlProgress";
import {
  buildSidebarIngestSteps,
  sidebarIngestPercent,
  type SidebarIngestStep,
} from "@/lib/brandkit/studio/sidebar-phase";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";

function StepMark({ status }: { status: SidebarIngestStep["status"] }) {
  if (status === "running") {
    return (
      <svg
        aria-hidden
        className="brandKit-sidebar-stepper__spinner"
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
  if (status === "done") return <span className="brandKit-sidebar-stepper__mark is-done">✓</span>;
  return <span className="brandKit-sidebar-stepper__mark">·</span>;
}

type BrandKitSidebarStepperProps = {
  progress: BrandKitCrawlProgressState;
};

export function BrandKitSidebarStepper({ progress }: BrandKitSidebarStepperProps) {
  const steps = buildSidebarIngestSteps(progress);
  const percent = sidebarIngestPercent(progress);

  return (
    <section className="brandKit-sidebar-stepper" aria-label={brandKitLocaleEs.sidebarIngestTitle} role="status">
      <div className="brandKit-sidebar-stepper__hero">
        <span className="brandKit-sidebar-stepper__dot" aria-hidden />
        <p className="brandKit-sidebar-stepper__title">{brandKitLocaleEs.sidebarIngestTitle}</p>
        <span className="brandKit-sidebar-stepper__percent">{percent}%</span>
      </div>

      <div className="brandKit-sidebar-stepper__bar" aria-hidden>
        <div className="brandKit-sidebar-stepper__bar-fill" style={{ width: `${percent}%` }} />
      </div>

      {progress.message ? (
        <p className="brandKit-sidebar-stepper__detail">{progress.message}</p>
      ) : null}

      <ol className="brandKit-sidebar-stepper__list">
        {steps.map((step) => (
          <li
            key={step.id}
            className={`brandKit-sidebar-stepper__row is-${step.status}`}
          >
            <span className="brandKit-sidebar-stepper__status">
              <StepMark status={step.status} />
            </span>
            <span className="brandKit-sidebar-stepper__label">{step.label}</span>
          </li>
        ))}
      </ol>

      {progress.llmStatus === "skipped" && progress.llmReason ? (
        <p className="brandKit-sidebar-stepper__note">{progress.llmReason}</p>
      ) : null}
    </section>
  );
}
