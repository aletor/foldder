"use client";

import React, { useState } from "react";
import type { SlotId, SlotState } from "@/lib/brandkit/brand-kit-types";
import { boardChapterLabel, boardChapterNumber } from "./brand-kit-board-chapters";
import { BRAND_KIT_BOARD_CHAPTER_TITLE } from "@/lib/brandkit/studio/brand-kit-mosaic-order";
import {
  BrandKitMosaicCellProvider,
  MosaicCellChapterToolbar,
  useBrandKitMosaicBoard,
  type MosaicSurfaceOverride,
} from "./brand-kit-mosaic-context";
import { resolveMosaicCellStatus } from "./brand-kit-mosaic-cell-status";
import { useBrandKitReaderCellProps, useBrandKitEditCellProps } from "./BrandKitReaderOverlay";
import type { SlotMotionState } from "./use-brand-kit-board-slot-motion";

export type MosaicSurface = "primary" | "raised" | "page" | "accent";

function chapterGhostNumeral(slotId?: SlotId): string | null {
  if (!slotId) return null;
  return boardChapterNumber(slotId);
}

function tileMotionClass(motion: SlotMotionState): string {
  if (motion.phase === "enter") return " brandKit-mosaic-cell--materialize";
  if (motion.phase === "glow") return " brandKit-mosaic-cell--glow";
  return "";
}

export function BrandKitMosaicCell({
  slotId,
  surface = "raised",
  mosaicKey,
  slot,
  motion,
  onTileEnterEnd,
  attentionClass = "",
  showChapter = true,
  showGhost = true,
  showStatus = true,
  chapterLabel,
  ghostNumeral,
  colSpan = 12,
  alignSelf,
  ghostVacant = false,
  activeSlotId,
  children,
}: {
  slotId?: SlotId;
  surface?: MosaicSurface;
  mosaicKey: string;
  slot?: SlotState<unknown>;
  motion?: SlotMotionState;
  onTileEnterEnd?: (slotId: SlotId) => void;
  attentionClass?: string;
  showChapter?: boolean;
  showGhost?: boolean;
  showStatus?: boolean;
  chapterLabel?: string;
  ghostNumeral?: string;
  colSpan?: number;
  alignSelf?: "start" | "stretch";
  ghostVacant?: boolean;
  activeSlotId?: SlotId;
  children: React.ReactNode;
}) {
  const chapter = chapterLabel ?? (slotId ? boardChapterLabel(slotId) : null);
  const chapterNum = slotId ? boardChapterNumber(slotId) : null;
  const chapterTitle = slotId ? BRAND_KIT_BOARD_CHAPTER_TITLE[slotId] : null;
  const showGhostNumeral = showGhost;
  const ghost = showGhostNumeral ? (ghostNumeral ?? chapterGhostNumeral(slotId)) : null;
  const mosaicBoard = useBrandKitMosaicBoard();
  const isPresentation = mosaicBoard?.studioMode === "presentation";
  const readerProps = useBrandKitReaderCellProps(slotId);
  const editProps = useBrandKitEditCellProps(slotId);
  const navSelected = Boolean(
    slotId &&
      (mosaicBoard?.studioMode === "edit"
        ? mosaicBoard?.selectedSlotId === slotId
        : mosaicBoard?.selectedNavId === slotId),
  );
  const [surfaceOverride, setSurfaceOverride] = useState<MosaicSurfaceOverride | null>(null);
  const cellStatus = resolveMosaicCellStatus(slot, activeSlotId);
  const showStatusChip = showStatus && !isPresentation && cellStatus.label;

  const sectionStyle: React.CSSProperties | undefined = surfaceOverride
    ? {
        background: surfaceOverride.background,
        color: surfaceOverride.color,
        ...(alignSelf ? { alignSelf } : {}),
      }
    : alignSelf
      ? { alignSelf }
      : undefined;

  return (
    <BrandKitMosaicCellProvider chapterToolbar onSurfaceOverrideChange={setSurfaceOverride}>
      <section
        className={`brandKit-mosaic-cell brandKit-mosaic-cell--${mosaicKey} brandKit-mosaic-cell--surface-${surface}${surfaceOverride ? " brandKit-mosaic-cell--surface-custom" : ""}${alignSelf === "start" ? " brandKit-mosaic-cell--align-start" : ""}${ghostVacant ? " brandKit-mosaic-cell--ghost-vacant" : ""}${navSelected ? " brandKit-mosaic-cell--nav-selected" : ""}${readerProps.presentationReadable ? " brandKit-mosaic-cell--presentation-readable" : ""}${editProps.editSelectable ? " brandKit-mosaic-cell--edit-selectable" : ""}${readerProps.readerOpen ? " brandKit-mosaic-cell--reader-open" : ""}${attentionClass}${motion ? tileMotionClass(motion) : ""}`}
        data-brandkit-slot={slotId}
        data-mosaic-key={mosaicKey}
        data-col-span={colSpan}
        style={sectionStyle}
        tabIndex={readerProps.presentationReadable ? 0 : editProps.editSelectable ? 0 : undefined}
        role={readerProps.presentationReadable ? "button" : editProps.editSelectable ? "button" : undefined}
        aria-label={
          readerProps.presentationReadable && chapter
            ? `${chapter} — ampliar lectura`
            : editProps.editSelectable && chapter
              ? `${chapter} — seleccionar`
              : undefined
        }
        onClick={(event) => {
          readerProps.onClick(event);
          editProps.onClick(event);
        }}
        onKeyDown={readerProps.onKeyDown}
        onAnimationEnd={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.animationName === "brandKit-tile-materialize" && slotId && onTileEnterEnd) {
            onTileEnterEnd(slotId);
          }
        }}
      >
        {showChapter && (chapterNum || chapter) ? (
          <div className="brandKit-mosaic-cell__chapter-row">
            <div className="brandKit-mosaic-cell__chapter-group">
              {chapterNum ? (
                <span className="brandKit-mosaic-cell__chapter-num">{chapterNum}</span>
              ) : null}
              <span className="brandKit-mosaic-cell__chapter">
                {chapterTitle ?? chapter}
              </span>
            </div>
            <div className="brandKit-mosaic-cell__chapter-meta">
              {showStatusChip ? (
                <span
                  className={`brandKit-mosaic-cell__status brandKit-mosaic-cell__status--${cellStatus.tone}`}
                  aria-label={cellStatus.label ?? undefined}
                >
                  {cellStatus.label}
                </span>
              ) : null}
              {!isPresentation && navSelected ? <MosaicCellChapterToolbar /> : null}
            </div>
          </div>
        ) : null}
        {ghost ? (
          <span className="brandKit-mosaic-cell__ghost" aria-hidden>
            {ghost}
          </span>
        ) : null}
        <div className="brandKit-mosaic-cell__content">{children}</div>
      </section>
    </BrandKitMosaicCellProvider>
  );
}
