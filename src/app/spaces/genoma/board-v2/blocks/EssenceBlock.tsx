"use client";

import React, { useState } from "react";
import type { EssenceValue, SlotAction, SlotId, SlotState } from "@/lib/genoma/genoma-types";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import { DnaBlock } from "../DnaBlock";
import { GenomaIconButton } from "../GenomaIconButton";
import { GenomaRichText } from "../GenomaRichText";
import { GenomaTextEditPanel } from "../GenomaTextEditPanel";
import { GenomaCapsuleList } from "../GenomaCapsuleList";
import { GenomaSemanticCandidates } from "../GenomaSemanticCandidates";
import { GenomaSlotReviewCard } from "../GenomaSlotReviewCard";
import { GenomaSupplementalPanel } from "../GenomaSupplementalPanel";
import { EvidenceList, SemanticDetailPanels } from "../SemanticExpandable";
import { Pencil } from "lucide-react";
import { GenomaBlockSkeleton } from "../GenomaBlockSkeleton";
import { GenomaEvidenceTrigger } from "../GenomaEvidenceTrigger";
import {
  shouldShowAnalyzingSkeleton,
  shouldShowLegacyPendingSkeleton,
  type GenomaBlockMotionProps,
} from "../genoma-block-motion";

function beliefsToText(beliefs: EssenceValue["beliefs"]): string {
  return beliefs
    .map((belief) => (belief.explanation ? `${belief.label} — ${belief.explanation}` : belief.label))
    .join("\n");
}

function textToBeliefs(text: string): EssenceValue["beliefs"] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, ...rest] = line.split("—");
      const trimmedLabel = label.trim();
      const explanation = rest.join("—").trim();
      return explanation ? { label: trimmedLabel, explanation } : { label: trimmedLabel };
    });
}

export function EssenceBlock({
  slot,
  slotId,
  onAction,
  activeSlotId,
  motion,
}: {
  slot: SlotState<unknown>;
  slotId: SlotId;
  onAction: (slotId: SlotId, action: SlotAction) => void;
  activeSlotId?: SlotId;
} & GenomaBlockMotionProps) {
  const essence = slot.value as EssenceValue | undefined;
  const [editing, setEditing] = useState(false);
  let body: React.ReactNode;
  let primaryAction: React.ReactNode;

  const canEdit = Boolean(essence?.summary && slot.status === "resolved" && !slot.locked);
  const editButton = canEdit ? (
    <GenomaIconButton icon={Pencil} label={genomaLocaleEs.edit} onClick={() => setEditing(true)} />
  ) : null;

  const beginEditFromDraft = () => {
    if (slot.status === "candidates" && slot.candidates.length === 1) {
      onAction(slotId, { action: "choose_candidate", candidateIndex: 0 });
    }
    setEditing(true);
  };

  if (shouldShowAnalyzingSkeleton(motion)) {
    body = <GenomaBlockSkeleton variant="essence" />;
  } else if (shouldShowLegacyPendingSkeleton(motion, slot.status)) {
    body = <div className="genoma-v2-skeleton" aria-hidden />;
  } else if (editing && essence) {
    body = (
      <GenomaTextEditPanel
        fields={[
          { id: "summary", label: "Resumen", value: essence.summary, multiline: true },
          { id: "headline", label: genomaLocaleEs.headlineDetected, value: essence.headline ?? "" },
          { id: "promise", label: genomaLocaleEs.promise, value: essence.promise ?? "", multiline: true },
          { id: "purpose", label: genomaLocaleEs.purpose, value: essence.purpose ?? "", multiline: true },
          { id: "pov", label: genomaLocaleEs.pov, value: essence.pov ?? "", multiline: true },
          { id: "beliefs", label: genomaLocaleEs.beliefs, value: beliefsToText(essence.beliefs ?? []), multiline: true },
        ]}
        onSave={(values) => {
          onAction(slotId, {
            action: "set",
            value: {
              ...essence,
              summary: values.summary.trim(),
              headline: values.headline.trim() || undefined,
              promise: values.promise.trim() || undefined,
              purpose: values.purpose.trim() || undefined,
              pov: values.pov.trim() || undefined,
              beliefs: textToBeliefs(values.beliefs),
            } satisfies EssenceValue,
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
  } else if (slot.status === "resolved" && slot.needsReviewReason && (essence?.summary || essence?.headline)) {
    body = (
      <GenomaSlotReviewCard
        slotId={slotId}
        candidate={{
          value: essence,
          score: slot.confidence,
          provenance: slot.provenance ?? { type: "llm_synthesis", detail: "revisión" },
        }}
        reviewReason={slot.needsReviewReason}
        onAction={onAction}
        onEdit={beginEditFromDraft}
        confirmMode="lock"
      />
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
    const detailLines = [
      essence.promise ? { label: genomaLocaleEs.promise, value: essence.promise } : null,
      essence.headline ? { label: genomaLocaleEs.headlineDetected, value: `«${essence.headline}»` } : null,
      essence.purpose ? { label: genomaLocaleEs.purpose, value: essence.purpose } : null,
      essence.pov ? { label: genomaLocaleEs.pov, value: essence.pov } : null,
    ].filter(Boolean) as { label: string; value: string }[];

    body = (
      <>
        {essence.headline ? (
          <GenomaEvidenceTrigger
            id={`essence-headline-${slotId}`}
            slot={slot}
            slotId={slotId}
            onAction={onAction}
            onCorrect={() => setEditing(true)}
          >
            <p className="genoma-v2-semantic-headline-row">«{essence.headline}»</p>
          </GenomaEvidenceTrigger>
        ) : null}
        <SemanticDetailPanels
        summary={
          <GenomaRichText
            text={essence.summary}
            className="genoma-v2-prose"
            as="p"
            emphasizeTerms={[
              ...(essence.beliefs?.map((belief) => belief.label) ?? []),
              essence.headline ?? "",
              essence.promise ?? "",
            ]}
          />
        }
        chips={beliefChips}
        panels={[
          {
            id: "beliefs",
            label: genomaLocaleEs.beliefs,
            count: essence.beliefs?.length,
            content: essence.beliefs?.length ? (
              <GenomaCapsuleList
                items={essence.beliefs.map((belief) =>
                  belief.explanation ? { label: belief.label, detail: belief.explanation } : belief.label,
                )}
              />
            ) : null,
          },
          {
            id: "evidence",
            label: genomaLocaleEs.evidence,
            count: evidenceQuotes.length,
            content: <EvidenceList quotes={evidenceQuotes} hideLabel />,
          },
          {
            id: "detail",
            label: genomaLocaleEs.detail,
            count: detailLines.length,
            content: detailLines.length ? (
              <GenomaCapsuleList
                items={detailLines.map((line) => ({ label: line.label, detail: line.value }))}
              />
            ) : null,
          },
        ]}
        footer={<GenomaSupplementalPanel slot={slot} />}
      />
      </>
    );
  }

  return (
    <DnaBlock
      label={genomaLocaleEs.essence}
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
