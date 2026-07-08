"use client";

import React from "react";
import type { EssenceValue, SlotAction, SlotId, SlotState } from "@/lib/genoma/genoma-types";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import { DnaBlock } from "../DnaBlock";
import { EvidenceList, SemanticExpandable } from "../SemanticExpandable";

export function EssenceBlock({
  slot,
  slotId,
  onAction,
}: {
  slot: SlotState<unknown>;
  slotId: SlotId;
  onAction: (slotId: SlotId, action: SlotAction) => void;
}) {
  const essence = slot.value as EssenceValue | undefined;
  let body: React.ReactNode;
  let primaryAction: React.ReactNode;

  if (slot.status === "pending") {
    body = <div className="genoma-v2-skeleton" aria-hidden />;
  } else if (slot.status === "candidates") {
    body = (
      <div className="genoma-v2-stack">
        {slot.needsReviewReason ? <p className="genoma-v2-muted">{slot.needsReviewReason}</p> : null}
        {slot.candidates.map((candidate, index) => {
          const value = candidate.value as EssenceValue;
          return (
            <button
              key={index}
              type="button"
              className="genoma-v2-btn genoma-v2-btn--ghost text-left"
              onClick={() => onAction(slotId, { action: "choose_candidate", candidateIndex: index })}
            >
              {value.summary ? (
                <span className="genoma-v2-semantic__summary">{value.summary}</span>
              ) : null}
              {value.headline ? (
                <span className="genoma-v2-muted">
                  {genomaLocaleEs.headlineDetected}: «{value.headline}»
                </span>
              ) : null}
              {value.beliefs?.length ? (
                <span className="genoma-v2-chip-row">
                  {value.beliefs.slice(0, 2).map((belief) => (
                    <span key={belief.label} className="genoma-v2-chip">
                      {belief.label}
                    </span>
                  ))}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    );
  } else if (!essence?.summary) {
    body = <p className="genoma-v2-muted">{genomaLocaleEs.noEssence}</p>;
  } else {
    const beliefChips = essence.beliefs?.slice(0, 2).map((belief) => (
      <span key={belief.label} className="genoma-v2-chip">
        {belief.label}
      </span>
    ));
    const evidenceQuotes = [
      ...(essence.evidence?.map((item) => item.quote) ?? []),
      ...(essence.beliefs?.map((belief) => belief.evidence).filter(Boolean) as string[]),
    ];

    body = (
      <SemanticExpandable
        summary={<p className="genoma-v2-prose">{essence.summary}</p>}
        chips={beliefChips}
      >
        {essence.promise ? (
          <p className="genoma-v2-muted">
            <strong>{genomaLocaleEs.promise}:</strong> {essence.promise}
          </p>
        ) : null}
        {essence.headline ? (
          <p className="genoma-v2-muted">
            <strong>{genomaLocaleEs.headlineDetected}:</strong> "{essence.headline}"
          </p>
        ) : null}
        {essence.purpose ? (
          <p className="genoma-v2-muted">
            <strong>{genomaLocaleEs.purpose}:</strong> {essence.purpose}
          </p>
        ) : null}
        {essence.pov ? (
          <p className="genoma-v2-muted">
            <strong>{genomaLocaleEs.pov}:</strong> {essence.pov}
          </p>
        ) : null}
        {essence.beliefs?.length ? (
          <div>
            <strong>{genomaLocaleEs.beliefs}</strong>
            <ul className="genoma-v2-rules">
              {essence.beliefs.map((belief) => (
                <li key={belief.label}>
                  {belief.label}
                  {belief.explanation ? ` — ${belief.explanation}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <EvidenceList quotes={evidenceQuotes} />
      </SemanticExpandable>
    );
  }

  return (
    <DnaBlock label={genomaLocaleEs.essence} slotId={slotId} slot={slot} onAction={onAction} primaryAction={primaryAction}>
      {body}
    </DnaBlock>
  );
}
