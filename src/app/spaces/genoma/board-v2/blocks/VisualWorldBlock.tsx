"use client";

import React from "react";
import type { GalleryValue, SlotAction, SlotId, SlotState, VisualWorldValue } from "@/lib/genoma/genoma-types";
import { galleryUsefulCount } from "@/lib/genoma/genoma-gallery-filter";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import { DnaBlock } from "../DnaBlock";
import { EvidenceList, SemanticExpandable } from "../SemanticExpandable";

export function VisualWorldBlock({
  slot,
  slotId,
  onAction,
  gallery,
}: {
  slot: SlotState<unknown>;
  slotId: SlotId;
  onAction: (slotId: SlotId, action: SlotAction) => void;
  gallery?: SlotState<unknown>;
}) {
  const visualWorld = slot.value as VisualWorldValue | undefined;
  const galleryValue = gallery?.value as GalleryValue | undefined;
  const usefulCount = galleryUsefulCount(galleryValue);
  let body: React.ReactNode;

  if (slot.status === "pending") {
    body = <div className="genoma-v2-skeleton" aria-hidden />;
  } else if (slot.status === "candidates") {
    body = (
      <div className="genoma-v2-stack">
        {slot.candidates.map((candidate, index) => {
          const value = candidate.value as VisualWorldValue;
          return (
            <button
              key={index}
              type="button"
              className="genoma-v2-btn genoma-v2-btn--ghost text-left"
              onClick={() => onAction(slotId, { action: "choose_candidate", candidateIndex: index })}
            >
              <span className="genoma-v2-semantic__summary">{value.summary}</span>
              {value.limits?.length ? (
                <ul className="genoma-v2-rules genoma-v2-rules--preview">
                  {value.limits.slice(0, 2).map((limit) => (
                    <li key={limit}>{limit}</li>
                  ))}
                </ul>
              ) : null}
            </button>
          );
        })}
      </div>
    );
  } else if (!visualWorld?.summary) {
    body = (
      <p className="genoma-v2-muted">
        {usefulCount >= 6 ? genomaLocaleEs.noVisualWorldSynthesis : genomaLocaleEs.noVisualWorld}
      </p>
    );
  } else {
    const moodChips = visualWorld.moodTags?.slice(0, 4).map((tag) => (
      <span key={tag} className="genoma-v2-chip">
        {tag}
      </span>
    ));

    body = (
      <SemanticExpandable summary={<p className="genoma-v2-prose">{visualWorld.summary}</p>} chips={moodChips}>
        {visualWorld.visualTraits?.length ? (
          <div>
            <strong>{genomaLocaleEs.visualTerritory}</strong>
            <ul className="genoma-v2-rules">
              {visualWorld.visualTraits.map((trait) => (
                <li key={trait}>{trait}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {visualWorld.limits?.length ? (
          <div>
            <strong>{genomaLocaleEs.limits}</strong>
            <ul className="genoma-v2-rules">
              {visualWorld.limits.map((limit) => (
                <li key={limit}>{limit}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {usefulCount > 0 ? (
          <p className="genoma-v2-muted">
            {genomaLocaleEs.fedByGallery} {usefulCount} {genomaLocaleEs.images}
          </p>
        ) : null}
        <EvidenceList quotes={visualWorld.evidence?.map((item) => item.quote) ?? []} />
      </SemanticExpandable>
    );
  }

  return (
    <DnaBlock label={genomaLocaleEs.visualWorld} slotId={slotId} slot={slot} onAction={onAction}>
      {body}
    </DnaBlock>
  );
}
