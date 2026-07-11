"use client";

import React from "react";
import { Check } from "lucide-react";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import type { ReconcileOptionDetail } from "@/lib/brandkit/brand-kit-reconcile-ui";

function chipsSectionLabel(detail: ReconcileOptionDetail): string {
  if (detail.chipsLabel === "mood") return brandKitLocaleEs.mood;
  if (detail.chipsLabel === "beliefs") return brandKitLocaleEs.beliefs;
  return brandKitLocaleEs.reconcileSectionDescriptors;
}

function bulletsSectionLabel(detail: ReconcileOptionDetail): string {
  if (detail.bulletsLabel === "rules") return brandKitLocaleEs.writingRules;
  if (detail.bulletsLabel === "beliefs") return brandKitLocaleEs.beliefs;
  return brandKitLocaleEs.visualTerritory;
}

function fieldSectionLabel(key: string): string {
  if (key === "promise") return brandKitLocaleEs.promise;
  if (key === "purpose") return brandKitLocaleEs.purpose;
  if (key === "pov") return brandKitLocaleEs.pov;
  return key;
}

export function BrandKitDecisionOptionCard({
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
  const className = `brandKit-v2-reconcile__option${selected ? " is-selected" : ""}${isPreview ? " brandKit-v2-reconcile__option--preview" : ""}`;

  const content = (
    <>
      <div className="brandKit-v2-reconcile__option-head">
        <div className="brandKit-v2-reconcile__option-titles">
          <span className="brandKit-v2-reconcile__option-id">{optionLabel}</span>
          {sourceLabel ? (
            <span className="brandKit-v2-reconcile__option-source">{brandKitLocaleEs.reconcileFromSource(sourceLabel)}</span>
          ) : null}
        </div>
        {!isPreview ? (
          <span className="brandKit-v2-reconcile__option-check" aria-hidden>
            {selected ? <Check size={14} strokeWidth={2.5} /> : null}
          </span>
        ) : null}
      </div>

      {detail.headline ? (
        <div className="brandKit-v2-reconcile__section">
          <span className="brandKit-v2-reconcile__section-label">{brandKitLocaleEs.headlineDetected}</span>
          <p className="brandKit-v2-reconcile__option-headline">«{detail.headline}»</p>
        </div>
      ) : null}

      {detail.summary ? (
        <div className="brandKit-v2-reconcile__section">
          <span className="brandKit-v2-reconcile__section-label">{brandKitLocaleEs.reconcileSectionSummary}</span>
          <p className="brandKit-v2-reconcile__option-summary">{detail.summary}</p>
          {detail.summaryIsSynthetic ? (
            <p className="brandKit-v2-reconcile__option-note">{brandKitLocaleEs.reconcileSyntheticSummary}</p>
          ) : null}
        </div>
      ) : !detail.headline ? (
        <div className="brandKit-v2-reconcile__section">
          <span className="brandKit-v2-reconcile__section-label">{brandKitLocaleEs.reconcileSectionSummary}</span>
          <p className="brandKit-v2-reconcile__option-empty">{brandKitLocaleEs.reconcileNoSummary}</p>
        </div>
      ) : null}

      {detail.chips.length ? (
        <div className="brandKit-v2-reconcile__section">
          <span className="brandKit-v2-reconcile__section-label">{chipsSectionLabel(detail)}</span>
          <div className="brandKit-v2-reconcile__option-chips">
            {detail.chips.map((chip) => (
              <span
                key={chip}
                className={`brandKit-v2-chip${distinctChips.has(chip) ? " brandKit-v2-chip--distinct" : ""}`}
              >
                {chip}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {detail.visualTraits?.length ? (
        <div className="brandKit-v2-reconcile__section">
          <span className="brandKit-v2-reconcile__section-label">{brandKitLocaleEs.visualTerritory}</span>
          <ul className="brandKit-v2-reconcile__rules">
            {detail.visualTraits.map((trait) => (
              <li
                key={trait}
                className={distinctTraits.has(trait) ? "brandKit-v2-reconcile__rules-item--distinct" : undefined}
              >
                {trait}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {detail.limits?.length ? (
        <div className="brandKit-v2-reconcile__section">
          <span className="brandKit-v2-reconcile__section-label">{brandKitLocaleEs.limits}</span>
          <ul className="brandKit-v2-reconcile__rules brandKit-v2-reconcile__rules--avoid">
            {detail.limits.map((limit) => (
              <li
                key={limit}
                className={distinctLimits.has(limit) ? "brandKit-v2-reconcile__rules-item--distinct" : undefined}
              >
                {limit}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {detail.bullets.length ? (
        <div className="brandKit-v2-reconcile__section">
          <span className="brandKit-v2-reconcile__section-label">{bulletsSectionLabel(detail)}</span>
          <ul className="brandKit-v2-reconcile__rules">
            {detail.bullets.map((bullet) => (
              <li
                key={bullet}
                className={distinctBullets.has(bullet) ? "brandKit-v2-reconcile__rules-item--distinct" : undefined}
              >
                {bullet}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {detail.fields.map((field) => (
        <div key={field.label} className="brandKit-v2-reconcile__section">
          <span className="brandKit-v2-reconcile__section-label">{fieldSectionLabel(field.label)}</span>
          <p className="brandKit-v2-reconcile__option-summary">{field.value}</p>
        </div>
      ))}

      {detail.avoid.length ? (
        <div className="brandKit-v2-reconcile__section">
          <span className="brandKit-v2-reconcile__section-label">{brandKitLocaleEs.avoid}</span>
          <ul className="brandKit-v2-reconcile__rules brandKit-v2-reconcile__rules--avoid">
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
