"use client";

import React from "react";
import type { GenomaDocument } from "@/lib/genoma/genoma-types";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import { genomaBoardActionItems, slotLabel, summarizeGenomaBoard } from "@/lib/genoma/genoma-board-status";
import { countPendingGenomaConflicts } from "@/lib/genoma/genoma-reconcile";
import { scrollToGenomaBoardSlot } from "./board-v2/genoma-board-scroll";
import { GenomaFoldderButton } from "./board-v2/GenomaFoldderButton";

type GenomaSidebarReviewProps = {
  doc: GenomaDocument;
};

export function GenomaSidebarReview({ doc }: GenomaSidebarReviewProps) {
  const summary = summarizeGenomaBoard(doc);
  const actions = genomaBoardActionItems(doc);
  const conflicts = countPendingGenomaConflicts(doc.slots);

  if (!actions.length && conflicts === 0) return null;

  return (
    <section className="genoma-sidebar-review" aria-label="Revisión pendiente">
      <p className="genoma-sidebar-review__title">
        {conflicts > 0
          ? genomaLocaleEs.sidebarReviewConflicts(conflicts)
          : genomaLocaleEs.sidebarReviewPending(summary.needsYou)}
      </p>
      <p className="genoma-sidebar-review__lead">{genomaLocaleEs.sidebarReviewLead}</p>

      <ul className="genoma-sidebar-review__list">
        {actions.map((item) => (
          <li key={item.slotId}>
            <button
              type="button"
              className={`genoma-sidebar-review__link genoma-sidebar-review__link--${item.kind}`}
              onClick={() => scrollToGenomaBoardSlot(item.slotId)}
            >
              <span>{slotLabel(item.slotId)}</span>
              <span className="genoma-sidebar-review__go">{genomaLocaleEs.sidebarReviewGo}</span>
            </button>
          </li>
        ))}
      </ul>
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
};

export function GenomaSidebarConflictBanner({ doc }: GenomaSidebarConflictBannerProps) {
  const conflicts = countPendingGenomaConflicts(doc.slots);
  if (!conflicts) return null;

  const first = genomaBoardActionItems(doc).find((item) => item.kind === "conflict");
  if (!first) return null;

  return (
    <div className="genoma-sidebar-conflict" role="alert">
      <p className="genoma-sidebar-conflict__text">{genomaLocaleEs.conflictsPending(conflicts)}</p>
      <GenomaFoldderButton variant="muted" onClick={() => scrollToGenomaBoardSlot(first.slotId)}>
        {genomaLocaleEs.reconcileOpenBlock(slotLabel(first.slotId))}
      </GenomaFoldderButton>
    </div>
  );
}
