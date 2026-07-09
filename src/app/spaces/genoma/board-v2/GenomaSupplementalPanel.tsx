"use client";

import React, { useEffect, useState } from "react";
import type { GalleryValue, SlotState } from "@/lib/genoma/genoma-types";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import { EvidenceList } from "./SemanticExpandable";
import { GenomaLogoRankMeta } from "./GenomaVisualRankMeta";
import { GenomaClickableImage } from "./GenomaClickableImage";
import type { LogoValue } from "@/lib/genoma/genoma-types";

export function GenomaSupplementalPanel({ slot }: { slot: SlotState<unknown> }) {
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
    <div className={`genoma-v2-supplemental${open ? " is-open" : ""}`} data-testid="genoma-supplemental-panel">
      <button
        type="button"
        className="genoma-v2-supplemental__toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {genomaLocaleEs.supplementalObservations(total)}
      </button>
      {open ? (
        <div className="genoma-v2-supplemental__body">
          {evidence.length ? (
            <section>
              <p className="genoma-v2-supplemental__label">{genomaLocaleEs.supplementalEvidence}</p>
              <EvidenceList
                quotes={evidence.map((item) => `«${item.quote}»${item.sourceLabel ? ` — ${item.sourceLabel}` : ""}`)}
                hideLabel
              />
            </section>
          ) : null}
          {archived.length ? (
            <section>
              <p className="genoma-v2-supplemental__label">{genomaLocaleEs.supplementalCandidates}</p>
              <div className="genoma-v2-supplemental__archived">
                {archived.map((candidate, index) => {
                  const logo = candidate.value as LogoValue;
                  return (
                    <div key={`${logo.assetId}-${index}`} className="genoma-v2-supplemental__archived-item">
                      {logo.previewUrl ? <GenomaClickableImage src={logo.previewUrl} fit="square" /> : null}
                      <GenomaLogoRankMeta candidate={candidate} rank={index + 1} />
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
          {galleryArchived.length ? (
            <section>
              <p className="genoma-v2-supplemental__label">{genomaLocaleEs.supplementalGallery}</p>
              <div className="genoma-v2-supplemental__archived">
                {galleryArchived.map((item) =>
                  item.previewUrl ? (
                    <div key={item.assetId} className="genoma-v2-supplemental__archived-item">
                      <GenomaClickableImage src={item.previewUrl} fit="square" />
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
