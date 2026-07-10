"use client";

import React from "react";
import type { GenomaDocument } from "@/lib/genoma/genoma-types";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import { summarizeGenomaBoard } from "@/lib/genoma/genoma-board-status";
import { countPendingGenomaConflicts } from "@/lib/genoma/genoma-reconcile";
import { GenomaFoldderButton } from "./board-v2/GenomaFoldderButton";

type GenomaSidebarReviewProps = {
  doc: GenomaDocument;
  onStartReview?: () => void;
  reviewMode?: boolean;
};

export function GenomaSidebarReview({ doc, onStartReview, reviewMode = false }: GenomaSidebarReviewProps) {
  const summary = summarizeGenomaBoard(doc);
  const conflicts = countPendingGenomaConflicts(doc.slots);

  if (summary.needsYou === 0 && conflicts === 0) return null;

  return (
    <section className="genoma-sidebar-review" aria-label="Revisión pendiente">
      <p className="genoma-sidebar-review__title">
        {conflicts > 0
          ? genomaLocaleEs.sidebarReviewConflicts(conflicts)
          : genomaLocaleEs.sidebarReviewPending(summary.needsYou)}
      </p>
      <p className="genoma-sidebar-review__lead">{genomaLocaleEs.sidebarReviewLead}</p>
      {onStartReview ? (
        <GenomaFoldderButton onClick={onStartReview} disabled={reviewMode}>
          {genomaLocaleEs.reviewAskButton(summary.needsYou)}
        </GenomaFoldderButton>
      ) : null}
    </section>
  );
}

type GenomaSidebarReadyProps = {
  doc: GenomaDocument;
};

export function GenomaSidebarReady({ doc }: GenomaSidebarReadyProps) {
  const summary = summarizeGenomaBoard(doc);
  if (summary.sources === 0) return null;

  return (
    <section className="genoma-sidebar-ready" role="status">
      <p className="genoma-sidebar-ready__title">{genomaLocaleEs.boardReady}</p>
      <p className="genoma-sidebar-ready__meta">
        {genomaLocaleEs.sidebarReadyMeta(summary.locked, summary.sources)}
      </p>
    </section>
  );
}

type GenomaSidebarConflictBannerProps = {
  doc: GenomaDocument;
  onStartReview?: () => void;
  reviewMode?: boolean;
};

export function GenomaSidebarConflictBanner({
  doc,
  onStartReview,
  reviewMode = false,
}: GenomaSidebarConflictBannerProps) {
  const conflicts = countPendingGenomaConflicts(doc.slots);
  if (!conflicts) return null;

  return (
    <div className="genoma-sidebar-conflict" role="alert">
      <p className="genoma-sidebar-conflict__text">{genomaLocaleEs.conflictsPending(conflicts)}</p>
      {onStartReview ? (
        <GenomaFoldderButton onClick={onStartReview} disabled={reviewMode}>
          {genomaLocaleEs.reviewAskButton(conflicts)}
        </GenomaFoldderButton>
      ) : null}
    </div>
  );
}
