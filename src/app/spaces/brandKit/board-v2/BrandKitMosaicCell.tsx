"use client";

import React from "react";
import type { SlotId, SlotState } from "@/lib/brandkit/brand-kit-types";
import { boardChapterLabel } from "./brand-kit-board-chapters";
import { BrandKitMosaicCellProvider } from "./brand-kit-mosaic-context";
import type { SlotMotionState } from "./use-brand-kit-board-slot-motion";

export type MosaicSurface = "primary" | "raised" | "page" | "accent";

function chapterGhostNumeral(slotId?: SlotId): string | null {
  if (!slotId) return null;
  const label = boardChapterLabel(slotId);
  if (!label) return null;
  return label.slice(0, 2).trim();
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
  children: React.ReactNode;
}) {
  const chapter = chapterLabel ?? (slotId ? boardChapterLabel(slotId) : null);
  const showGhostNumeral = showGhost;
  const ghost = showGhostNumeral ? (ghostNumeral ?? chapterGhostNumeral(slotId)) : null;
  const locked = Boolean(slot?.locked);
  const proposed = Boolean(slot && !slot.locked && (slot.status === "resolved" || slot.status === "candidates"));

  return (
    <section
      className={`brandKit-mosaic-cell brandKit-mosaic-cell--${mosaicKey} brandKit-mosaic-cell--surface-${surface}${alignSelf === "start" ? " brandKit-mosaic-cell--align-start" : ""}${ghostVacant ? " brandKit-mosaic-cell--ghost-vacant" : ""}${attentionClass}${motion ? tileMotionClass(motion) : ""}`}
      data-brandkit-slot={slotId}
      data-mosaic-key={mosaicKey}
      data-col-span={colSpan}
      style={alignSelf ? { alignSelf } : undefined}
      tabIndex={0}
      onAnimationEnd={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.animationName === "brandKit-tile-materialize" && slotId && onTileEnterEnd) {
          onTileEnterEnd(slotId);
        }
      }}
    >
      <BrandKitMosaicCellProvider>
        {showChapter && chapter ? (
          <div className="brandKit-mosaic-cell__chapter-row">
            <span className="brandKit-mosaic-cell__chapter">{chapter}</span>
            {showStatus && slot ? (
              <span className="brandKit-mosaic-cell__status" aria-label={locked ? "Confirmado" : "Propuesto"}>
                {locked ? "✓" : proposed ? "○" : ""}
              </span>
            ) : null}
          </div>
        ) : null}
        {ghost ? (
          <span className="brandKit-mosaic-cell__ghost" aria-hidden>
            {ghost}
          </span>
        ) : null}
        <div className="brandKit-mosaic-cell__content">{children}</div>
      </BrandKitMosaicCellProvider>
    </section>
  );
}
