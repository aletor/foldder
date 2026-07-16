"use client";

import React, { useEffect } from "react";
import { X } from "lucide-react";
import type { ResolvedGalleryCategoryBriefing } from "@/lib/brandkit/brand-kit-gallery-brief";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import { BrandKitInlineMarkdown } from "./BrandKitInlineMarkdown";

export function BrandKitGalleryBriefSheet({
  open,
  briefing,
  onClose,
}: {
  open: boolean;
  briefing: ResolvedGalleryCategoryBriefing | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !briefing) return null;

  return (
    <div className="brandKit-gallery-brief-sheet is-open" aria-hidden={!open}>
      <button
        type="button"
        className="brandKit-gallery-brief-sheet__backdrop"
        aria-label="Cerrar brief"
        onClick={onClose}
      />
      <aside
        className="brandKit-gallery-brief-sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-label={brandKitLocaleEs.galleryBriefSheetTitle(briefing.label)}
      >
        <header className="brandKit-gallery-brief-sheet__head">
          <div>
            <p className="brandKit-gallery-brief-sheet__eyebrow">{briefing.label}</p>
            <h2 className="brandKit-gallery-brief-sheet__title">
              {brandKitLocaleEs.galleryBriefSheetTitle(briefing.label)}
            </h2>
          </div>
          <button type="button" className="brandKit-gallery-brief-sheet__close" aria-label="Cerrar" onClick={onClose}>
            <X size={18} strokeWidth={1.75} aria-hidden />
          </button>
        </header>
        <div className="brandKit-gallery-brief-sheet__body">
          <p className="brandKit-gallery-brief-sheet__description">
            <BrandKitInlineMarkdown text={briefing.description} />
          </p>
          {briefing.confidence && briefing.evidenceCount ? (
            <p className="brandKit-gallery-brief-sheet__meta">
              {brandKitLocaleEs.galleryBriefConfidence(briefing.confidence, briefing.evidenceCount)}
            </p>
          ) : null}
          {briefing.stale ? (
            <p className="brandKit-gallery-brief-sheet__stale">{brandKitLocaleEs.galleryBriefStale}</p>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
