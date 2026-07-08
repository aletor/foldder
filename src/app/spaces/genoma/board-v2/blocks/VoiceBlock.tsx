"use client";

import React, { useState } from "react";
import type { SlotAction, SlotId, SlotState, VoiceValue } from "@/lib/genoma/genoma-types";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import { DnaBlock } from "../DnaBlock";
import { EvidenceList, SemanticExpandable } from "../SemanticExpandable";

export function VoiceBlock({
  slot,
  slotId,
  onAction,
}: {
  slot: SlotState<unknown>;
  slotId: SlotId;
  onAction: (slotId: SlotId, action: SlotAction) => void;
}) {
  const voice = slot.value as VoiceValue | undefined;
  const [draft, setDraft] = useState("");
  let body: React.ReactNode;
  let primaryAction: React.ReactNode;

  if (slot.status === "pending") {
    body = <div className="genoma-v2-skeleton" aria-hidden />;
  } else if (slot.status === "candidates") {
    body = (
      <div className="genoma-v2-stack">
        {slot.needsReviewReason ? <p className="genoma-v2-muted">{slot.needsReviewReason}</p> : null}
        {slot.candidates.map((candidate, index) => {
          const value = candidate.value as VoiceValue;
          return (
            <button
              key={index}
              type="button"
              className="genoma-v2-btn genoma-v2-btn--ghost text-left"
              onClick={() => onAction(slotId, { action: "choose_candidate", candidateIndex: index })}
            >
              <span className="genoma-v2-semantic__summary">{value.summary}</span>
              {value.descriptors?.length ? (
                <span className="genoma-v2-chip-row">
                  {value.descriptors.slice(0, 3).map((descriptor) => (
                    <span key={descriptor} className="genoma-v2-chip">
                      {descriptor}
                    </span>
                  ))}
                </span>
              ) : null}
              {value.rules?.length ? (
                <ul className="genoma-v2-rules genoma-v2-rules--preview">
                  {value.rules.slice(0, 3).map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
              ) : null}
            </button>
          );
        })}
      </div>
    );
  } else if (slot.status === "needs_user" || !voice?.summary) {
    body = (
      <input
        className="genoma-v2-inline-input"
        value={draft}
        placeholder="Pega 3 frases que suenen a la marca"
        onChange={(event) => setDraft(event.target.value)}
      />
    );
    primaryAction = (
      <button
        type="button"
        className="genoma-v2-btn"
        onClick={() =>
          onAction(slotId, {
            action: "set",
            value: {
              summary: "Voz definida manualmente a partir de ejemplos del usuario.",
              descriptors: ["directo", "cercano", "claro"],
              rules: ["Usar frases cortas", "Mantener tono conversacional", "Evitar jerga vacía"],
              avoid: [],
              evidence: draft
                .split(/[.!?]\s+/)
                .filter(Boolean)
                .slice(0, 3)
                .map((quote) => ({ quote })),
            } satisfies VoiceValue,
          })
        }
      >
        Guardar voz
      </button>
    );
  } else {
    const descriptorChips = voice.descriptors.slice(0, 3).map((descriptor) => (
      <span key={descriptor} className="genoma-v2-chip">
        {descriptor}
      </span>
    ));

    body = (
      <SemanticExpandable summary={<p className="genoma-v2-prose">{voice.summary}</p>} chips={descriptorChips}>
        {voice.rules.length ? (
          <div>
            <strong>{genomaLocaleEs.writingRules}</strong>
            <ul className="genoma-v2-rules">
              {voice.rules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {voice.avoid?.length ? (
          <div className="genoma-v2-chip-row">
            {voice.avoid.map((item) => (
              <span key={item} className="genoma-v2-chip genoma-v2-chip--warn">
                {item}
              </span>
            ))}
          </div>
        ) : null}
        <EvidenceList quotes={voice.evidence.map((item) => item.quote)} />
      </SemanticExpandable>
    );
  }

  return (
    <DnaBlock label={genomaLocaleEs.voice} slotId={slotId} slot={slot} onAction={onAction} primaryAction={primaryAction}>
      {body}
    </DnaBlock>
  );
}
