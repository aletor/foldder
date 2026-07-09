"use client";

import React, { useMemo } from "react";
import type { Candidate, SlotAction, SlotId } from "@/lib/genoma/genoma-types";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import {
  buildReconcileOptionDetail,
  isSemanticCandidateSlot,
  reconcileCandidateSourceLabel,
} from "@/lib/genoma/genoma-reconcile-ui";
import { GenomaDecisionOptionCard } from "./GenomaDecisionOptionCard";
import { GenomaFoldderButton } from "./GenomaFoldderButton";

const SLOT_LABEL: Record<"voice" | "essence" | "visualWorld", string> = {
  voice: genomaLocaleEs.voice,
  essence: genomaLocaleEs.essence,
  visualWorld: genomaLocaleEs.visualWorld,
};

function isGalleryInsufficientReason(reason?: string): boolean {
  const normalized = reason?.toLowerCase() ?? "";
  return normalized.includes("galería insuficiente") || normalized.includes("galeria insuficiente");
}

export function GenomaSlotReviewCard({
  slotId,
  candidate,
  reviewReason,
  onAction,
  onEdit,
  confirmMode = "choose",
  candidateIndex = 0,
}: {
  slotId: SlotId;
  candidate: Candidate<unknown>;
  reviewReason?: string;
  onAction: (slotId: SlotId, action: SlotAction) => void;
  onEdit?: () => void;
  confirmMode?: "choose" | "lock";
  candidateIndex?: number;
}) {
  const detail = useMemo(
    () => (isSemanticCandidateSlot(slotId) ? buildReconcileOptionDetail(slotId, candidate.value) : null),
    [slotId, candidate.value],
  );

  if (!isSemanticCandidateSlot(slotId) || !detail) return null;

  const slotLabel = SLOT_LABEL[slotId];
  const sourceLabel = reconcileCandidateSourceLabel(
    candidate.provenance,
    genomaLocaleEs.candidateSourceGenerated,
  );
  const reasonText = reviewReason?.trim()
    ? genomaLocaleEs.reviewReasonExplain(reviewReason)
    : genomaLocaleEs.reviewLead;

  const accept = () => {
    if (confirmMode === "lock") {
      onAction(slotId, { action: "lock" });
      return;
    }
    onAction(slotId, { action: "choose_candidate", candidateIndex });
  };

  return (
    <div
      className="genoma-v2-reconcile genoma-v2-reconcile--decision genoma-v2-reconcile--review"
      data-testid="genoma-slot-review-card"
    >
      <div className="genoma-v2-reconcile__header">
        <p className="genoma-v2-reconcile__eyebrow">{genomaLocaleEs.reviewEyebrow(slotLabel)}</p>
        <p className="genoma-v2-reconcile__title">{reasonText}</p>
        <p className="genoma-v2-reconcile__hint">{genomaLocaleEs.reviewHint(slotId)}</p>
      </div>

      <GenomaDecisionOptionCard
        mode="preview"
        optionLabel={genomaLocaleEs.reviewProposal}
        sourceLabel={sourceLabel}
        detail={detail}
        distinctChips={new Set()}
        distinctBullets={new Set()}
        distinctTraits={new Set()}
        distinctLimits={new Set()}
      />

      <div className="genoma-v2-reconcile__primary genoma-v2-reconcile__primary--split">
        <GenomaFoldderButton onClick={accept}>{genomaLocaleEs.reviewAccept(slotLabel)}</GenomaFoldderButton>
        {onEdit ? (
          <GenomaFoldderButton variant="muted" onClick={onEdit}>
            {genomaLocaleEs.reviewEditFirst}
          </GenomaFoldderButton>
        ) : null}
      </div>

      {isGalleryInsufficientReason(reviewReason) ? (
        <p className="genoma-v2-reconcile__confirm-hint">{genomaLocaleEs.reviewGalleryNote}</p>
      ) : null}
    </div>
  );
}
