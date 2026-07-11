"use client";

import React, { useEffect } from "react";
import { X } from "lucide-react";
import { useBrandKitMosaicBoard } from "./brand-kit-mosaic-context";

export function BrandKitMosaicDetailSheet() {
  const board = useBrandKitMosaicBoard();
  const open = board?.detailOpen ?? false;
  const content = board?.detailContent;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") board?.closeDetailSheet();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [board, open]);

  if (!board || !content) return null;

  return (
    <div className={`brandKit-mosaic-detail-sheet${open ? " is-open" : ""}`} aria-hidden={!open}>
      <button
        type="button"
        className="brandKit-mosaic-detail-sheet__backdrop"
        aria-label="Cerrar detalle"
        onClick={() => board.closeDetailSheet()}
      />
      <aside className="brandKit-mosaic-detail-sheet__panel" role="dialog" aria-modal="true" aria-label={content.title}>
        <header className="brandKit-mosaic-detail-sheet__head">
          <h2 className="brandKit-mosaic-detail-sheet__title">{content.title}</h2>
          <button
            type="button"
            className="brandKit-mosaic-detail-sheet__close"
            aria-label="Cerrar"
            onClick={() => board.closeDetailSheet()}
          >
            <X size={18} strokeWidth={1.75} aria-hidden />
          </button>
        </header>
        <div className="brandKit-mosaic-detail-sheet__body">{content.content}</div>
      </aside>
    </div>
  );
}
