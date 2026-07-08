"use client";

import React from "react";
import type { BrandKitCardView } from "@/lib/brandkit/brandkit-card-projection";
import { BRANDKIT_BOOK_COMPLETENESS_TOOLTIP_ES } from "@/lib/brandkit/brandkit-card-projection";

const RING_RADIUS = 30;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function BrandKitCardFace({ view }: { view: BrandKitCardView }) {
  const progress = Math.max(0, Math.min(100, view.completenessPercent));
  const ringOffset = RING_CIRCUMFERENCE - (progress / 100) * RING_CIRCUMFERENCE;

  return (
    <div className="brandkit-card-face nodrag nopan" data-testid="brandkit-card-face">
      <div className="brandkit-card-face__panel">
        <div
          className="brandkit-card-face__logo-wrap"
          title={`${BRANDKIT_BOOK_COMPLETENESS_TOOLTIP_ES} · ${progress}%`}
        >
          <svg className="brandkit-card-face__ring" viewBox="0 0 72 72" aria-hidden>
            <circle cx="36" cy="36" r={RING_RADIUS} className="brandkit-card-face__ring-track" />
            <circle
              cx="36"
              cy="36"
              r={RING_RADIUS}
              className="brandkit-card-face__ring-progress"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={ringOffset}
            />
          </svg>
          <div className="brandkit-card-face__logo-slot">
            {view.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={view.logoUrl} alt="" className="brandkit-card-face__logo" />
            ) : (
              <span className="brandkit-card-face__logo-ghost" aria-hidden>
                ◆
              </span>
            )}
          </div>
          <span className="brandkit-card-face__percent">{progress}%</span>
        </div>

        <div className="brandkit-card-face__palette" aria-label="Paleta de marca">
          {view.paletteDots.map((hex, index) => (
            <span
              key={`palette-dot-${index}`}
              className={`brandkit-card-face__dot${hex ? "" : " brandkit-card-face__dot--ghost"}`}
              style={hex ? { backgroundColor: hex } : undefined}
            />
          ))}
        </div>

        <p className="brandkit-card-face__tone">
          {view.toneLine ?? view.tagline ?? "Tono y mensaje pendientes"}
        </p>
      </div>

      {view.review.conflicts > 0 ? (
        <span
          className="brandkit-card-face__conflict-badge"
          title={`${view.review.conflicts} conflicto${view.review.conflicts === 1 ? "" : "s"} por revisar`}
          aria-label={`${view.review.conflicts} conflictos`}
        />
      ) : null}
    </div>
  );
}
