"use client";

import React from "react";
import { X } from "lucide-react";
import { useBrandKitMosaicBoard } from "./brand-kit-mosaic-context";
import { BrandKitDetailPanelBody } from "./BrandKitDetailPanel";

export function BrandKitMosaicDetailSheet() {
  const board = useBrandKitMosaicBoard();
  const open = board?.detailOpen ?? false;
  const payload = board?.detailContent;

  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") board?.closeDetailSheet();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [board, open]);

  if (!board || !payload || board.studioMode !== "edit") return null;

  const ariaLabel = payload.slotNumber
    ? `${payload.slotNumber} — ${payload.blockLabel}`
    : payload.blockLabel;

  return (
    <div className={`brandKit-mosaic-detail-sheet${open ? " is-open" : ""}`} aria-hidden={!open}>
      <button
        type="button"
        className="brandKit-mosaic-detail-sheet__backdrop"
        aria-label="Cerrar detalle"
        onClick={() => board.closeDetailSheet()}
      />
      <aside className="brandKit-mosaic-detail-sheet__panel" role="dialog" aria-modal="true" aria-label={ariaLabel}>
        <header className="brandKit-mosaic-detail-sheet__head">
          <div className="brandKit-mosaic-detail-sheet__head-main">
            <p className="brandKit-mosaic-detail-sheet__eyebrow">{payload.blockLabel}</p>
            {payload.brandName ? (
              <h2 className="brandKit-mosaic-detail-sheet__title">{payload.brandName}</h2>
            ) : null}
          </div>
          <button
            type="button"
            className="brandKit-mosaic-detail-sheet__close"
            aria-label="Cerrar"
            onClick={() => board.closeDetailSheet()}
          >
            <X size={18} strokeWidth={1.75} aria-hidden />
          </button>
        </header>
        <div className="brandKit-mosaic-detail-sheet__body">
          <BrandKitDetailPanelBody payload={payload} />
        </div>
      </aside>
    </div>
  );
}
