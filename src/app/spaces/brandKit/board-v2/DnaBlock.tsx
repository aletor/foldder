"use client";

import React, { useEffect, useMemo } from "react";
import { Lock, RotateCcw, Unlock } from "lucide-react";
import type { SlotAction, SlotId, SlotState } from "@/lib/brandkit/brand-kit-types";
import { confirmLabelForSlot, brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import { getSlotAttention, type SlotAttention } from "@/lib/brandkit/brand-kit-board-status";
import { BrandKitFoldderButton } from "./BrandKitFoldderButton";
import { boardChapterLabel } from "./brand-kit-board-chapters";
import { useBrandKitMosaicCellOptional } from "./brand-kit-mosaic-context";

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
  const mosaicCell = useBrandKitMosaicCellOptional();
  const isMosaic = Boolean(mosaicCell);

  const hasToolbar = Boolean(slot && onAction && slotId && (slot.status === "resolved" || slot.history.length > 0));
  const confirmLabel = slotId ? confirmLabelForSlot[slotId] ?? brandKitLocaleEs.confirm : brandKitLocaleEs.confirm;
  const attention: SlotAttention =
    slot && slotId ? getSlotAttention(slot, activeSlotId) : { kind: null };
  const chapter = boardChapterLabel(slotId);

  const slotToolbar = useMemo(() => {
    if (!hasToolbar || !slot || !slotId || !onAction) return null;
    return (
      <>
        {slot.status === "resolved" ? (
          slot.locked ? (
            <BrandKitFoldderButton variant="muted" icon={Unlock} onClick={() => onAction(slotId, { action: "unlock" })}>
              {brandKitLocaleEs.unlock}
            </BrandKitFoldderButton>
          ) : (
            <BrandKitFoldderButton icon={Lock} onClick={() => onAction(slotId, { action: "lock" })}>
              {confirmLabel}
            </BrandKitFoldderButton>
          )
        ) : null}
        {slot.history.length > 0 ? (
          <BrandKitFoldderButton variant="muted" icon={RotateCcw} onClick={() => onAction(slotId, { action: "revert" })}>
            {brandKitLocaleEs.revert}
          </BrandKitFoldderButton>
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
        className={`brandKit-v2-block brandKit-v2-block--mosaic${attention.kind ? ` brandKit-v2-block--${attention.kind}` : ""} ${className}`.trim()}
      >
        <div className="brandKit-v2-block__body">{children}</div>
      </section>
    );
  }

  return (
    <section
      className={`brandKit-v2-block${attention.kind ? ` brandKit-v2-block--${attention.kind}` : ""} ${className}`.trim()}
    >
      <header className="brandKit-v2-block__head brandKit-v2-block__head--chapter">
        {chapter ? (
          <span className="brandKit-v2-chapter-label">{chapter}</span>
        ) : label ? (
          <span className="brandKit-v2-block__label">{label}</span>
        ) : null}
        {chip ? <span className="brandKit-v2-chip">{chip}</span> : null}
        {attention.kind && attention.label ? (
          <span className={`brandKit-v2-chip brandKit-v2-chip--${attention.kind}`}>{attention.label}</span>
        ) : null}
        {slot?.locked && attention.kind !== "locked" ? (
          <span className="brandKit-v2-chip brandKit-v2-chip--locked">{brandKitLocaleEs.locked}</span>
        ) : null}
        {headExtra ? <div className="brandKit-v2-block__head-extra">{headExtra}</div> : null}
        {secondaryActions ? <div className="brandKit-v2-block__head-actions">{secondaryActions}</div> : null}
      </header>
      <div className="brandKit-v2-block__body">{children}</div>
      {primaryAction || slotToolbar ? (
        <footer className="brandKit-v2-block__foot">
          {primaryAction}
          {slotToolbar}
        </footer>
      ) : null}
    </section>
  );
}

export function ProvenanceChipV2({ label }: { label?: string }) {
  if (!label) return null;
  return <span className="brandKit-v2-chip brandKit-v2-chip--muted">{label}</span>;
}
