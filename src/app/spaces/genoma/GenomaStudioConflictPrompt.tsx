"use client";

import React from "react";
import type { GenomaDocument, SlotId } from "@/lib/genoma/genoma-types";
import { GENOMA_SLOT_IDS } from "@/lib/genoma/genoma-types";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import { slotLabel } from "@/lib/genoma/genoma-board-status";
import { scrollToGenomaBoardSlot } from "./board-v2/genoma-board-scroll";
import { GenomaFoldderButton } from "./board-v2/GenomaFoldderButton";

function conflictSlots(doc: GenomaDocument): SlotId[] {
  return GENOMA_SLOT_IDS.filter((id) => {
    const slot = doc.slots[id];
    return slot?.status === "candidates" && slot.reconciliation?.outcome === "contradiction";
  });
}

type GenomaStudioConflictPromptProps = {
  doc: GenomaDocument;
};

/** Aviso en sidebar cuando una ingesta nueva contradice material ya confirmado. */
export function GenomaStudioConflictPrompt({ doc }: GenomaStudioConflictPromptProps) {
  const slots = conflictSlots(doc);
  if (!slots.length) return null;

  const first = slots[0];
  const slot = doc.slots[first];
  const incoming = slot?.reconciliation?.incomingSummary ?? "nueva fuente";
  const previous = slot?.reconciliation?.previousSummary ?? genomaLocaleEs.reconcilePreviousDefault;

  return (
    <section className="genoma-split-conflict" aria-label="Conflicto de material">
      <p className="genoma-split-conflict__title">{genomaLocaleEs.reconcileDecisionEyebrow(slotLabel(first))}</p>
      <p className="genoma-split-conflict__lead">
        {genomaLocaleEs.reconcileDecisionLead(slot?.reconciliation?.sourceLabel ?? incoming)}
      </p>
      <p className="genoma-split-conflict__detail">
        {previous} → {incoming}
      </p>
      <GenomaFoldderButton variant="muted" onClick={() => scrollToGenomaBoardSlot(first)}>
        {genomaLocaleEs.reconcileOpenBlock(slotLabel(first))}
      </GenomaFoldderButton>
      {slots.length > 1 ? (
        <p className="genoma-split-conflict__more">
          {genomaLocaleEs.reconcileMoreConflicts(slots.length - 1)}
        </p>
      ) : null}
    </section>
  );
}
