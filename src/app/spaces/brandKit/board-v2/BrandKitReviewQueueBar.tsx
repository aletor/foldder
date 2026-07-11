"use client";

import React from "react";
import { reviewQueueProgressLabel } from "@/lib/brandkit/brand-kit-review-queue";

export function BrandKitReviewQueueBar({
  index,
  total,
  onSkip,
  onExit,
}: {
  index: number;
  total: number;
  onSkip: () => void;
  onExit: () => void;
}) {
  return (
    <div className="brandKit-review-bar" role="toolbar" aria-label="Cola de revisión">
      <span className="brandKit-review-bar__progress">{reviewQueueProgressLabel(index, total)}</span>
      <div className="brandKit-review-bar__actions">
        <button type="button" className="brandKit-review-bar__btn" onClick={onSkip}>
          Omitir
        </button>
        <button type="button" className="brandKit-review-bar__btn brandKit-review-bar__btn--ghost" onClick={onExit}>
          Salir de la revisión
        </button>
      </div>
    </div>
  );
}
