"use client";

import React from "react";
import type { SlotAction, SlotId, SlotState, TypographyValue } from "@/lib/genoma/genoma-types";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import { DnaBlock } from "../DnaBlock";

export function TypographyBlock({
  slot,
  slotId,
  onAction,
}: {
  slot: SlotState<unknown>;
  slotId: SlotId;
  onAction: (slotId: SlotId, action: SlotAction) => void;
}) {
  const typography = slot.value as TypographyValue | undefined;
  let body: React.ReactNode;
  let primaryAction: React.ReactNode;

  if (slot.status === "pending") {
    body = <div className="genoma-v2-skeleton" aria-hidden />;
  } else if (slot.status === "candidates") {
    body = (
      <div className="genoma-v2-stack">
        {slot.candidates.map((candidate, index) => {
          const value = candidate.value as TypographyValue;
          const primary = value.families[0];
          return (
            <button
              key={index}
              type="button"
              className="genoma-v2-btn genoma-v2-btn--ghost genoma-v2-type-choice text-left"
              onClick={() => onAction(slotId, { action: "choose_candidate", candidateIndex: index })}
            >
              <span className="genoma-v2-type-choice__specimen" style={{ fontFamily: primary?.family }}>
                {genomaLocaleEs.specimen}
              </span>
              <span className="genoma-v2-type-choice__meta">
                {value.families.map((family) => `${family.role}: ${family.family}`).join(" · ")}
              </span>
            </button>
          );
        })}
      </div>
    );
  } else if (!typography?.families?.length) {
    if (slot.status === "needs_user") {
      primaryAction = (
        <button
          type="button"
          className="genoma-v2-btn"
          onClick={() =>
            onAction(slotId, {
              action: "set",
              value: {
                families: [{ family: "Inter", role: "body", source: "google", fallbacks: ["sans-serif"], weights: [400, 600] }],
              } satisfies TypographyValue,
            })
          }
        >
          {genomaLocaleEs.chooseFonts}
        </button>
      );
    }
    body = <p className="genoma-v2-muted">{genomaLocaleEs.noTypography}</p>;
  } else {
    body = (
      <div className="genoma-v2-stack">
        {typography.families.map((family) => (
          <div key={`${family.role}-${family.family}`} className="genoma-v2-type-row">
            <div className="genoma-v2-type-row__specimen" style={{ fontFamily: `${family.family}, ${family.fallbacks.join(", ")}` }}>
              {genomaLocaleEs.specimen}
            </div>
            <div>
              <div className="genoma-v2-type-row__role">{family.role}</div>
              <div className="genoma-v2-type-row__family">{family.family}</div>
              <div className="genoma-v2-muted">
                {family.weights.join(", ")} · {family.source}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <DnaBlock label={genomaLocaleEs.typography} slotId={slotId} slot={slot} onAction={onAction} primaryAction={primaryAction}>
      {body}
    </DnaBlock>
  );
}
