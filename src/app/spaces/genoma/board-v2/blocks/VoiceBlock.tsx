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
import { GenomaSemanticCandidates } from "../GenomaSemanticCandidates";
import { GenomaSlotReviewCard } from "../GenomaSlotReviewCard";
import { GenomaSupplementalPanel } from "../GenomaSupplementalPanel";
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
  activeSlotId,
}: {
  slot: SlotState<unknown>;
  slotId: SlotId;
  onAction: (slotId: SlotId, action: SlotAction) => void;
  activeSlotId?: SlotId;
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

  const beginEditFromDraft = () => {
    if (slot.status === "candidates" && slot.candidates.length === 1) {
      onAction(slotId, { action: "choose_candidate", candidateIndex: 0 });
    }
    setEditing(true);
  };

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
        <GenomaSemanticCandidates
          slotId={slotId}
          slot={slot}
          onAction={onAction}
          onEdit={beginEditFromDraft}
        />
      </div>
    );
  } else if (slot.status === "resolved" && slot.needsReviewReason && voice?.summary) {
    body = (
      <GenomaSlotReviewCard
        slotId={slotId}
        candidate={{
          value: voice,
          score: slot.confidence,
          provenance: slot.provenance ?? { type: "llm_synthesis", detail: "revisión" },
        }}
        reviewReason={slot.needsReviewReason}
        onAction={onAction}
        onEdit={beginEditFromDraft}
        confirmMode="lock"
      />
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
        summary={
          <GenomaRichText
            text={voice.summary}
            className="genoma-v2-prose"
            as="p"
            emphasizeTerms={voice.descriptors}
          />
        }
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
        footer={<GenomaSupplementalPanel slot={slot} />}
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
      activeSlotId={activeSlotId}
    >
      {body}
    </DnaBlock>
  );
}
