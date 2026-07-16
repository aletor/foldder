"use client";

import React, { useEffect } from "react";
import { BookOpen, X } from "lucide-react";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import { boardChapterLabel, boardChapterNumber } from "./brand-kit-board-chapters";
import { useBrandKitMosaicBoard } from "./brand-kit-mosaic-context";
import { BrandKitInspectorPanelBody } from "./BrandKitDetailPanel";
import { inspectorSubtitleForSlot } from "@/lib/brandkit/studio/brand-kit-inspector";
import { BrandKitCellContextMenu } from "./BrandKitCellContextMenu";

export function BrandKitInspectorPanel() {
  const board = useBrandKitMosaicBoard();
  const open = board?.detailOpen ?? false;
  const payload = board?.detailContent;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") board?.closeInspector();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [board, open]);

  if (!board || board.studioMode !== "edit") return null;
  if (!open || !payload) return null;

  const chapterTitle =
    payload.slotId && boardChapterLabel(payload.slotId)
      ? boardChapterLabel(payload.slotId)
      : payload.blockLabel;
  const chapterNum = payload.slotId ? boardChapterNumber(payload.slotId) : payload.slotNumber;
  const slot = payload.slotId && board.doc ? board.doc.slots[payload.slotId] : undefined;
  const subtitle = inspectorSubtitleForSlot(slot) ?? payload.statusLabel;

  return (
    <div
      className="brandKit-studio-inspector-modal is-open"
      role="presentation"
      data-foldder-brandkit-inspector
    >
      <button
        type="button"
        className="brandKit-studio-inspector-modal__backdrop"
        aria-label="Cerrar estudio"
        onClick={() => board.closeInspector()}
      />
      <aside
        className="brandKit-studio-inspector brandKit-studio-inspector--modal"
        role="dialog"
        aria-modal="true"
        aria-label={chapterTitle ?? brandKitLocaleEs.editInStudio}
        data-foldder-studio-panel
        data-foldder-studio-flush
        data-foldder-brandkit-inspector-panel
      >
        <header className="brandKit-studio-inspector__head">
          <div className="brandKit-studio-inspector__head-icon" aria-hidden>
            <BookOpen size={16} strokeWidth={1.75} />
          </div>
          <div className="brandKit-studio-inspector__head-main">
            <p className="brandKit-studio-inspector__eyebrow">
              {chapterNum ? `${chapterNum} · Estudio` : "Estudio"}
            </p>
            <p className="brandKit-studio-inspector__chapter">{chapterTitle}</p>
          </div>
          {subtitle ? (
            <div className="brandKit-studio-inspector__meta-cell">
              <span className="brandKit-studio-inspector__meta">{subtitle}</span>
            </div>
          ) : null}
          <div className="brandKit-studio-inspector__head-actions">
            <BrandKitCellContextMenu
              items={[
                {
                  id: "evidence",
                  label: brandKitLocaleEs.atelierEvidenceTab,
                  onClick: () => board.setInspectorTab("evidence"),
                },
                {
                  id: "history",
                  label: brandKitLocaleEs.atelierHistoryTab,
                  onClick: () => board.setInspectorTab("history"),
                },
              ]}
              ariaLabel={brandKitLocaleEs.cellMenuMore}
            />
            <button
              type="button"
              className="brandKit-studio-inspector__close"
              aria-label={brandKitLocaleEs.readerClose}
              onClick={() => board.closeInspector()}
            >
              <X size={16} strokeWidth={1.75} aria-hidden />
            </button>
          </div>
        </header>
        <div className="brandKit-studio-inspector__body">
          <BrandKitInspectorPanelBody payload={payload} />
        </div>
      </aside>
    </div>
  );
}
