"use client";

import React from "react";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import type { BrandKitDocument } from "@/lib/brandkit/brand-kit-types";
import { listPresentationPendingSlots } from "@/lib/brandkit/studio/brand-kit-presentation-pending";
import { BrandKitFoldderButton } from "./BrandKitFoldderButton";

export function BrandKitPresentationPendingCard({
  doc,
  onRequestEditMode,
}: {
  doc: BrandKitDocument;
  onRequestEditMode?: () => void;
}) {
  const pending = listPresentationPendingSlots(doc);
  if (!pending.length) return null;

  return (
    <section className="brandKit-presentation-pending" aria-label={brandKitLocaleEs.presentationPendingTitle(pending.length)}>
      <p className="brandKit-presentation-pending__eyebrow">{brandKitLocaleEs.presentationPendingEyebrow}</p>
      <h2 className="brandKit-presentation-pending__title">{brandKitLocaleEs.presentationPendingTitle(pending.length)}</h2>
      <p className="brandKit-presentation-pending__hint">{brandKitLocaleEs.presentationPendingHint}</p>
      <ul className="brandKit-presentation-pending__list">
        {pending.map((item) => (
          <li key={item.slotId} className="brandKit-presentation-pending__item">
            <span className="brandKit-presentation-pending__num">{item.number}</span>
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
      {onRequestEditMode ? (
        <BrandKitFoldderButton onClick={onRequestEditMode}>{brandKitLocaleEs.presentationPendingCta}</BrandKitFoldderButton>
      ) : null}
    </section>
  );
}
