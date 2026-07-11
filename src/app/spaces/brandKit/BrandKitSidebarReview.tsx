"use client";

import React from "react";
import type { BrandKitDocument } from "@/lib/brandkit/brand-kit-types";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import { summarizeBrandKitBoard } from "@/lib/brandkit/brand-kit-board-status";
import { countPendingBrandKitConflicts } from "@/lib/brandkit/brand-kit-reconcile";
import { BrandKitFoldderButton } from "./board-v2/BrandKitFoldderButton";

type BrandKitSidebarReviewProps = {
  doc: BrandKitDocument;
  onStartReview?: () => void;
  reviewMode?: boolean;
};

export function BrandKitSidebarReview({ doc, onStartReview, reviewMode = false }: BrandKitSidebarReviewProps) {
  const summary = summarizeBrandKitBoard(doc);
  const conflicts = countPendingBrandKitConflicts(doc.slots);

  if (summary.needsYou === 0 && conflicts === 0) return null;

  return (
    <section className="brandKit-sidebar-review" aria-label="Revisión pendiente">
      <p className="brandKit-sidebar-review__title">
        {conflicts > 0
          ? brandKitLocaleEs.sidebarReviewConflicts(conflicts)
          : brandKitLocaleEs.sidebarReviewPending(summary.needsYou)}
      </p>
      <p className="brandKit-sidebar-review__lead">{brandKitLocaleEs.sidebarReviewLead}</p>
      {onStartReview ? (
        <BrandKitFoldderButton onClick={onStartReview} disabled={reviewMode}>
          {brandKitLocaleEs.reviewAskButton(summary.needsYou)}
        </BrandKitFoldderButton>
      ) : null}
    </section>
  );
}

type BrandKitSidebarReadyProps = {
  doc: BrandKitDocument;
};

export function BrandKitSidebarReady({ doc }: BrandKitSidebarReadyProps) {
  const summary = summarizeBrandKitBoard(doc);
  if (summary.sources === 0) return null;

  return (
    <section className="brandKit-sidebar-ready" role="status">
      <p className="brandKit-sidebar-ready__title">{brandKitLocaleEs.boardReady}</p>
      <p className="brandKit-sidebar-ready__meta">
        {brandKitLocaleEs.sidebarReadyMeta(summary.locked, summary.sources)}
      </p>
    </section>
  );
}

type BrandKitSidebarConflictBannerProps = {
  doc: BrandKitDocument;
  onStartReview?: () => void;
  reviewMode?: boolean;
};

export function BrandKitSidebarConflictBanner({
  doc,
  onStartReview,
  reviewMode = false,
}: BrandKitSidebarConflictBannerProps) {
  const conflicts = countPendingBrandKitConflicts(doc.slots);
  if (!conflicts) return null;

  return (
    <div className="brandKit-sidebar-conflict" role="alert">
      <p className="brandKit-sidebar-conflict__text">{brandKitLocaleEs.conflictsPending(conflicts)}</p>
      {onStartReview ? (
        <BrandKitFoldderButton onClick={onStartReview} disabled={reviewMode}>
          {brandKitLocaleEs.reviewAskButton(conflicts)}
        </BrandKitFoldderButton>
      ) : null}
    </div>
  );
}
