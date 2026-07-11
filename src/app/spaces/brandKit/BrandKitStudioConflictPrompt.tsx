"use client";

import React from "react";
import type { BrandKitDocument, SlotId } from "@/lib/brandkit/brand-kit-types";
import { BRAND_KIT_SLOT_IDS } from "@/lib/brandkit/brand-kit-types";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import { slotLabel, summarizeBrandKitBoard } from "@/lib/brandkit/brand-kit-board-status";
import { BrandKitFoldderButton } from "./board-v2/BrandKitFoldderButton";

function conflictSlots(doc: BrandKitDocument): SlotId[] {
  return BRAND_KIT_SLOT_IDS.filter((id) => {
    const slot = doc.slots[id];
    return slot?.status === "candidates" && slot.reconciliation?.outcome === "contradiction";
  });
}

type BrandKitStudioConflictPromptProps = {
  doc: BrandKitDocument;
  onStartReview?: () => void;
  reviewMode?: boolean;
};

/** Aviso en sidebar cuando una ingesta nueva contradice material ya confirmado. */
export function BrandKitStudioConflictPrompt({
  doc,
  onStartReview,
  reviewMode = false,
}: BrandKitStudioConflictPromptProps) {
  const slots = conflictSlots(doc);
  if (!slots.length) return null;

  const first = slots[0];
  const slot = doc.slots[first];
  const incoming = slot?.reconciliation?.incomingSummary ?? "nueva fuente";
  const previous = slot?.reconciliation?.previousSummary ?? brandKitLocaleEs.reconcilePreviousDefault;
  const summary = summarizeBrandKitBoard(doc);

  return (
    <section className="brandKit-split-conflict" aria-label="Conflicto de material">
      <p className="brandKit-split-conflict__title">{brandKitLocaleEs.reconcileDecisionEyebrow(slotLabel(first))}</p>
      <p className="brandKit-split-conflict__lead">
        {brandKitLocaleEs.reconcileDecisionLead(slot?.reconciliation?.sourceLabel ?? incoming)}
      </p>
      <p className="brandKit-split-conflict__detail">
        {previous} → {incoming}
      </p>
      {onStartReview ? (
        <BrandKitFoldderButton onClick={onStartReview} disabled={reviewMode}>
          {brandKitLocaleEs.reviewAskButton(summary.needsYou)}
        </BrandKitFoldderButton>
      ) : null}
      {slots.length > 1 ? (
        <p className="brandKit-split-conflict__more">
          {brandKitLocaleEs.reconcileMoreConflicts(slots.length - 1)}
        </p>
      ) : null}
    </section>
  );
}
