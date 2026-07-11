"use client";

import React, { useMemo, useState } from "react";
import type { Candidate, SlotAction, SlotId } from "@/lib/brandkit/brand-kit-types";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import {
  buildReconcileOptionDetail,
  bulletsUniqueToOption,
  chipsUniqueToOption,
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

const SLOT_CONFIRM: Record<"voice" | "essence" | "visualWorld", string> = {
  voice: brandKitLocaleEs.confirmVoice,
  essence: brandKitLocaleEs.confirmEssence,
  visualWorld: brandKitLocaleEs.confirmVisualWorld,
};

export function BrandKitCandidatePicker({
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
      ? "brandKit-v2-reconcile__options--pick-3"
      : candidates.length === 2
        ? "brandKit-v2-reconcile__options--compare"
        : "brandKit-v2-reconcile__options--pick-1";

  return (
    <div className="brandKit-v2-reconcile brandKit-v2-reconcile--decision" data-testid="brandKit-candidate-picker">
      <div className="brandKit-v2-reconcile__header">
        <p className="brandKit-v2-reconcile__eyebrow">{brandKitLocaleEs.candidateDecisionEyebrow(slotLabel)}</p>
        <p className="brandKit-v2-reconcile__title">{brandKitLocaleEs.candidateDecisionLead(candidates.length)}</p>
        <p className="brandKit-v2-reconcile__hint">{brandKitLocaleEs.candidateCompareHint(slotId)}</p>
      </div>

      <div
        className={`brandKit-v2-reconcile__options ${pickGridClass}`}
        role="radiogroup"
        aria-label={brandKitLocaleEs.candidateDecisionLead(candidates.length)}
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
            <BrandKitDecisionOptionCard
              key={index}
              optionLabel={brandKitLocaleEs.candidateOption(index + 1)}
              sourceLabel={reconcileCandidateSourceLabel(
                candidate.provenance,
                brandKitLocaleEs.candidateSourceGenerated,
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
    </div>
  );
}
