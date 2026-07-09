"use client";

import React from "react";
import type { Candidate, SlotAction, SlotId, SlotReconciliation, SlotState } from "@/lib/genoma/genoma-types";
import { GenomaReconcileCard } from "./GenomaReconcileCard";
import { GenomaCandidatePicker } from "./GenomaCandidatePicker";
import { GenomaSlotReviewCard } from "./GenomaSlotReviewCard";

export function GenomaSemanticCandidates({
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
      <GenomaReconcileCard
        slotId={slotId}
        reconciliation={reconciliation as SlotReconciliation}
        candidates={slot.candidates}
        onAction={onAction}
      />
    );
  }

  if (slot.candidates.length === 1) {
    return (
      <GenomaSlotReviewCard
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
    return <GenomaCandidatePicker slotId={slotId} candidates={slot.candidates} onAction={onAction} />;
  }

  return null;
}
