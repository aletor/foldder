"use client";

import React from "react";
import { Lock, RotateCcw, Unlock } from "lucide-react";
import type { SlotAction, SlotId, SlotState } from "@/lib/genoma/genoma-types";
import { confirmLabelForSlot, genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import { GenomaSlotIcon } from "./genoma-slot-icons";
import { GenomaFoldderButton } from "./GenomaFoldderButton";

type DnaBlockProps = {
  label: string;
  slotId?: SlotId;
  slot?: SlotState<unknown>;
  onAction?: (slotId: SlotId, action: SlotAction) => void;
  children: React.ReactNode;
  className?: string;
  chip?: string;
  primaryAction?: React.ReactNode;
  secondaryActions?: React.ReactNode;
};

export function DnaBlock({
  label,
  slotId,
  slot,
  onAction,
  children,
  className = "",
  chip,
  primaryAction,
  secondaryActions,
}: DnaBlockProps) {
  const hasToolbar = Boolean(slot && onAction && slotId && (slot.status === "resolved" || slot.history.length > 0));
  const confirmLabel = slotId ? confirmLabelForSlot[slotId] ?? genomaLocaleEs.confirm : genomaLocaleEs.confirm;

  const slotToolbar =
    hasToolbar && slot && slotId && onAction ? (
      <>
        {slot.status === "resolved" ? (
          slot.locked ? (
            <GenomaFoldderButton variant="muted" icon={Unlock} onClick={() => onAction(slotId, { action: "unlock" })}>
              {genomaLocaleEs.unlock}
            </GenomaFoldderButton>
          ) : (
            <GenomaFoldderButton icon={Lock} onClick={() => onAction(slotId, { action: "lock" })}>
              {confirmLabel}
            </GenomaFoldderButton>
          )
        ) : null}
        {slot.history.length > 0 ? (
          <GenomaFoldderButton variant="muted" icon={RotateCcw} onClick={() => onAction(slotId, { action: "revert" })}>
            {genomaLocaleEs.revert}
          </GenomaFoldderButton>
        ) : null}
      </>
    ) : null;

  return (
    <section className={`genoma-v2-block ${className}`.trim()}>
      <header className="genoma-v2-block__head">
        <GenomaSlotIcon slotId={slotId} />
        <span className="genoma-v2-block__label">{label}</span>
        {chip ? <span className="genoma-v2-chip">{chip}</span> : null}
        {slot?.locked ? <span className="genoma-v2-chip genoma-v2-chip--locked">{genomaLocaleEs.locked}</span> : null}
        {slot?.needsReviewReason ? (
          <span className="genoma-v2-chip genoma-v2-chip--warn">{genomaLocaleEs.needsReview}</span>
        ) : null}
        {secondaryActions ? <div className="genoma-v2-block__head-actions">{secondaryActions}</div> : null}
      </header>
      <div className="genoma-v2-block__body">{children}</div>
      {primaryAction || slotToolbar ? (
        <footer className="genoma-v2-block__foot">
          {primaryAction}
          {slotToolbar}
        </footer>
      ) : null}
    </section>
  );
}

export function ProvenanceChipV2({ label }: { label?: string }) {
  if (!label) return null;
  return <span className="genoma-v2-chip genoma-v2-chip--muted">{label}</span>;
}
