"use client";

import React from "react";
import type { Candidate, SlotAction, SlotId, SlotReconciliation, SlotState } from "@/lib/brandkit/brand-kit-types";
import { BrandKitReconcileCard } from "./BrandKitReconcileCard";
import { BrandKitCandidatePicker } from "./BrandKitCandidatePicker";
import { BrandKitSlotReviewCard } from "./BrandKitSlotReviewCard";

export function BrandKitSemanticCandidates({
  slotId,
  slot,
  onAction,
  onEdit,
}: {
  slotId: SlotId;
  slot: SlotState<unknown>;
  onAction: (slotId: SlotId, action: SlotAction) => void;
  onEdit?: () => void;
}) {
  if (slot.status !== "candidates") return null;

  const reconciliation = slot.reconciliation;
  if (reconciliation?.outcome === "contradiction") {
    return (
      <BrandKitReconcileCard
        slotId={slotId}
        reconciliation={reconciliation as SlotReconciliation}
        candidates={slot.candidates}
        onAction={onAction}
      />
    );
  }

  if (slot.candidates.length === 1) {
    return (
      <BrandKitSlotReviewCard
        slotId={slotId}
        candidate={slot.candidates[0]}
        reviewReason={slot.needsReviewReason}
        onAction={onAction}
        onEdit={onEdit}
        confirmMode="choose"
      />
    );
  }

  if (slot.candidates.length >= 2) {
    return <BrandKitCandidatePicker slotId={slotId} candidates={slot.candidates} onAction={onAction} />;
  }

  return null;
}
