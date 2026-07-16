"use client";

import React, { useEffect, useMemo } from "react";
import { X } from "lucide-react";
import type { BrandKitDocument, SlotId } from "@/lib/brandkit/brand-kit-types";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import { boardChapterLabel } from "./brand-kit-board-chapters";
import { useBrandKitMosaicBoard } from "./brand-kit-mosaic-context";
import { buildFallbackSlotDetailPayload } from "./brand-kit-slot-detail-payload";

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("button, a, input, textarea, select, label, [role='button'], .brandKit-cell-context-menu"));
}

export function useBrandKitEditCellProps(slotId?: SlotId) {
  const board = useBrandKitMosaicBoard();
  const isEdit = board?.studioMode === "edit";

  return {
    onClick: (event: React.MouseEvent<HTMLElement>) => {
      if (!isEdit || !slotId || isInteractiveTarget(event.target)) return;
      board.selectSlot(slotId);
    },
    editSelectable: Boolean(isEdit && slotId),
  };
}

export function BrandKitReaderOverlay({ doc }: { doc: BrandKitDocument }) {
  const board = useBrandKitMosaicBoard();
  const open = Boolean(board?.readerOpen && board.readerSlotId);
  const slotId = board?.readerSlotId;

  const payload = useMemo(() => {
    if (!open || !slotId || slotId === "applications") return null;
    const registered = board?.getSlotDetail(slotId as SlotId);
    const fallback = buildFallbackSlotDetailPayload(doc, slotId as SlotId);
    const base = registered ?? fallback;
    if (!base) return null;
    return {
      ...base,
      statusLabel: undefined,
      sourceLabel: undefined,
      footer: undefined,
    };
  }, [board, doc, open, slotId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") board?.closeReader();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [board, open]);

  if (!board || !open || !slotId || slotId === "applications" || !payload) return null;

  const chapter = boardChapterLabel(slotId as SlotId) ?? payload.blockLabel;

  return (
    <div className="brandKit-reader-overlay is-open" role="presentation">
      <button
        type="button"
        className="brandKit-reader-overlay__backdrop"
        aria-label={brandKitLocaleEs.readerClose}
        onClick={() => board.closeReader()}
      />
      <article
        className="brandKit-reader-overlay__panel"
        role="dialog"
        aria-modal="true"
        aria-label={chapter}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="brandKit-reader-overlay__head">
          <div>
            <p className="brandKit-reader-overlay__chapter">{chapter}</p>
            {payload.brandName ? <h2 className="brandKit-reader-overlay__title">{payload.brandName}</h2> : null}
          </div>
          <button
            type="button"
            className="brandKit-reader-overlay__close"
            aria-label={brandKitLocaleEs.readerClose}
            onClick={() => board.closeReader()}
          >
            <X size={18} strokeWidth={1.75} aria-hidden />
          </button>
        </header>
        <div className="brandKit-reader-overlay__body">
          {payload.summary ? <div className="brandKit-reader-overlay__summary">{payload.summary}</div> : null}
          {payload.tabs.map((tab) => (
            <section key={tab.id} className="brandKit-reader-overlay__section">
              <h3 className="brandKit-reader-overlay__section-title">{tab.label}</h3>
              <div className="brandKit-reader-overlay__section-body">{tab.content}</div>
            </section>
          ))}
        </div>
      </article>
    </div>
  );
}

export function useBrandKitReaderCellProps(slotId?: SlotId) {
  const board = useBrandKitMosaicBoard();
  const isPresentation = board?.studioMode === "presentation";

  return {
    onClick: (event: React.MouseEvent<HTMLElement>) => {
      if (!isPresentation || !slotId || isInteractiveTarget(event.target)) return;
      board.openReader(slotId);
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
      if (!isPresentation || !slotId) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        board.openReader(slotId);
      }
    },
    readerOpen: Boolean(isPresentation && board?.readerOpen && board.readerSlotId === slotId),
    presentationReadable: Boolean(isPresentation && slotId),
  };
}
