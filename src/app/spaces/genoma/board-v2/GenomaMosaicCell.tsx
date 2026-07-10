"use client";

import React from "react";
import type { SlotId, SlotState } from "@/lib/genoma/genoma-types";
import { boardChapterLabel } from "./genoma-board-chapters";
import { GenomaMosaicCellProvider } from "./genoma-mosaic-context";
import type { SlotMotionState } from "./use-genoma-board-slot-motion";

export type MosaicSurface = "primary" | "raised" | "page" | "accent";

function chapterGhostNumeral(slotId?: SlotId): string | null {
  if (!slotId) return null;
  const label = boardChapterLabel(slotId);
  if (!label) return null;
  return label.slice(0, 2).trim();
}

function tileMotionClass(motion: SlotMotionState): string {
  if (motion.phase === "enter") return " genoma-mosaic-cell--materialize";
  if (motion.phase === "glow") return " genoma-mosaic-cell--glow";
  return "";
}

export function GenomaMosaicCell({
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
  children: React.ReactNode;
}) {
  const chapter = chapterLabel ?? (slotId ? boardChapterLabel(slotId) : null);
  const showGhostNumeral = showGhost;
  const ghost = showGhostNumeral ? (ghostNumeral ?? chapterGhostNumeral(slotId)) : null;
  const locked = Boolean(slot?.locked);
  const proposed = Boolean(slot && !slot.locked && (slot.status === "resolved" || slot.status === "candidates"));

  return (
    <section
      className={`genoma-mosaic-cell genoma-mosaic-cell--${mosaicKey} genoma-mosaic-cell--surface-${surface}${alignSelf === "start" ? " genoma-mosaic-cell--align-start" : ""}${attentionClass}${motion ? tileMotionClass(motion) : ""}`}
      data-genoma-slot={slotId}
      data-mosaic-key={mosaicKey}
      data-col-span={colSpan}
      style={alignSelf ? { alignSelf } : undefined}
      tabIndex={0}
      onAnimationEnd={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.animationName === "genoma-tile-materialize" && slotId && onTileEnterEnd) {
          onTileEnterEnd(slotId);
        }
      }}
    >
      <GenomaMosaicCellProvider>
        {showChapter && chapter ? (
          <div className="genoma-mosaic-cell__chapter-row">
            <span className="genoma-mosaic-cell__chapter">{chapter}</span>
            {showStatus && slot ? (
              <span className="genoma-mosaic-cell__status" aria-label={locked ? "Confirmado" : "Propuesto"}>
                {locked ? "✓" : proposed ? "○" : ""}
              </span>
            ) : null}
          </div>
        ) : null}
        {ghost ? (
          <span className="genoma-mosaic-cell__ghost" aria-hidden>
            {ghost}
          </span>
        ) : null}
        <div className="genoma-mosaic-cell__content">{children}</div>
      </GenomaMosaicCellProvider>
    </section>
  );
}
