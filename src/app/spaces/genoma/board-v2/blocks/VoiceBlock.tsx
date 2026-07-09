"use client";

import React, { useState } from "react";
import type { SlotAction, SlotId, SlotState, VoiceValue } from "@/lib/genoma/genoma-types";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import { DnaBlock } from "../DnaBlock";
import { GenomaFoldderButton } from "../GenomaFoldderButton";
import { GenomaRichText } from "../GenomaRichText";
import { GenomaIconButton } from "../GenomaIconButton";
import { GenomaTextEditPanel } from "../GenomaTextEditPanel";
import { GenomaCapsuleList } from "../GenomaCapsuleList";
import { EvidenceList, SemanticDetailPanels } from "../SemanticExpandable";
import { Pencil, Save } from "lucide-react";

function linesToList(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

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
  const [editing, setEditing] = useState(false);
  let body: React.ReactNode;
  let primaryAction: React.ReactNode;

  const canEdit = Boolean(voice?.summary && slot.status === "resolved" && !slot.locked);
  const editButton = canEdit ? (
    <GenomaIconButton icon={Pencil} label={genomaLocaleEs.edit} onClick={() => setEditing(true)} />
  ) : null;

  if (slot.status === "pending") {
    body = <div className="genoma-v2-skeleton" aria-hidden />;
  } else if (editing && voice) {
    body = (
      <GenomaTextEditPanel
        fields={[
          { id: "summary", label: "Resumen", value: voice.summary, multiline: true },
          {
            id: "descriptors",
            label: "Descriptores",
            value: voice.descriptors.join(", "),
            multiline: true,
          },
          { id: "rules", label: genomaLocaleEs.writingRules, value: voice.rules.join("\n"), multiline: true },
          { id: "avoid", label: "Evitar", value: (voice.avoid ?? []).join("\n"), multiline: true },
        ]}
        onSave={(values) => {
          onAction(slotId, {
            action: "set",
            value: {
              ...voice,
              summary: values.summary.trim(),
              descriptors: values.descriptors
                .split(/[,\n]/)
                .map((item) => item.trim())
                .filter(Boolean),
              rules: linesToList(values.rules),
              avoid: linesToList(values.avoid),
            } satisfies VoiceValue,
          });
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
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
      <GenomaFoldderButton
        icon={Save}
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
      </GenomaFoldderButton>
    );
  } else {
    const descriptorChips = voice.descriptors.slice(0, 3).map((descriptor) => (
      <span key={descriptor} className="genoma-v2-chip">
        {descriptor}
      </span>
    ));

    body = (
      <SemanticDetailPanels
        summary={<GenomaRichText text={voice.summary} className="genoma-v2-prose" as="p" />}
        chips={descriptorChips}
        panels={[
          {
            id: "rules",
            label: genomaLocaleEs.writingRules,
            count: voice.rules.length,
            content: voice.rules.length ? <GenomaCapsuleList items={voice.rules} /> : null,
          },
          {
            id: "avoid",
            label: genomaLocaleEs.avoid,
            count: voice.avoid?.length,
            content: voice.avoid?.length ? <GenomaCapsuleList items={voice.avoid} variant="warn" /> : null,
          },
          {
            id: "evidence",
            label: genomaLocaleEs.evidence,
            count: voice.evidence.length,
            content: <EvidenceList quotes={voice.evidence.map((item) => item.quote)} hideLabel />,
          },
        ]}
      />
    );
  }

  return (
    <DnaBlock
      label={genomaLocaleEs.voice}
      slotId={slotId}
      slot={slot}
      onAction={onAction}
      primaryAction={primaryAction}
      secondaryActions={editButton}
    >
      {body}
    </DnaBlock>
  );
}
