"use client";

import React from "react";
import type { BrandKitDocument } from "@/lib/brandkit/brand-kit-types";
import {
  brandKitBoardActionItems,
  summarizeBrandKitBoard,
} from "@/lib/brandkit/brand-kit-board-status";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import { authoritativeSourceLabel } from "@/lib/brandkit/brand-kit-source-policy";
import { scrollToBrandKitBoardSlot } from "./brand-kit-board-scroll";

type BrandKitBoardActionItemKind = "conflict" | "candidates" | "pending";

function scrollToFirstAction(doc: BrandKitDocument, kind: BrandKitBoardActionItemKind): void {
  const item = brandKitBoardActionItems(doc).find((entry) => entry.kind === kind);
  if (item) scrollToBrandKitBoardSlot(item.slotId);
}

export function BrandKitBoardStatusBar({ doc }: { doc: BrandKitDocument }) {
  const summary = summarizeBrandKitBoard(doc);
  const authoritative = authoritativeSourceLabel(doc.sources);
  const hasConflictAction = summary.conflicts > 0;
  const hasCandidateAction = summary.candidates > 0;

  if (summary.sources === 0 && summary.resolved === 0) return null;

  return (
    <div className="brandKit-v2-status-bar" role="status">
      {summary.sources > 0 ? (
        <span className="brandKit-v2-status-bar__pill">
          {summary.sources} {summary.sources === 1 ? "fuente" : "fuentes"}
        </span>
      ) : null}
      {summary.locked > 0 ? (
        <span className="brandKit-v2-status-bar__pill brandKit-v2-status-bar__pill--locked">
          {brandKitLocaleEs.lockedBlocksHint(summary.locked)}
        </span>
      ) : null}
      {summary.conflicts > 0 ? (
        <button
          type="button"
          className="brandKit-v2-status-bar__pill brandKit-v2-status-bar__pill--warn brandKit-v2-status-bar__pill--action"
          onClick={() => scrollToFirstAction(doc, "conflict")}
        >
          {brandKitLocaleEs.conflictsPending(summary.conflicts)}
        </button>
      ) : null}
      {summary.candidates > 0 ? (
        <button
          type="button"
          className="brandKit-v2-status-bar__pill brandKit-v2-status-bar__pill--accent brandKit-v2-status-bar__pill--action"
          onClick={() => scrollToFirstAction(doc, "candidates")}
        >
          {brandKitLocaleEs.candidatesBoardHint(summary.candidates)}
        </button>
      ) : null}
      {summary.supplemental > 0 ? (
        <span className="brandKit-v2-status-bar__pill">
          {brandKitLocaleEs.supplementalObservations(summary.supplemental)}
        </span>
      ) : null}
      {authoritative ? (
        <span className="brandKit-v2-status-bar__pill brandKit-v2-status-bar__pill--authoritative">
          {brandKitLocaleEs.authoritativeSource}: {authoritative}
        </span>
      ) : null}
      {summary.needsYou === 0 && summary.resolved > 0 ? (
        <span className="brandKit-v2-status-bar__pill brandKit-v2-status-bar__pill--success">
          {brandKitLocaleEs.boardReady}
        </span>
      ) : null}
      {(hasConflictAction || hasCandidateAction) && summary.needsYou > 0 ? (
        <span className="brandKit-v2-status-bar__hint">{brandKitLocaleEs.analysisDoneConflictHint}</span>
      ) : null}
    </div>
  );
}
