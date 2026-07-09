"use client";

import React from "react";
import type { GenomaDocument } from "@/lib/genoma/genoma-types";
import { summarizeGenomaBoard } from "@/lib/genoma/genoma-board-status";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";

export function GenomaSidebarStatus({
  doc,
  isAnalyzing,
}: {
  doc: GenomaDocument;
  isAnalyzing?: boolean;
}) {
  const summary = summarizeGenomaBoard(doc);

  if (isAnalyzing) {
    return (
      <div className="genoma-split-status genoma-split-status--live" role="status">
        <span className="genoma-split-status__dot" aria-hidden />
        <span>{genomaLocaleEs.analyzingLive}</span>
      </div>
    );
  }

  if (summary.sources === 0) return null;

  return (
    <div className="genoma-split-status" role="status">
      {summary.conflicts > 0 ? (
        <p className="genoma-split-status__line genoma-split-status__line--warn">
          {genomaLocaleEs.conflictsPending(summary.conflicts)}
        </p>
      ) : null}
      {summary.needsYou > 0 && summary.conflicts === 0 ? (
        <p className="genoma-split-status__line">{genomaLocaleEs.analysisDoneNeedsYou(summary.needsYou)}</p>
      ) : null}
      {summary.supplemental > 0 ? (
        <p className="genoma-split-status__line">{genomaLocaleEs.supplementalObservations(summary.supplemental)}</p>
      ) : null}
      {summary.needsYou === 0 && summary.locked > 0 ? (
        <p className="genoma-split-status__line genoma-split-status__line--ok">{genomaLocaleEs.boardReady}</p>
      ) : null}
    </div>
  );
}
