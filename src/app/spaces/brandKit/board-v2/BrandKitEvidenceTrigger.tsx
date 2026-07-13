"use client";

import React, { useRef } from "react";
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
