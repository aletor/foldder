"use client";

import React, { useRef } from "react";
import type { SlotAction, SlotId, SlotState } from "@/lib/genoma/genoma-types";
import { GenomaEvidencePopover } from "./GenomaEvidencePopover";
import { useGenomaEvidencePopover } from "./GenomaEvidencePopoverContext";

export function GenomaEvidenceTrigger({
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
}: {
  id: string;
  slot?: SlotState<unknown>;
  slotId?: SlotId;
  provenance?: SlotState<unknown>["provenance"];
  confidence?: number;
  rankSignals?: string[];
  onAction?: (slotId: SlotId, action: SlotAction) => void;
  onCorrect?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { openId, open, close } = useGenomaEvidencePopover();
  const isOpen = openId === id;

  if (!slot && !provenance) return <>{children}</>;

  return (
    <div ref={wrapRef} className={`genoma-evidence-wrap${className ? ` ${className}` : ""}`}>
      {children}
      <button
        ref={triggerRef}
        type="button"
        className="genoma-evidence-trigger"
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
      <GenomaEvidencePopover
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
    </div>
  );
}
