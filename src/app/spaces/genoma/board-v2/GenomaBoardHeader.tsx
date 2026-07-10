"use client";

import React from "react";
import type { GenomaDocument } from "@/lib/genoma/genoma-types";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import { computeGenomaCompleteness } from "@/lib/genoma/genoma-defaults";
import { summarizeGenomaBoard } from "@/lib/genoma/genoma-board-status";

type GenomaBoardHeaderProps = {
  doc: GenomaDocument;
  onBrandNameChange?: (name: string) => void;
  presentationMode?: boolean;
  onPresentationModeChange?: (enabled: boolean) => void;
  needsYou?: number;
  onStartReview?: () => void;
};

export function GenomaBoardHeader({
  doc,
  onBrandNameChange,
  presentationMode = false,
  onPresentationModeChange,
  needsYou = 0,
  onStartReview,
}: GenomaBoardHeaderProps) {
  const completeness = computeGenomaCompleteness(doc);
  const summary = summarizeGenomaBoard(doc);
  const brand = doc.brandName?.value ?? "Marca";

  return (
    <header className="genoma-v2-header">
      <div className="genoma-v2-header__brand">
        <input
          className="genoma-v2-header__title"
          value={brand}
          aria-label="Nombre de marca"
          onChange={(event) => onBrandNameChange?.(event.target.value)}
        />
        <span className="genoma-v2-header__completeness">{completeness.percent}% ADN</span>
      </div>
      <div className="genoma-v2-header__actions">
        {needsYou > 0 && onStartReview ? (
          <button
            type="button"
            className="genoma-v2-header__review-cta"
            disabled={presentationMode}
            onClick={onStartReview}
          >
            {genomaLocaleEs.reviewAskButton(needsYou)}
          </button>
        ) : needsYou === 0 && summary.resolved > 0 ? (
          <span className="genoma-v2-header__ready">{genomaLocaleEs.boardReady}</span>
        ) : null}
        {onPresentationModeChange ? (
          <label className="genoma-v2-header__presentation" title={genomaLocaleEs.presentationModeHint}>
            <input
              type="checkbox"
              checked={presentationMode}
              onChange={(event) => onPresentationModeChange(event.target.checked)}
            />
            <span>{genomaLocaleEs.presentationMode}</span>
          </label>
        ) : null}
      </div>
    </header>
  );
}
