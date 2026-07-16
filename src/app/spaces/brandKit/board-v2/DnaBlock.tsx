"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { BookOpen, Lock } from "lucide-react";
import type { SlotAction, SlotId, SlotState } from "@/lib/brandkit/brand-kit-types";
import { brandKitLocaleEs, confirmLabelForSlot } from "@/lib/brandkit/brand-kit-locale.es";
import { getSlotAttention, type SlotAttention } from "@/lib/brandkit/brand-kit-board-status";
import { BrandKitFoldderButton } from "./BrandKitFoldderButton";
import { boardChapterLabel } from "./brand-kit-board-chapters";
import {
  MOSAIC_CELL_ACTION_MENU,
  MOSAIC_CELL_ACTION_PRIMARY,
  MOSAIC_CELL_ACTION_SECONDARY,
  useBrandKitMosaicBoard,
  useBrandKitMosaicCellOptional,
} from "./brand-kit-mosaic-context";
import { BrandKitCellContextMenu } from "./BrandKitCellContextMenu";

type DnaBlockProps = {
  label?: string;
  slotId?: SlotId;
  slot?: SlotState<unknown>;
  onAction?: (slotId: SlotId, action: SlotAction) => void;
  children: React.ReactNode;
  className?: string;
  chip?: string;
  /** Acción primaria de sección (p. ej. Generar). Solo visible con el bloque seleccionado. */
  primaryAction?: React.ReactNode;
  secondaryActions?: React.ReactNode;
  activeSlotId?: SlotId;
  headExtra?: React.ReactNode;
};

/**
 * En mosaico, las acciones van a la barra contextual del capítulo
 * y solo se muestran cuando la celda está seleccionada (CSS + toolbar).
 */
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
  const mosaicBoard = useBrandKitMosaicBoard();
  const isMosaic = Boolean(mosaicCell);
  const isPresentation = mosaicBoard?.studioMode === "presentation";
  const isEdit = mosaicBoard?.studioMode === "edit";
  const isSelected = Boolean(isEdit && slotId && mosaicBoard?.selectedSlotId === slotId);

  const attention: SlotAttention =
    slot && slotId ? getSlotAttention(slot, activeSlotId) : { kind: null };
  const chapter = boardChapterLabel(slotId);

  const canOpenStudy = Boolean(slotId && slot && slot.status !== "empty");

  const studyAction = useMemo(() => {
    if (!isEdit || !canOpenStudy || !slotId || !mosaicBoard) return null;
    return (
      <BrandKitFoldderButton
        variant="muted"
        compact
        icon={BookOpen}
        onClick={(event) => {
          event.stopPropagation();
          mosaicBoard.inspectSlot(slotId, "synthesis");
        }}
      >
        {brandKitLocaleEs.editInStudio}
      </BrandKitFoldderButton>
    );
  }, [canOpenStudy, isEdit, mosaicBoard, slotId]);

  const confirmAction = useMemo(() => {
    if (!isEdit || !slot || !slotId || !onAction) return null;
    if (slot.locked || slot.status !== "resolved") return null;
    const confirmLabel = confirmLabelForSlot[slotId] ?? brandKitLocaleEs.confirm;
    return (
      <BrandKitFoldderButton
        compact
        icon={Lock}
        onClick={(event) => {
          event.stopPropagation();
          onAction(slotId, { action: "lock" });
        }}
      >
        {confirmLabel}
      </BrandKitFoldderButton>
    );
  }, [isEdit, onAction, slot, slotId]);

  const menuItems = useMemo(() => {
    if (!slot || !slotId || !onAction) return [];
    const items = [];
    if (slot.locked) {
      items.push({
        id: "unlock",
        label: brandKitLocaleEs.unlock,
        onClick: () => onAction(slotId, { action: "unlock" }),
      });
    }
    if (slot.history.length > 0) {
      items.push({
        id: "revert",
        label: brandKitLocaleEs.restoreConfirmedVersion,
        onClick: () => onAction(slotId, { action: "revert" }),
      });
    }
    return items;
  }, [onAction, slot, slotId]);

  const cellMenu = useMemo(() => {
    if (!menuItems.length) return null;
    return <BrandKitCellContextMenu items={menuItems} ariaLabel={brandKitLocaleEs.cellMenuMore} />;
  }, [menuItems]);

  /** Orden barra: [primaria sección] · Confirmar · Editar en estudio · ··· */
  const cellPrimaryRef = useRef(primaryAction ?? null);
  cellPrimaryRef.current = primaryAction ?? null;
  const cellSecondaryRef = useRef(
    (
      <>
        {confirmAction}
        {studyAction}
        {secondaryActions}
      </>
    ),
  );
  cellSecondaryRef.current = (
    <>
      {confirmAction}
      {studyAction}
      {secondaryActions}
    </>
  );
  const cellMenuRef = useRef(cellMenu);
  cellMenuRef.current = cellMenu;

  const mosaicActionSignature = [
    Boolean(primaryAction),
    Boolean(confirmAction),
    Boolean(studyAction),
    Boolean(secondaryActions),
    slot?.locked,
    slot?.status,
    slot?.history.length,
    menuItems.length,
    isEdit,
    isSelected,
  ].join("|");

  useEffect(() => {
    if (!mosaicCell || isPresentation) return;
    if (!isSelected) {
      mosaicCell.setActionSlot(MOSAIC_CELL_ACTION_PRIMARY, null);
      mosaicCell.setActionSlot(MOSAIC_CELL_ACTION_SECONDARY, null);
      mosaicCell.setActionSlot(MOSAIC_CELL_ACTION_MENU, null);
      return () => {
        mosaicCell.setActionSlot(MOSAIC_CELL_ACTION_PRIMARY, null);
        mosaicCell.setActionSlot(MOSAIC_CELL_ACTION_SECONDARY, null);
        mosaicCell.setActionSlot(MOSAIC_CELL_ACTION_MENU, null);
      };
    }
    mosaicCell.setActionSlot(MOSAIC_CELL_ACTION_PRIMARY, cellPrimaryRef.current);
    mosaicCell.setActionSlot(MOSAIC_CELL_ACTION_SECONDARY, cellSecondaryRef.current);
    mosaicCell.setActionSlot(MOSAIC_CELL_ACTION_MENU, cellMenuRef.current);
    return () => {
      mosaicCell.setActionSlot(MOSAIC_CELL_ACTION_PRIMARY, null);
      mosaicCell.setActionSlot(MOSAIC_CELL_ACTION_SECONDARY, null);
      mosaicCell.setActionSlot(MOSAIC_CELL_ACTION_MENU, null);
    };
  }, [isEdit, isPresentation, isSelected, mosaicActionSignature, mosaicCell]);

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
      {primaryAction ? <footer className="brandKit-v2-block__foot">{primaryAction}</footer> : null}
    </section>
  );
}

export function ProvenanceChipV2({ label }: { label?: string }) {
  if (!label) return null;
  return <span className="brandKit-v2-chip brandKit-v2-chip--muted">{label}</span>;
}
