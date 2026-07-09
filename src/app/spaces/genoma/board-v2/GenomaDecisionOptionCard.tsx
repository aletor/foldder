"use client";

import React from "react";
import { Check } from "lucide-react";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import type { ReconcileOptionDetail } from "@/lib/genoma/genoma-reconcile-ui";

function chipsSectionLabel(detail: ReconcileOptionDetail): string {
  if (detail.chipsLabel === "mood") return genomaLocaleEs.mood;
  if (detail.chipsLabel === "beliefs") return genomaLocaleEs.beliefs;
  return genomaLocaleEs.reconcileSectionDescriptors;
}

function bulletsSectionLabel(detail: ReconcileOptionDetail): string {
  if (detail.bulletsLabel === "rules") return genomaLocaleEs.writingRules;
  if (detail.bulletsLabel === "beliefs") return genomaLocaleEs.beliefs;
  return genomaLocaleEs.visualTerritory;
}

function fieldSectionLabel(key: string): string {
  if (key === "promise") return genomaLocaleEs.promise;
  if (key === "purpose") return genomaLocaleEs.purpose;
  if (key === "pov") return genomaLocaleEs.pov;
  return key;
}

export function GenomaDecisionOptionCard({
  mode = "select",
  optionLabel,
  sourceLabel,
  detail,
  distinctChips,
  distinctBullets,
  distinctTraits = new Set<string>(),
  distinctLimits = new Set<string>(),
  selected = false,
  onSelect,
}: {
  mode?: "select" | "preview";
  optionLabel: string;
  sourceLabel?: string;
  detail: ReconcileOptionDetail;
  distinctChips: Set<string>;
  distinctBullets: Set<string>;
  distinctTraits?: Set<string>;
  distinctLimits?: Set<string>;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const isPreview = mode === "preview";
  const className = `genoma-v2-reconcile__option${selected ? " is-selected" : ""}${isPreview ? " genoma-v2-reconcile__option--preview" : ""}`;

  const content = (
    <>
      <div className="genoma-v2-reconcile__option-head">
        <div className="genoma-v2-reconcile__option-titles">
          <span className="genoma-v2-reconcile__option-id">{optionLabel}</span>
          {sourceLabel ? (
            <span className="genoma-v2-reconcile__option-source">{genomaLocaleEs.reconcileFromSource(sourceLabel)}</span>
          ) : null}
        </div>
        {!isPreview ? (
          <span className="genoma-v2-reconcile__option-check" aria-hidden>
            {selected ? <Check size={14} strokeWidth={2.5} /> : null}
          </span>
        ) : null}
      </div>

      {detail.headline ? (
        <div className="genoma-v2-reconcile__section">
          <span className="genoma-v2-reconcile__section-label">{genomaLocaleEs.headlineDetected}</span>
          <p className="genoma-v2-reconcile__option-headline">«{detail.headline}»</p>
        </div>
      ) : null}

      {detail.summary ? (
        <div className="genoma-v2-reconcile__section">
          <span className="genoma-v2-reconcile__section-label">{genomaLocaleEs.reconcileSectionSummary}</span>
          <p className="genoma-v2-reconcile__option-summary">{detail.summary}</p>
          {detail.summaryIsSynthetic ? (
            <p className="genoma-v2-reconcile__option-note">{genomaLocaleEs.reconcileSyntheticSummary}</p>
          ) : null}
        </div>
      ) : !detail.headline ? (
        <div className="genoma-v2-reconcile__section">
          <span className="genoma-v2-reconcile__section-label">{genomaLocaleEs.reconcileSectionSummary}</span>
          <p className="genoma-v2-reconcile__option-empty">{genomaLocaleEs.reconcileNoSummary}</p>
        </div>
      ) : null}

      {detail.chips.length ? (
        <div className="genoma-v2-reconcile__section">
          <span className="genoma-v2-reconcile__section-label">{chipsSectionLabel(detail)}</span>
          <div className="genoma-v2-reconcile__option-chips">
            {detail.chips.map((chip) => (
              <span
                key={chip}
                className={`genoma-v2-chip${distinctChips.has(chip) ? " genoma-v2-chip--distinct" : ""}`}
              >
                {chip}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {detail.visualTraits?.length ? (
        <div className="genoma-v2-reconcile__section">
          <span className="genoma-v2-reconcile__section-label">{genomaLocaleEs.visualTerritory}</span>
          <ul className="genoma-v2-reconcile__rules">
            {detail.visualTraits.map((trait) => (
              <li
                key={trait}
                className={distinctTraits.has(trait) ? "genoma-v2-reconcile__rules-item--distinct" : undefined}
              >
                {trait}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {detail.limits?.length ? (
        <div className="genoma-v2-reconcile__section">
          <span className="genoma-v2-reconcile__section-label">{genomaLocaleEs.limits}</span>
          <ul className="genoma-v2-reconcile__rules genoma-v2-reconcile__rules--avoid">
            {detail.limits.map((limit) => (
              <li
                key={limit}
                className={distinctLimits.has(limit) ? "genoma-v2-reconcile__rules-item--distinct" : undefined}
              >
                {limit}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {detail.bullets.length ? (
        <div className="genoma-v2-reconcile__section">
          <span className="genoma-v2-reconcile__section-label">{bulletsSectionLabel(detail)}</span>
          <ul className="genoma-v2-reconcile__rules">
            {detail.bullets.map((bullet) => (
              <li
                key={bullet}
                className={distinctBullets.has(bullet) ? "genoma-v2-reconcile__rules-item--distinct" : undefined}
              >
                {bullet}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {detail.fields.map((field) => (
        <div key={field.label} className="genoma-v2-reconcile__section">
          <span className="genoma-v2-reconcile__section-label">{fieldSectionLabel(field.label)}</span>
          <p className="genoma-v2-reconcile__option-summary">{field.value}</p>
        </div>
      ))}

      {detail.avoid.length ? (
        <div className="genoma-v2-reconcile__section">
          <span className="genoma-v2-reconcile__section-label">{genomaLocaleEs.avoid}</span>
          <ul className="genoma-v2-reconcile__rules genoma-v2-reconcile__rules--avoid">
            {detail.avoid.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );

  if (isPreview) {
    return <div className={className}>{content}</div>;
  }

  return (
    <div
      role="radio"
      tabIndex={0}
      aria-checked={selected}
      className={className}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect?.();
        }
      }}
    >
      {content}
    </div>
  );
}
