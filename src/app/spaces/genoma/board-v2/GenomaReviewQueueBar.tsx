"use client";

import React from "react";
import { reviewQueueProgressLabel } from "@/lib/genoma/genoma-review-queue";

export function GenomaReviewQueueBar({
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
    <div className="genoma-review-bar" role="toolbar" aria-label="Cola de revisión">
      <span className="genoma-review-bar__progress">{reviewQueueProgressLabel(index, total)}</span>
      <div className="genoma-review-bar__actions">
        <button type="button" className="genoma-review-bar__btn" onClick={onSkip}>
          Omitir
        </button>
        <button type="button" className="genoma-review-bar__btn genoma-review-bar__btn--ghost" onClick={onExit}>
          Salir de la revisión
        </button>
      </div>
    </div>
  );
}
