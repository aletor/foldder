"use client";

import React from "react";
import type { BrandKitDocument } from "@/lib/brandkit/brand-kit-types";
import { computeBrandKitCompleteness } from "@/lib/brandkit/brand-kit-defaults";
import {
  brandKitBoardActionItems,
  summarizeBrandKitBoard,
} from "@/lib/brandkit/brand-kit-board-status";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import { authoritativeSourceLabel } from "@/lib/brandkit/brand-kit-source-policy";
import { scrollToBrandKitBoardSlot } from "./board-v2/brand-kit-board-scroll";
import { BrandKitFoldderButton } from "./board-v2/BrandKitFoldderButton";

type BrandKitSidebarOverviewProps = {
  doc: BrandKitDocument;
  isAnalyzing?: boolean;
  presentationMode?: boolean;
  onPresentationModeChange?: (enabled: boolean) => void;
  onBrandNameChange?: (name: string) => void;
  onStartReview?: () => void;
  reviewMode?: boolean;
};

function scrollToFirstAction(
  doc: BrandKitDocument,
  kind: "conflict" | "candidates" | "pending",
): void {
  const item = brandKitBoardActionItems(doc).find((entry) => entry.kind === kind);
  if (item) scrollToBrandKitBoardSlot(item.slotId);
}

export function BrandKitSidebarOverview({
  doc,
  isAnalyzing = false,
  presentationMode = false,
  onPresentationModeChange,
  onBrandNameChange,
  onStartReview,
  reviewMode = false,
}: BrandKitSidebarOverviewProps) {
  const completeness = computeBrandKitCompleteness(doc);
  const summary = summarizeBrandKitBoard(doc);
  const authoritative = authoritativeSourceLabel(doc.sources);
  const brand = doc.brandName?.value?.trim() || "Marca";

  if (summary.sources === 0 && summary.resolved === 0 && !isAnalyzing) return null;

  return (
    <section className="brandKit-sidebar-overview" aria-label="Estado del ADN">
      <div className="brandKit-sidebar-overview__head">
        {onBrandNameChange ? (
          <input
            className="brandKit-sidebar-overview__brand"
            value={brand}
            aria-label="Nombre de marca"
            onChange={(event) => onBrandNameChange(event.target.value)}
          />
        ) : (
          <p className="brandKit-sidebar-overview__brand brandKit-sidebar-overview__brand--static">{brand}</p>
        )}
        <p className="brandKit-sidebar-overview__adn">{completeness.percent}% ADN</p>
      </div>

      {isAnalyzing ? (
        <p className="brandKit-sidebar-overview__line brandKit-sidebar-overview__line--live">
          <span className="brandKit-split-status__dot" aria-hidden />
          {brandKitLocaleEs.analyzingLive}
        </p>
      ) : null}

      <div className="brandKit-sidebar-overview__meta">
        {summary.sources > 0 ? (
          <span className="brandKit-sidebar-overview__tag">
            {summary.sources} {summary.sources === 1 ? "fuente" : "fuentes"}
          </span>
        ) : null}
        {summary.locked > 0 ? (
          <span className="brandKit-sidebar-overview__tag brandKit-sidebar-overview__tag--locked">
            {brandKitLocaleEs.lockedBlocksHint(summary.locked)}
          </span>
        ) : null}
        {summary.conflicts > 0 ? (
          <button
            type="button"
            className="brandKit-sidebar-overview__tag brandKit-sidebar-overview__tag--warn"
            onClick={() => scrollToFirstAction(doc, "conflict")}
          >
            {brandKitLocaleEs.conflictsPending(summary.conflicts)}
          </button>
        ) : null}
        {summary.candidates > 0 ? (
          <button
            type="button"
            className="brandKit-sidebar-overview__tag brandKit-sidebar-overview__tag--accent"
            onClick={() => scrollToFirstAction(doc, "candidates")}
          >
            {brandKitLocaleEs.candidatesBoardHint(summary.candidates)}
          </button>
        ) : null}
        {authoritative ? (
          <span className="brandKit-sidebar-overview__tag">
            {brandKitLocaleEs.authoritativeSource}: {authoritative}
          </span>
        ) : null}
      </div>

      {summary.needsYou === 0 && summary.resolved > 0 ? (
        <p className="brandKit-sidebar-overview__ready">{brandKitLocaleEs.boardReady}</p>
      ) : null}

      {onPresentationModeChange ? (
        <label className="brandKit-sidebar-overview__toggle" title={brandKitLocaleEs.presentationModeHint}>
          <input
            type="checkbox"
            checked={presentationMode}
            onChange={(event) => onPresentationModeChange(event.target.checked)}
          />
          <span>{brandKitLocaleEs.presentationMode}</span>
        </label>
      ) : null}

      {summary.needsYou > 0 && onStartReview ? (
        <BrandKitFoldderButton compact onClick={onStartReview} disabled={reviewMode || isAnalyzing}>
          {brandKitLocaleEs.reviewAskButton(summary.needsYou)}
        </BrandKitFoldderButton>
      ) : null}
    </section>
  );
}
