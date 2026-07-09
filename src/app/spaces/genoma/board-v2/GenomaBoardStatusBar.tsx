"use client";

import React from "react";
import type { GenomaDocument } from "@/lib/genoma/genoma-types";
import { summarizeGenomaBoard } from "@/lib/genoma/genoma-board-status";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import { authoritativeSourceLabel } from "@/lib/genoma/genoma-source-policy";

export function GenomaBoardStatusBar({ doc }: { doc: GenomaDocument }) {
  const summary = summarizeGenomaBoard(doc);
  const authoritative = authoritativeSourceLabel(doc.sources);

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
        <span className="genoma-v2-status-bar__pill genoma-v2-status-bar__pill--warn">
          {genomaLocaleEs.conflictsPending(summary.conflicts)}
        </span>
      ) : null}
      {summary.candidates > 0 ? (
        <span className="genoma-v2-status-bar__pill genoma-v2-status-bar__pill--accent">
          {genomaLocaleEs.candidatesBoardHint(summary.candidates)}
        </span>
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
    </div>
  );
}
