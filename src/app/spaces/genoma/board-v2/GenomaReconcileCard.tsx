"use client";

import React, { useMemo, useState } from "react";
import type { Candidate, SlotAction, SlotId, SlotReconciliation } from "@/lib/genoma/genoma-types";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import {
  assertReconcileCandidates,
  buildReconcileOptionDetail,
  bulletsUniqueToOption,
  chipsUniqueToOption,
  reconcileCandidateSourceLabel,
  reconcileIncomingSourceLabel,
} from "@/lib/genoma/genoma-reconcile-ui";
import { GenomaDecisionOptionCard } from "./GenomaDecisionOptionCard";
import { GenomaFoldderButton } from "./GenomaFoldderButton";

const SLOT_LABEL: Record<"voice" | "essence" | "visualWorld", string> = {
  voice: genomaLocaleEs.voice,
  essence: genomaLocaleEs.essence,
  visualWorld: genomaLocaleEs.visualWorld,
};

const SLOT_CONFIRM: Record<"voice" | "essence" | "visualWorld", string> = {
  voice: genomaLocaleEs.confirmVoice,
  essence: genomaLocaleEs.confirmEssence,
  visualWorld: genomaLocaleEs.confirmVisualWorld,
};

export function GenomaReconcileCard({
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
    genomaLocaleEs.reconcilePreviousDefault,
  );
  const incomingSourceLabel = reconcileIncomingSourceLabel(
    reconciliation.sourceLabel,
    candidates[1].provenance,
    genomaLocaleEs.reconcileNewSource,
  );

  const confirmLabel = SLOT_CONFIRM[slotId as keyof typeof SLOT_CONFIRM] ?? genomaLocaleEs.confirm;

  return (
    <div className="genoma-v2-reconcile genoma-v2-reconcile--decision" data-testid="genoma-reconcile-card">
      <div className="genoma-v2-reconcile__header">
        <p className="genoma-v2-reconcile__eyebrow">{genomaLocaleEs.reconcileDecisionEyebrow(slotLabel)}</p>
        <p className="genoma-v2-reconcile__title">{genomaLocaleEs.reconcileDecisionLead(incomingSourceLabel)}</p>
        <p className="genoma-v2-reconcile__hint">{genomaLocaleEs.reconcileCompareHint}</p>
      </div>

      <div
        className="genoma-v2-reconcile__options genoma-v2-reconcile__options--compare"
        role="radiogroup"
        aria-label={genomaLocaleEs.reconcileDecisionAction}
      >
        <GenomaDecisionOptionCard
          optionLabel={genomaLocaleEs.reconcileOptionA}
          sourceLabel={previousSourceLabel}
          detail={previousDetail}
          distinctChips={chipsUniqueToOption(previousDetail.chips, incomingDetail.chips)}
          distinctBullets={bulletsUniqueToOption(previousDetail.bullets, incomingDetail.bullets)}
          selected={selectedIndex === 0}
          onSelect={() => setSelectedIndex(0)}
        />
        <GenomaDecisionOptionCard
          optionLabel={genomaLocaleEs.reconcileOptionB}
          sourceLabel={incomingSourceLabel}
          detail={incomingDetail}
          distinctChips={chipsUniqueToOption(incomingDetail.chips, previousDetail.chips)}
          distinctBullets={bulletsUniqueToOption(incomingDetail.bullets, previousDetail.bullets)}
          selected={selectedIndex === 1}
          onSelect={() => setSelectedIndex(1)}
        />
      </div>

      <div className="genoma-v2-reconcile__primary">
        <GenomaFoldderButton
          disabled={selectedIndex === null}
          onClick={() => {
            if (selectedIndex === null) return;
            onAction(slotId, { action: "choose_candidate", candidateIndex: selectedIndex });
          }}
        >
          {confirmLabel}
        </GenomaFoldderButton>
        {selectedIndex === null ? (
          <p className="genoma-v2-reconcile__confirm-hint">{genomaLocaleEs.reconcileSelectHint}</p>
        ) : null}
      </div>

      <div className="genoma-v2-reconcile__secondary">
        <button
          type="button"
          className="genoma-v2-reconcile__secondary-btn"
          onClick={() => onAction(slotId, { action: "merge_candidates", candidateIndices: [0, 1] })}
        >
          <span>{genomaLocaleEs.reconcileMergeAction}</span>
          <span className="genoma-v2-reconcile__secondary-hint">{genomaLocaleEs.reconcileMergeHint}</span>
        </button>
        <button
          type="button"
          className="genoma-v2-reconcile__secondary-btn"
          onClick={() => onAction(slotId, { action: "dismiss_candidate", candidateIndex: 1 })}
        >
          <span>{genomaLocaleEs.reconcileIgnoreAction}</span>
          <span className="genoma-v2-reconcile__secondary-hint">{genomaLocaleEs.reconcileIgnoreHint}</span>
        </button>
      </div>
    </div>
  );
}
