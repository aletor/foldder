"use client";

import React, { useMemo, useState } from "react";
import type { Candidate, SlotAction, SlotId } from "@/lib/genoma/genoma-types";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import {
  buildReconcileOptionDetail,
  bulletsUniqueToOption,
  chipsUniqueToOption,
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

const SLOT_CONFIRM: Record<"voice" | "essence" | "visualWorld", string> = {
  voice: genomaLocaleEs.confirmVoice,
  essence: genomaLocaleEs.confirmEssence,
  visualWorld: genomaLocaleEs.confirmVisualWorld,
};

export function GenomaCandidatePicker({
  slotId,
  candidates,
  onAction,
}: {
  slotId: SlotId;
  candidates: Candidate<unknown>[];
  onAction: (slotId: SlotId, action: SlotAction) => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const details = useMemo(
    () => candidates.map((candidate) => buildReconcileOptionDetail(slotId, candidate.value)),
    [candidates, slotId],
  );

  if (!isSemanticCandidateSlot(slotId) || candidates.length < 2) return null;

  const slotLabel = SLOT_LABEL[slotId];
  const confirmLabel = SLOT_CONFIRM[slotId];

  const pickGridClass =
    candidates.length >= 3
      ? "genoma-v2-reconcile__options--pick-3"
      : candidates.length === 2
        ? "genoma-v2-reconcile__options--compare"
        : "genoma-v2-reconcile__options--pick-1";

  return (
    <div className="genoma-v2-reconcile genoma-v2-reconcile--decision" data-testid="genoma-candidate-picker">
      <div className="genoma-v2-reconcile__header">
        <p className="genoma-v2-reconcile__eyebrow">{genomaLocaleEs.candidateDecisionEyebrow(slotLabel)}</p>
        <p className="genoma-v2-reconcile__title">{genomaLocaleEs.candidateDecisionLead(candidates.length)}</p>
        <p className="genoma-v2-reconcile__hint">{genomaLocaleEs.candidateCompareHint(slotId)}</p>
      </div>

      <div
        className={`genoma-v2-reconcile__options ${pickGridClass}`}
        role="radiogroup"
        aria-label={genomaLocaleEs.candidateDecisionLead(candidates.length)}
      >
        {candidates.map((candidate, index) => {
          const otherChips = details.flatMap((detail, detailIndex) => (detailIndex === index ? [] : detail.chips));
          const otherBullets = details.flatMap((detail, detailIndex) =>
            detailIndex === index ? [] : detail.bullets,
          );
          const otherTraits = details.flatMap((detail, detailIndex) =>
            detailIndex === index ? [] : detail.visualTraits ?? [],
          );
          const otherLimits = details.flatMap((detail, detailIndex) =>
            detailIndex === index ? [] : detail.limits ?? [],
          );

          return (
            <GenomaDecisionOptionCard
              key={index}
              optionLabel={genomaLocaleEs.candidateOption(index + 1)}
              sourceLabel={reconcileCandidateSourceLabel(
                candidate.provenance,
                genomaLocaleEs.candidateSourceGenerated,
              )}
              detail={details[index]}
              distinctChips={chipsUniqueToOption(details[index].chips, otherChips)}
              distinctBullets={bulletsUniqueToOption(details[index].bullets, otherBullets)}
              distinctTraits={new Set((details[index].visualTraits ?? []).filter((trait) => !otherTraits.includes(trait)))}
              distinctLimits={new Set((details[index].limits ?? []).filter((limit) => !otherLimits.includes(limit)))}
              selected={selectedIndex === index}
              onSelect={() => setSelectedIndex(index)}
            />
          );
        })}
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
    </div>
  );
}
