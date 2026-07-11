"use client";

import React from "react";
import type { BrandKitDocument } from "@/lib/brandkit/brand-kit-types";
import { summarizeBrandKitBoard } from "@/lib/brandkit/brand-kit-board-status";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";

export function BrandKitSidebarStatus({
  doc,
  isAnalyzing,
}: {
  doc: BrandKitDocument;
  isAnalyzing?: boolean;
}) {
  const summary = summarizeBrandKitBoard(doc);

  if (isAnalyzing) {
    return (
      <div className="brandKit-split-status brandKit-split-status--live" role="status">
        <span className="brandKit-split-status__dot" aria-hidden />
        <span>{brandKitLocaleEs.analyzingLive}</span>
      </div>
    );
  }

  if (summary.sources === 0) return null;

  return (
    <div className="brandKit-split-status" role="status">
      {summary.conflicts > 0 ? (
        <p className="brandKit-split-status__line brandKit-split-status__line--warn">
          {brandKitLocaleEs.conflictsPending(summary.conflicts)}
        </p>
      ) : null}
      {summary.needsYou > 0 && summary.conflicts === 0 ? (
        <p className="brandKit-split-status__line">{brandKitLocaleEs.analysisDoneNeedsYou(summary.needsYou)}</p>
      ) : null}
      {summary.supplemental > 0 ? (
        <p className="brandKit-split-status__line">{brandKitLocaleEs.supplementalObservations(summary.supplemental)}</p>
      ) : null}
      {summary.needsYou === 0 && summary.locked > 0 ? (
        <p className="brandKit-split-status__line brandKit-split-status__line--ok">{brandKitLocaleEs.boardReady}</p>
      ) : null}
    </div>
  );
}
