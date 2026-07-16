"use client";

import React, { useState } from "react";
import type { EssenceValue, SlotAction, SlotId, SlotState } from "@/lib/brandkit/brand-kit-types";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import { DnaBlock } from "../DnaBlock";
import { BrandKitFoldderButton } from "../BrandKitFoldderButton";
import { BrandKitRichText } from "../BrandKitRichText";
import { BrandKitTextEditPanel } from "../BrandKitTextEditPanel";
import { BrandKitCapsuleList } from "../BrandKitCapsuleList";
import { BrandKitSemanticCandidates } from "../BrandKitSemanticCandidates";
import { BrandKitSlotReviewCard } from "../BrandKitSlotReviewCard";
import { BrandKitSupplementalPanel } from "../BrandKitSupplementalPanel";
import { EvidenceList, SemanticDetailPanels } from "../SemanticExpandable";
import { Pencil } from "lucide-react";
import { BrandKitBlockSkeleton } from "../BrandKitBlockSkeleton";
import { BrandKitEvidenceTrigger } from "../BrandKitEvidenceTrigger";
import {
  shouldShowAnalyzingSkeleton,
  shouldShowLegacyPendingSkeleton,
  type BrandKitBlockMotionProps,
} from "../brand-kit-block-motion";
import { useBrandKitMosaicCellOptional } from "../brand-kit-mosaic-context";

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
} & BrandKitBlockMotionProps) {
  const essence = slot.value as EssenceValue | undefined;
  const [editing, setEditing] = useState(false);
  const isMosaic = Boolean(useBrandKitMosaicCellOptional());
  let body: React.ReactNode;
  let primaryAction: React.ReactNode;

  const canEdit = Boolean(essence?.summary && slot.status === "resolved" && !slot.locked);
  const editButton = canEdit ? (
    <BrandKitFoldderButton variant="white" compact icon={Pencil} onClick={() => setEditing(true)}>
      {brandKitLocaleEs.edit}
    </BrandKitFoldderButton>
  ) : null;

  const beginEditFromDraft = () => {
    if (slot.status === "candidates" && slot.candidates.length === 1) {
      onAction(slotId, { action: "choose_candidate", candidateIndex: 0 });
    }
    setEditing(true);
  };

  if (shouldShowAnalyzingSkeleton(motion)) {
    body = <BrandKitBlockSkeleton variant="essence" />;
  } else if (shouldShowLegacyPendingSkeleton(motion, slot.status)) {
    body = <div className="brandKit-v2-skeleton" aria-hidden />;
  } else if (editing && essence) {
    body = (
      <BrandKitTextEditPanel
        fields={[
          { id: "summary", label: "Resumen", value: essence.summary, multiline: true },
          { id: "headline", label: brandKitLocaleEs.headlineDetected, value: essence.headline ?? "" },
          { id: "promise", label: brandKitLocaleEs.promise, value: essence.promise ?? "", multiline: true },
          { id: "purpose", label: brandKitLocaleEs.purpose, value: essence.purpose ?? "", multiline: true },
          { id: "pov", label: brandKitLocaleEs.pov, value: essence.pov ?? "", multiline: true },
          { id: "beliefs", label: brandKitLocaleEs.beliefs, value: beliefsToText(essence.beliefs ?? []), multiline: true },
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
      <div className="brandKit-v2-stack">
        <BrandKitSemanticCandidates
          slotId={slotId}
          slot={slot}
          onAction={onAction}
          onEdit={beginEditFromDraft}
        />
      </div>
    );
  } else if (slot.status === "resolved" && slot.needsReviewReason && (essence?.summary || essence?.headline)) {
    body = (
      <BrandKitSlotReviewCard
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
    body = <p className="brandKit-v2-muted">{brandKitLocaleEs.noEssence}</p>;
  } else {
    const beliefChips = essence.beliefs?.slice(0, 2).map((belief) => (
      <span key={belief.label} className="brandKit-v2-chip">
        {belief.label}
      </span>
    ));
    const evidenceQuotes = [
      ...(essence.evidence?.map((item) => item.quote) ?? []),
      ...(essence.beliefs?.map((belief) => belief.evidence).filter(Boolean) as string[]),
    ];
    const detailLines = [
      essence.promise ? { label: brandKitLocaleEs.promise, value: essence.promise } : null,
      essence.headline ? { label: brandKitLocaleEs.headlineDetected, value: `«${essence.headline}»` } : null,
      essence.purpose ? { label: brandKitLocaleEs.purpose, value: essence.purpose } : null,
      essence.pov ? { label: brandKitLocaleEs.pov, value: essence.pov } : null,
    ].filter(Boolean) as { label: string; value: string }[];

    body = (
      <>
        {essence.headline ? (
          <BrandKitEvidenceTrigger
            id={`essence-headline-${slotId}`}
            slot={slot}
            slotId={slotId}
            onAction={onAction}
            onCorrect={() => setEditing(true)}
          >
            <p className="brandKit-v2-semantic-headline-row">«{essence.headline}»</p>
          </BrandKitEvidenceTrigger>
        ) : null}
        <SemanticDetailPanels
        slotId={slotId}
        slot={slot}
        onAction={onAction}
        onEdit={() => setEditing(true)}
        summary={
          <BrandKitRichText
            text={essence.summary}
            className="brandKit-v2-prose"
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
            label: brandKitLocaleEs.beliefs,
            count: essence.beliefs?.length,
            content: essence.beliefs?.length ? (
              <BrandKitCapsuleList
                items={essence.beliefs.map((belief) =>
                  belief.explanation ? { label: belief.label, detail: belief.explanation } : belief.label,
                )}
              />
            ) : null,
          },
          {
            id: "evidence",
            label: brandKitLocaleEs.evidence,
            count: evidenceQuotes.length,
            content: <EvidenceList quotes={evidenceQuotes} hideLabel />,
          },
          {
            id: "detail",
            label: brandKitLocaleEs.detail,
            count: detailLines.length,
            content: detailLines.length ? (
              <BrandKitCapsuleList
                items={detailLines.map((line) => ({ label: line.label, detail: line.value }))}
              />
            ) : null,
          },
        ]}
        footer={<BrandKitSupplementalPanel slot={slot} />}
      />
      </>
    );
  }

  return (
    <DnaBlock
      label={brandKitLocaleEs.essence}
      slotId={slotId}
      slot={slot}
      onAction={onAction}
      primaryAction={primaryAction}
      secondaryActions={isMosaic ? undefined : editButton}
      activeSlotId={activeSlotId}
    >
      {body}
    </DnaBlock>
  );
}
