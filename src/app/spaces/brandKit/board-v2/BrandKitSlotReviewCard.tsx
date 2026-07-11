"use client";

import React, { useMemo } from "react";
import type { Candidate, SlotAction, SlotId } from "@/lib/brandkit/brand-kit-types";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import {
  buildReconcileOptionDetail,
  isSemanticCandidateSlot,
  reconcileCandidateSourceLabel,
} from "@/lib/brandkit/brand-kit-reconcile-ui";
import { BrandKitDecisionOptionCard } from "./BrandKitDecisionOptionCard";
import { BrandKitFoldderButton } from "./BrandKitFoldderButton";

const SLOT_LABEL: Record<"voice" | "essence" | "visualWorld", string> = {
  voice: brandKitLocaleEs.voice,
  essence: brandKitLocaleEs.essence,
  visualWorld: brandKitLocaleEs.visualWorld,
};

function isGalleryInsufficientReason(reason?: string): boolean {
  const normalized = reason?.toLowerCase() ?? "";
  return normalized.includes("galería insuficiente") || normalized.includes("galeria insuficiente");
}

export function BrandKitSlotReviewCard({
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
    brandKitLocaleEs.candidateSourceGenerated,
  );
  const reasonText = reviewReason?.trim()
    ? brandKitLocaleEs.reviewReasonExplain(reviewReason)
    : brandKitLocaleEs.reviewLead;

  const accept = () => {
    if (confirmMode === "lock") {
      onAction(slotId, { action: "lock" });
      return;
    }
    onAction(slotId, { action: "choose_candidate", candidateIndex });
  };

  return (
    <div
      className="brandKit-v2-reconcile brandKit-v2-reconcile--decision brandKit-v2-reconcile--review"
      data-testid="brandKit-slot-review-card"
    >
      <div className="brandKit-v2-reconcile__header">
        <p className="brandKit-v2-reconcile__eyebrow">{brandKitLocaleEs.reviewEyebrow(slotLabel)}</p>
        <p className="brandKit-v2-reconcile__title">{reasonText}</p>
        <p className="brandKit-v2-reconcile__hint">{brandKitLocaleEs.reviewHint(slotId)}</p>
      </div>

      <BrandKitDecisionOptionCard
        mode="preview"
        optionLabel={brandKitLocaleEs.reviewProposal}
        sourceLabel={sourceLabel}
        detail={detail}
        distinctChips={new Set()}
        distinctBullets={new Set()}
        distinctTraits={new Set()}
        distinctLimits={new Set()}
      />

      <div className="brandKit-v2-reconcile__primary brandKit-v2-reconcile__primary--split">
        <BrandKitFoldderButton onClick={accept}>{brandKitLocaleEs.reviewAccept(slotLabel)}</BrandKitFoldderButton>
        {onEdit ? (
          <BrandKitFoldderButton variant="muted" onClick={onEdit}>
            {brandKitLocaleEs.reviewEditFirst}
          </BrandKitFoldderButton>
        ) : null}
      </div>

      {isGalleryInsufficientReason(reviewReason) ? (
        <p className="brandKit-v2-reconcile__confirm-hint">{brandKitLocaleEs.reviewGalleryNote}</p>
      ) : null}
    </div>
  );
}
