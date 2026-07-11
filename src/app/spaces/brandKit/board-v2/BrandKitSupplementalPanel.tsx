"use client";

import React, { useEffect, useState } from "react";
import type { GalleryValue, SlotState } from "@/lib/brandkit/brand-kit-types";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import { EvidenceList } from "./SemanticExpandable";
import { BrandKitLogoRankMeta } from "./BrandKitVisualRankMeta";
import { BrandKitClickableImage } from "./BrandKitClickableImage";
import type { LogoValue } from "@/lib/brandkit/brand-kit-types";

export function BrandKitSupplementalPanel({ slot }: { slot: SlotState<unknown> }) {
  const [open, setOpen] = useState(false);
  const evidence = slot.supplementalEvidence ?? [];
  const archived = slot.archivedCandidates ?? [];
  const galleryArchived =
    slot.id === "gallery" ? ((slot.value as GalleryValue | undefined)?.archivedHarvest ?? []) : [];
  const total = evidence.length + archived.length + galleryArchived.length;

  useEffect(() => {
    if (total > 0 && total <= 2) setOpen(true);
  }, [total]);

  if (!slot.locked || total === 0) return null;

  return (
    <div className={`brandKit-v2-supplemental${open ? " is-open" : ""}`} data-testid="brandKit-supplemental-panel">
      <button
        type="button"
        className="brandKit-v2-supplemental__toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {brandKitLocaleEs.supplementalObservations(total)}
      </button>
      {open ? (
        <div className="brandKit-v2-supplemental__body">
          {evidence.length ? (
            <section>
              <p className="brandKit-v2-supplemental__label">{brandKitLocaleEs.supplementalEvidence}</p>
              <EvidenceList
                quotes={evidence.map((item) => `«${item.quote}»${item.sourceLabel ? ` — ${item.sourceLabel}` : ""}`)}
                hideLabel
              />
            </section>
          ) : null}
          {archived.length ? (
            <section>
              <p className="brandKit-v2-supplemental__label">{brandKitLocaleEs.supplementalCandidates}</p>
              <div className="brandKit-v2-supplemental__archived">
                {archived.map((candidate, index) => {
                  const logo = candidate.value as LogoValue;
                  return (
                    <div key={`${logo.assetId}-${index}`} className="brandKit-v2-supplemental__archived-item">
                      {logo.previewUrl ? <BrandKitClickableImage src={logo.previewUrl} fit="square" /> : null}
                      <BrandKitLogoRankMeta candidate={candidate} rank={index + 1} />
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
          {galleryArchived.length ? (
            <section>
              <p className="brandKit-v2-supplemental__label">{brandKitLocaleEs.supplementalGallery}</p>
              <div className="brandKit-v2-supplemental__archived">
                {galleryArchived.map((item) =>
                  item.previewUrl ? (
                    <div key={item.assetId} className="brandKit-v2-supplemental__archived-item">
                      <BrandKitClickableImage src={item.previewUrl} fit="square" />
                    </div>
                  ) : null,
                )}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
