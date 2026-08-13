"use client";

import React from "react";
import { createPortal } from "react-dom";
import type { SiteCreatorSelectionIndex, SiteCreatorSelectionIndexEntry } from "./site-creator-selection-types";

export interface SiteCreatorLayerPickerProps {
  open: boolean;
  x: number;
  y: number;
  entries: SiteCreatorSelectionIndexEntry[];
  index: SiteCreatorSelectionIndex;
  onPick: (layerId: string) => void;
  onClose: () => void;
}

export function SiteCreatorLayerPicker({
  open,
  x,
  y,
  entries,
  index,
  onPick,
  onClose,
}: SiteCreatorLayerPickerProps) {
  if (!open || entries.length === 0 || typeof document === "undefined") return null;

  const left = Math.max(8, Math.min(x, window.innerWidth - 288));
  const top = Math.max(8, Math.min(y, window.innerHeight - 260));

  return createPortal(
    <div
      className="site-creator-layer-picker fixed z-[100050] min-w-[200px] max-w-[280px] overflow-hidden rounded-md border border-white/10 bg-[#101820] py-1 shadow-2xl"
      style={{ left, top }}
      role="menu"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <p className="px-3 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-white/40">Elegir capa</p>
      <ul className="max-h-56 overflow-auto">
        {entries.map((entry) => {
          const parentName = entry.parentLayerId ? index.byId[entry.parentLayerId]?.name : null;
          const ancestorHint = entry.containerKind && entry.depth > 0;
          return (
            <li key={entry.layerId}>
              <button
                type="button"
                className="flex w-full flex-col items-start px-3 py-1.5 text-left hover:bg-white/10"
                onClick={() => {
                  onPick(entry.layerId);
                  onClose();
                }}
              >
                <span className="text-[11px] font-semibold text-white">
                  {entry.name}
                  {entry.containerKind ? " · grupo" : ""}
                  {ancestorHint ? " · contenedor" : ""}
                </span>
                <span className="text-[10px] text-white/45">
                  {entry.type}
                  {parentName ? ` · en ${parentName}` : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>,
    document.body,
  );
}
