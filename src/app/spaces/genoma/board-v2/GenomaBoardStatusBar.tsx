"use client";

import React from "react";
import type { GenomaDocument } from "@/lib/genoma/genoma-types";
import {
  genomaBoardActionItems,
  summarizeGenomaBoard,
} from "@/lib/genoma/genoma-board-status";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import { authoritativeSourceLabel } from "@/lib/genoma/genoma-source-policy";
import { scrollToGenomaBoardSlot } from "./genoma-board-scroll";

type GenomaBoardActionItemKind = "conflict" | "candidates" | "pending";

function scrollToFirstAction(doc: GenomaDocument, kind: GenomaBoardActionItemKind): void {
  const item = genomaBoardActionItems(doc).find((entry) => entry.kind === kind);
  if (item) scrollToGenomaBoardSlot(item.slotId);
}

export function GenomaBoardStatusBar({ doc }: { doc: GenomaDocument }) {
  const summary = summarizeGenomaBoard(doc);
  const authoritative = authoritativeSourceLabel(doc.sources);
  const hasConflictAction = summary.conflicts > 0;
  const hasCandidateAction = summary.candidates > 0;

  if (summary.sources === 0 && summary.resolved === 0) return null;

  return (
    <div className="genoma-v2-status-bar" role="status">
      {summary.sources > 0 ? (
        <span className="genoma-v2-status-bar__pill">
          {summary.sources} {summary.sources === 1 ? "fuente" : "fuentes"}
        </span>
      ) : null}
      {summary.locked > 0 ? (
        <span className="genoma-v2-status-bar__pill genoma-v2-status-bar__pill--locked">
          {genomaLocaleEs.lockedBlocksHint(summary.locked)}
        </span>
      ) : null}
      {summary.conflicts > 0 ? (
        <button
          type="button"
          className="genoma-v2-status-bar__pill genoma-v2-status-bar__pill--warn genoma-v2-status-bar__pill--action"
          onClick={() => scrollToFirstAction(doc, "conflict")}
        >
          {genomaLocaleEs.conflictsPending(summary.conflicts)}
        </button>
      ) : null}
      {summary.candidates > 0 ? (
        <button
          type="button"
          className="genoma-v2-status-bar__pill genoma-v2-status-bar__pill--accent genoma-v2-status-bar__pill--action"
          onClick={() => scrollToFirstAction(doc, "candidates")}
        >
          {genomaLocaleEs.candidatesBoardHint(summary.candidates)}
        </button>
      ) : null}
      {summary.supplemental > 0 ? (
        <span className="genoma-v2-status-bar__pill">
          {genomaLocaleEs.supplementalObservations(summary.supplemental)}
        </span>
      ) : null}
      {authoritative ? (
        <span className="genoma-v2-status-bar__pill genoma-v2-status-bar__pill--authoritative">
          {genomaLocaleEs.authoritativeSource}: {authoritative}
        </span>
      ) : null}
      {summary.needsYou === 0 && summary.resolved > 0 ? (
        <span className="genoma-v2-status-bar__pill genoma-v2-status-bar__pill--success">
          {genomaLocaleEs.boardReady}
        </span>
      ) : null}
      {(hasConflictAction || hasCandidateAction) && summary.needsYou > 0 ? (
        <span className="genoma-v2-status-bar__hint">{genomaLocaleEs.analysisDoneConflictHint}</span>
      ) : null}
    </div>
  );
}
