"use client";

import React from "react";
import { BRAND_KIT_INGEST_SECTION_ORDER } from "@/lib/brandkit/ingest/types";
import type { BrandKitSectionPreview } from "@/lib/brandkit/ingest/types";
import type { ConsolidatedRowState } from "@/lib/brandkit/ingest/consolidated-registry";
import {
  STUDIO_INGEST_SECTION_LABELS,
  shouldShowStudioConsolidated,
  type BrandKitStudioIngestFeedback,
  type StudioSectionRowState,
} from "@/lib/brandkit/studio/studio-ingest-feedback";
import { BrandKitMediaImage } from "./BrandKitMediaImage";

function FineSpinner() {
  return (
    <svg
      aria-hidden
      className="brandKit-split-ingest__spinner"
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

function SectionPreview({ preview }: { preview?: BrandKitSectionPreview }) {
  if (!preview) return null;
  if (preview.kind === "palette") {
    return (
      <div className="brandKit-split-ingest__swatches">
        {preview.swatches.slice(0, 5).map((hex, idx) => (
          <span key={`${hex}-${idx}`} className="brandKit-split-ingest__swatch" style={{ backgroundColor: hex }} />
        ))}
      </div>
    );
  }
  if (preview.kind === "logo") {
    return (
      <BrandKitMediaImage
        src={preview.imageUrl}
        alt=""
        className="brandKit-split-ingest__logo-thumb"
        eager
      />
    );
  }
  if (preview.kind === "typography") {
    return <span className="brandKit-split-ingest__meta">{preview.family}</span>;
  }
  if (preview.kind === "visual") {
    return <span className="brandKit-split-ingest__meta">{preview.count}</span>;
  }
  return <span className="brandKit-split-ingest__meta">{preview.traits.slice(0, 2).join(" · ")}</span>;
}

function StatusMark({ status }: { status: ConsolidatedRowState["status"] | StudioSectionRowState["status"] }) {
  if (status === "running") return <FineSpinner />;
  if (status === "resolved" || status === "proposed" || status === "crowned") {
    return <span className="brandKit-split-ingest__mark">✓</span>;
  }
  if (status === "error") return <span className="brandKit-split-ingest__mark">—</span>;
  return <span className="brandKit-split-ingest__mark brandKit-split-ingest__mark--idle">·</span>;
}

type BrandKitStudioIngestFeedbackProps = {
  feedback: BrandKitStudioIngestFeedback;
};

export function BrandKitStudioIngestFeedback({ feedback }: BrandKitStudioIngestFeedbackProps) {
  const showConsolidated = shouldShowStudioConsolidated(feedback);
  const activity = feedback.activity;

  if (!showConsolidated && !activity?.active) return null;

  return (
    <section className="brandKit-split-ingest" aria-label="Estado de ingesta">
      {showConsolidated ? (
        <div className="brandKit-split-ingest__block">
          <p className="brandKit-split-ingest__title">tu adn · consolidado</p>
          <ul className="brandKit-split-ingest__list">
            {BRAND_KIT_INGEST_SECTION_ORDER.map((id) => {
              const row = feedback.consolidated[id];
              const empty = row.status === "empty";
              return (
                <li
                  key={id}
                  className={`brandKit-split-ingest__row${empty ? " is-empty" : ""}`}
                >
                  <span className="brandKit-split-ingest__status">
                    <StatusMark status={row.status} />
                  </span>
                  <span className="brandKit-split-ingest__label">{STUDIO_INGEST_SECTION_LABELS[id]}</span>
                  {!empty ? <SectionPreview preview={row.preview} /> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {activity?.active ? (
        <div className="brandKit-split-ingest__block brandKit-split-ingest__block--live">
          <p className="brandKit-split-ingest__title">ingesta en curso</p>
          {activity.statusLine ? (
            <p className="brandKit-split-ingest__status-line">{activity.statusLine}</p>
          ) : null}
          <ul className="brandKit-split-ingest__list">
            {BRAND_KIT_INGEST_SECTION_ORDER.map((id) => {
              const row = activity.sections[id];
              const idle = row.status === "pending";
              return (
                <li
                  key={id}
                  className={`brandKit-split-ingest__row${idle ? " is-empty" : ""}${row.status === "running" ? " is-running" : ""}`}
                >
                  <span className="brandKit-split-ingest__status">
                    <StatusMark status={row.status} />
                  </span>
                  <div className="brandKit-split-ingest__row-body">
                    <span className="brandKit-split-ingest__label">{STUDIO_INGEST_SECTION_LABELS[id]}</span>
                    {row.runningLabel && row.status === "running" ? (
                      <span className="brandKit-split-ingest__running">{row.runningLabel}</span>
                    ) : null}
                  </div>
                  {row.preview ? <SectionPreview preview={row.preview} /> : null}
                </li>
              );
            })}
          </ul>
          {activity.llmSkippedReason ? (
            <p className="brandKit-split-ingest__note">{activity.llmSkippedReason}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
