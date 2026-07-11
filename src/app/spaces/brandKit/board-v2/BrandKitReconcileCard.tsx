"use client";

import React, { useMemo, useState } from "react";
import type { Candidate, SlotAction, SlotId, SlotReconciliation } from "@/lib/brandkit/brand-kit-types";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import {
  assertReconcileCandidates,
  buildReconcileOptionDetail,
  bulletsUniqueToOption,
  chipsUniqueToOption,
  reconcileCandidateSourceLabel,
  reconcileIncomingSourceLabel,
} from "@/lib/brandkit/brand-kit-reconcile-ui";
import { BrandKitDecisionOptionCard } from "./BrandKitDecisionOptionCard";
import { BrandKitFoldderButton } from "./BrandKitFoldderButton";

const SLOT_LABEL: Record<"voice" | "essence" | "visualWorld", string> = {
  voice: brandKitLocaleEs.voice,
  essence: brandKitLocaleEs.essence,
  visualWorld: brandKitLocaleEs.visualWorld,
};

const SLOT_CONFIRM: Record<"voice" | "essence" | "visualWorld", string> = {
  voice: brandKitLocaleEs.confirmVoice,
  essence: brandKitLocaleEs.confirmEssence,
  visualWorld: brandKitLocaleEs.confirmVisualWorld,
};

export function BrandKitReconcileCard({
  slotId,
  reconciliation,
  candidates,
  onAction,
}: {
  slotId: SlotId;
  reconciliation: SlotReconciliation;
  candidates: Candidate<unknown>[];
  onAction: (slotId: SlotId, action: SlotAction) => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState<0 | 1 | null>(null);

  const ready = assertReconcileCandidates(slotId, candidates);
  const slotLabel = SLOT_LABEL[slotId as keyof typeof SLOT_LABEL] ?? slotId;

  const previousDetail = useMemo(
    () => (ready ? buildReconcileOptionDetail(slotId, candidates[0].value, reconciliation.previousSummary) : null),
    [ready, slotId, candidates, reconciliation.previousSummary],
  );
  const incomingDetail = useMemo(
    () => (ready ? buildReconcileOptionDetail(slotId, candidates[1].value, reconciliation.incomingSummary) : null),
    [ready, slotId, candidates, reconciliation.incomingSummary],
  );

  if (reconciliation.outcome !== "contradiction" || !ready || !previousDetail || !incomingDetail) {
    return null;
  }

  const previousSourceLabel = reconcileCandidateSourceLabel(
    candidates[0].provenance,
    brandKitLocaleEs.reconcilePreviousDefault,
  );
  const incomingSourceLabel = reconcileIncomingSourceLabel(
    reconciliation.sourceLabel,
    candidates[1].provenance,
    brandKitLocaleEs.reconcileNewSource,
  );

  const confirmLabel = SLOT_CONFIRM[slotId as keyof typeof SLOT_CONFIRM] ?? brandKitLocaleEs.confirm;

  return (
    <div className="brandKit-v2-reconcile brandKit-v2-reconcile--decision" data-testid="brandKit-reconcile-card">
      <div className="brandKit-v2-reconcile__header">
        <p className="brandKit-v2-reconcile__eyebrow">{brandKitLocaleEs.reconcileDecisionEyebrow(slotLabel)}</p>
        <p className="brandKit-v2-reconcile__title">{brandKitLocaleEs.reconcileDecisionLead(incomingSourceLabel)}</p>
        <p className="brandKit-v2-reconcile__hint">{brandKitLocaleEs.reconcileCompareHint}</p>
      </div>

      <div
        className="brandKit-v2-reconcile__options brandKit-v2-reconcile__options--compare"
        role="radiogroup"
        aria-label={brandKitLocaleEs.reconcileDecisionAction}
      >
        <BrandKitDecisionOptionCard
          optionLabel={brandKitLocaleEs.reconcileOptionA}
          sourceLabel={previousSourceLabel}
          detail={previousDetail}
          distinctChips={chipsUniqueToOption(previousDetail.chips, incomingDetail.chips)}
          distinctBullets={bulletsUniqueToOption(previousDetail.bullets, incomingDetail.bullets)}
          selected={selectedIndex === 0}
          onSelect={() => setSelectedIndex(0)}
        />
        <BrandKitDecisionOptionCard
          optionLabel={brandKitLocaleEs.reconcileOptionB}
          sourceLabel={incomingSourceLabel}
          detail={incomingDetail}
          distinctChips={chipsUniqueToOption(incomingDetail.chips, previousDetail.chips)}
          distinctBullets={bulletsUniqueToOption(incomingDetail.bullets, previousDetail.bullets)}
          selected={selectedIndex === 1}
          onSelect={() => setSelectedIndex(1)}
        />
      </div>

      <div className="brandKit-v2-reconcile__primary">
        <BrandKitFoldderButton
          disabled={selectedIndex === null}
          onClick={() => {
            if (selectedIndex === null) return;
            onAction(slotId, { action: "choose_candidate", candidateIndex: selectedIndex });
          }}
        >
          {confirmLabel}
        </BrandKitFoldderButton>
        {selectedIndex === null ? (
          <p className="brandKit-v2-reconcile__confirm-hint">{brandKitLocaleEs.reconcileSelectHint}</p>
        ) : null}
      </div>

      <div className="brandKit-v2-reconcile__secondary">
        <button
          type="button"
          className="brandKit-v2-reconcile__secondary-btn"
          onClick={() => onAction(slotId, { action: "merge_candidates", candidateIndices: [0, 1] })}
        >
          <span>{brandKitLocaleEs.reconcileMergeAction}</span>
          <span className="brandKit-v2-reconcile__secondary-hint">{brandKitLocaleEs.reconcileMergeHint}</span>
        </button>
        <button
          type="button"
          className="brandKit-v2-reconcile__secondary-btn"
          onClick={() => onAction(slotId, { action: "dismiss_candidate", candidateIndex: 1 })}
        >
          <span>{brandKitLocaleEs.reconcileIgnoreAction}</span>
          <span className="brandKit-v2-reconcile__secondary-hint">{brandKitLocaleEs.reconcileIgnoreHint}</span>
        </button>
      </div>
    </div>
  );
}
