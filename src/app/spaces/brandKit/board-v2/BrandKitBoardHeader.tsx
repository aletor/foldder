"use client";

import React from "react";
import type { BrandKitDocument } from "@/lib/brandkit/brand-kit-types";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import { computeBrandKitCompleteness } from "@/lib/brandkit/brand-kit-defaults";
import { summarizeBrandKitBoard } from "@/lib/brandkit/brand-kit-board-status";

type BrandKitBoardHeaderProps = {
  doc: BrandKitDocument;
  onBrandNameChange?: (name: string) => void;
  presentationMode?: boolean;
  onPresentationModeChange?: (enabled: boolean) => void;
  needsYou?: number;
  onStartReview?: () => void;
};

export function BrandKitBoardHeader({
  doc,
  onBrandNameChange,
  presentationMode = false,
  onPresentationModeChange,
  needsYou = 0,
  onStartReview,
}: BrandKitBoardHeaderProps) {
  const completeness = computeBrandKitCompleteness(doc);
  const summary = summarizeBrandKitBoard(doc);
  const brand = doc.brandName?.value ?? "Marca";

  return (
    <header className="brandKit-v2-header">
      <div className="brandKit-v2-header__brand">
        <input
          className="brandKit-v2-header__title"
          value={brand}
          aria-label="Nombre de marca"
          onChange={(event) => onBrandNameChange?.(event.target.value)}
        />
        <span className="brandKit-v2-header__completeness">{completeness.percent}% ADN</span>
      </div>
      <div className="brandKit-v2-header__actions">
        {needsYou > 0 && onStartReview ? (
          <button
            type="button"
            className="brandKit-v2-header__review-cta"
            disabled={presentationMode}
            onClick={onStartReview}
          >
            {brandKitLocaleEs.reviewAskButton(needsYou)}
          </button>
        ) : needsYou === 0 && summary.resolved > 0 ? (
          <span className="brandKit-v2-header__ready">{brandKitLocaleEs.boardReady}</span>
        ) : null}
        {onPresentationModeChange ? (
          <label className="brandKit-v2-header__presentation" title={brandKitLocaleEs.presentationModeHint}>
            <input
              type="checkbox"
              checked={presentationMode}
              onChange={(event) => onPresentationModeChange(event.target.checked)}
            />
            <span>{brandKitLocaleEs.presentationMode}</span>
          </label>
        ) : null}
      </div>
    </header>
  );
}
