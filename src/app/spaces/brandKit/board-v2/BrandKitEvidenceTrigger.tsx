"use client";

import React, { useEffect, useMemo, useRef } from "react";
import type { SlotAction, SlotId, SlotState } from "@/lib/brandkit/brand-kit-types";
import { BrandKitEvidencePopover } from "./BrandKitEvidencePopover";
import { useBrandKitEvidencePopover } from "./BrandKitEvidencePopoverContext";
import { useBrandKitMosaicCellOptional } from "./brand-kit-mosaic-context";

type EvidencePopoverProps = {
  id: string;
  slot?: SlotState<unknown>;
  slotId?: SlotId;
  provenance?: SlotState<unknown>["provenance"];
  confidence?: number;
  rankSignals?: string[];
  onAction?: (slotId: SlotId, action: SlotAction) => void;
  onCorrect?: () => void;
};

function MosaicEvidenceBarAction({
  id,
  slot,
  slotId,
  provenance,
  confidence,
  rankSignals,
  onAction,
  onCorrect,
}: EvidencePopoverProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { openId, open, close } = useBrandKitEvidencePopover();
  const isOpen = openId === id;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="brandKit-mosaic-evidence-btn"
        aria-label="¿Por qué esto?"
        aria-expanded={isOpen}
        onClick={(event) => {
          event.stopPropagation();
          if (isOpen) close();
          else open(id);
        }}
      >
        ⓘ
      </button>
      <BrandKitEvidencePopover
        slot={slot}
        slotId={slotId}
        provenance={provenance}
        confidence={confidence}
        rankSignals={rankSignals}
        onAction={onAction}
        onCorrect={onCorrect}
        anchorRef={triggerRef}
        open={isOpen}
        onClose={close}
      />
    </>
  );
}

export function BrandKitEvidenceTrigger({
  id,
  slot,
  slotId,
  provenance,
  confidence,
  rankSignals,
  onAction,
  onCorrect,
  className = "",
  children,
}: EvidencePopoverProps & {
  className?: string;
  children: React.ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const mosaicCell = useBrandKitMosaicCellOptional();
  const isMosaic = Boolean(mosaicCell);
  const { openId, open, close } = useBrandKitEvidencePopover();
  const isOpen = openId === id;

  const barAction = useMemo(
    () =>
      isMosaic ? (
        <MosaicEvidenceBarAction
          id={id}
          slot={slot}
          slotId={slotId}
          provenance={provenance}
          confidence={confidence}
          rankSignals={rankSignals}
          onAction={onAction}
          onCorrect={onCorrect}
        />
      ) : null,
    [confidence, id, isMosaic, onAction, onCorrect, provenance, rankSignals, slot, slotId],
  );

  useEffect(() => {
    if (!isMosaic || !mosaicCell || (!slot && !provenance)) return;
    mosaicCell.setActionSlot(`evidence-${id}`, barAction);
    return () => mosaicCell.setActionSlot(`evidence-${id}`, null);
  }, [barAction, id, isMosaic, mosaicCell, provenance, slot]);

  if (!slot && !provenance) return <>{children}</>;

  return (
    <div ref={wrapRef} className={`brandKit-evidence-wrap${className ? ` ${className}` : ""}`}>
      {children}
      {!isMosaic ? (
        <>
          <button
            ref={triggerRef}
            type="button"
            className="brandKit-evidence-trigger"
            aria-label="¿Por qué esto?"
            aria-expanded={isOpen}
            onClick={(event) => {
              event.stopPropagation();
              if (isOpen) close();
              else open(id);
            }}
          >
            ⓘ
          </button>
          <BrandKitEvidencePopover
            slot={slot}
            slotId={slotId}
            provenance={provenance}
            confidence={confidence}
            rankSignals={rankSignals}
            onAction={onAction}
            onCorrect={onCorrect}
            anchorRef={triggerRef}
            open={isOpen}
            onClose={close}
          />
        </>
      ) : null}
    </div>
  );
}
