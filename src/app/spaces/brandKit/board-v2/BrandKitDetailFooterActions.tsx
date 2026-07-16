"use client";

import React, { useEffect } from "react";
import { AlertTriangle, Lock, Pencil, RotateCcw, Unlock } from "lucide-react";
import type { SlotAction, SlotId, SlotState } from "@/lib/brandkit/brand-kit-types";
import { brandKitLocaleEs, confirmLabelForSlot } from "@/lib/brandkit/brand-kit-locale.es";
import { getSlotAttention } from "@/lib/brandkit/brand-kit-board-status";
import { BrandKitFoldderButton } from "./BrandKitFoldderButton";
import { useBrandKitMosaicBoard } from "./brand-kit-mosaic-context";
import type { MosaicDetailPayload } from "./brand-kit-mosaic-context";

export function useRegisterSlotDetail(slotId: SlotId | undefined, payload: MosaicDetailPayload | null) {
  const board = useBrandKitMosaicBoard();

  useEffect(() => {
    if (!board || !slotId) return;
    board.registerSlotDetail(slotId, payload);
    return () => board.registerSlotDetail(slotId, null);
  }, [board, payload, slotId]);
}

type BrandKitDetailFooterActionsProps = {
  slotId: SlotId;
  slot: SlotState<unknown>;
  onAction?: (slotId: SlotId, action: SlotAction) => void;
  onEdit?: () => void;
  onClose?: () => void;
};

export function BrandKitDetailFooterActions({
  slotId,
  slot,
  onAction,
  onEdit,
  onClose,
}: BrandKitDetailFooterActionsProps) {
  const confirmLabel = confirmLabelForSlot[slotId] ?? brandKitLocaleEs.confirm;
  const attention = getSlotAttention(slot);
  const hasConflict = attention.kind === "conflict";
  const canLock = slot.status === "resolved" && !slot.locked && onAction;
  const canUnlock = slot.locked && onAction;
  const canRevert = slot.history.length > 0 && onAction;

  return (
    <div className="brandKit-detail-footer-actions">
      {hasConflict ? (
        <BrandKitFoldderButton compact icon={AlertTriangle}>
          {brandKitLocaleEs.resolveConflict}
        </BrandKitFoldderButton>
      ) : null}
      {onEdit ? (
        <BrandKitFoldderButton variant="ghost" compact icon={Pencil} onClick={onEdit}>
          {brandKitLocaleEs.edit}
        </BrandKitFoldderButton>
      ) : null}
      {canLock ? (
        <BrandKitFoldderButton
          compact
          icon={Lock}
          onClick={() => {
            onAction(slotId, { action: "lock" });
            onClose?.();
          }}
        >
          {confirmLabel}
        </BrandKitFoldderButton>
      ) : null}
      {canUnlock ? (
        <BrandKitFoldderButton
          variant="ghost"
          compact
          icon={Unlock}
          onClick={() => onAction(slotId, { action: "unlock" })}
        >
          {brandKitLocaleEs.unlock}
        </BrandKitFoldderButton>
      ) : null}
      {canRevert ? (
        <BrandKitFoldderButton
          variant="ghost"
          compact
          icon={RotateCcw}
          onClick={() => onAction(slotId, { action: "revert" })}
          title={brandKitLocaleEs.restoreConfirmedVersion}
        >
          {brandKitLocaleEs.revert}
        </BrandKitFoldderButton>
      ) : null}
    </div>
  );
}
