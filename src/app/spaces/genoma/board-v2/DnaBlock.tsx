"use client";

import React, { useEffect, useMemo } from "react";
import { Lock, RotateCcw, Unlock } from "lucide-react";
import type { SlotAction, SlotId, SlotState } from "@/lib/genoma/genoma-types";
import { confirmLabelForSlot, genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import { getSlotAttention, type SlotAttention } from "@/lib/genoma/genoma-board-status";
import { GenomaFoldderButton } from "./GenomaFoldderButton";
import { boardChapterLabel } from "./genoma-board-chapters";
import { useGenomaMosaicCellOptional } from "./genoma-mosaic-context";

type DnaBlockProps = {
  label?: string;
  slotId?: SlotId;
  slot?: SlotState<unknown>;
  onAction?: (slotId: SlotId, action: SlotAction) => void;
  children: React.ReactNode;
  className?: string;
  chip?: string;
  primaryAction?: React.ReactNode;
  secondaryActions?: React.ReactNode;
  activeSlotId?: SlotId;
  headExtra?: React.ReactNode;
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
  activeSlotId,
  headExtra,
}: DnaBlockProps) {
  const mosaicCell = useGenomaMosaicCellOptional();
  const isMosaic = Boolean(mosaicCell);

  const hasToolbar = Boolean(slot && onAction && slotId && (slot.status === "resolved" || slot.history.length > 0));
  const confirmLabel = slotId ? confirmLabelForSlot[slotId] ?? genomaLocaleEs.confirm : genomaLocaleEs.confirm;
  const attention: SlotAttention =
    slot && slotId ? getSlotAttention(slot, activeSlotId) : { kind: null };
  const chapter = boardChapterLabel(slotId);

  const slotToolbar = useMemo(() => {
    if (!hasToolbar || !slot || !slotId || !onAction) return null;
    return (
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
    );
  }, [confirmLabel, hasToolbar, onAction, slot, slotId]);

  const mosaicActions = useMemo(
    () => (
      <>
        {secondaryActions}
        {headExtra}
        {primaryAction}
        {slotToolbar}
      </>
    ),
    [headExtra, primaryAction, secondaryActions, slotToolbar],
  );

  useEffect(() => {
    if (!mosaicCell) return;
    mosaicCell.setActionSlot("dna-block", mosaicActions);
    return () => mosaicCell.setActionSlot("dna-block", null);
  }, [mosaicActions, mosaicCell]);

  if (isMosaic) {
    return (
      <section
        className={`genoma-v2-block genoma-v2-block--mosaic${attention.kind ? ` genoma-v2-block--${attention.kind}` : ""} ${className}`.trim()}
      >
        <div className="genoma-v2-block__body">{children}</div>
      </section>
    );
  }

  return (
    <section
      className={`genoma-v2-block${attention.kind ? ` genoma-v2-block--${attention.kind}` : ""} ${className}`.trim()}
    >
      <header className="genoma-v2-block__head genoma-v2-block__head--chapter">
        {chapter ? (
          <span className="genoma-v2-chapter-label">{chapter}</span>
        ) : label ? (
          <span className="genoma-v2-block__label">{label}</span>
        ) : null}
        {chip ? <span className="genoma-v2-chip">{chip}</span> : null}
        {attention.kind && attention.label ? (
          <span className={`genoma-v2-chip genoma-v2-chip--${attention.kind}`}>{attention.label}</span>
        ) : null}
        {slot?.locked && attention.kind !== "locked" ? (
          <span className="genoma-v2-chip genoma-v2-chip--locked">{genomaLocaleEs.locked}</span>
        ) : null}
        {headExtra ? <div className="genoma-v2-block__head-extra">{headExtra}</div> : null}
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
