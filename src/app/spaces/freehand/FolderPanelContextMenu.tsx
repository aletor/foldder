"use client";

import React, { useEffect } from "react";
import { Ban, Check } from "lucide-react";
import { useClampedFixedPosition } from "@/lib/use-clamped-fixed-position";
import {
  FOLDER_PANEL_COLOR_OPTIONS,
  type FolderPanelColorId,
} from "./folder-panel-colors";

export function FolderPanelContextMenu({
  x,
  y,
  folderName,
  currentColorId,
  onDeleteWithContent,
  onUngroup,
  onPickColor,
  onClose,
}: {
  x: number;
  y: number;
  folderName: string;
  currentColorId: FolderPanelColorId | null | undefined;
  onDeleteWithContent: () => boolean;
  onUngroup: () => void;
  onPickColor: (colorId: FolderPanelColorId | null) => void;
  onClose: () => void;
}) {
  const remeasureKey = `${folderName}\0${currentColorId ?? "none"}`;
  const { ref, style } = useClampedFixedPosition(x, y, true, remeasureKey);

  useEffect(() => {
    const h = () => onClose();
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="context-menu !z-[100001] min-w-[240px] max-h-[min(70vh,calc(100vh-24px))] overflow-y-auto overflow-x-hidden"
      style={{ ...style, position: "fixed", zIndex: 100001 }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="mb-0.5 shrink-0 border-b border-white/5 px-2.5 py-1 text-[8px] font-black uppercase tracking-widest text-white/30">
        Carpeta · {folderName || "Sin nombre"}
      </div>

      <button
        type="button"
        className="context-menu-item danger w-full justify-start border-0 bg-transparent font-[inherit]"
        onClick={() => {
          if (onDeleteWithContent()) onClose();
        }}
      >
        Eliminar carpeta y contenido
      </button>
      <button
        type="button"
        className="context-menu-item w-full justify-start border-0 bg-transparent font-[inherit]"
        onClick={() => {
          onUngroup();
          onClose();
        }}
      >
        Eliminar carpeta y desvincular
      </button>

      <div className="context-menu-separator" />

      <div className="px-2.5 py-1.5">
        <p className="mb-2 text-[8px] font-black uppercase tracking-widest text-white/35">Color de carpeta</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            title="Sin color"
            aria-label="Sin color"
            aria-pressed={!currentColorId}
            className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition ${
              !currentColorId
                ? "border-white/50 bg-white/[0.08] ring-1 ring-white/25"
                : "border-white/15 bg-white/[0.04] hover:border-white/30 hover:bg-white/[0.07]"
            }`}
            onClick={() => {
              onPickColor(null);
              onClose();
            }}
          >
            <Ban size={13} className="text-white/45" strokeWidth={2} />
            {!currentColorId ? (
              <Check size={10} className="absolute -bottom-0.5 -right-0.5 rounded-full bg-[#12151a] text-emerald-400" strokeWidth={3} />
            ) : null}
          </button>
          {FOLDER_PANEL_COLOR_OPTIONS.map((opt) => {
            const active = currentColorId === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                title={opt.label}
                aria-label={opt.label}
                aria-pressed={active}
                className={`relative h-7 w-7 shrink-0 rounded-full border transition hover:scale-105 ${
                  active ? "border-white/55 ring-1 ring-white/30" : "border-black/25 hover:border-white/35"
                }`}
                style={{ backgroundColor: opt.stripe }}
                onClick={() => {
                  onPickColor(opt.id);
                  onClose();
                }}
              >
                {active ? (
                  <Check size={10} className="absolute -bottom-0.5 -right-0.5 rounded-full bg-[#12151a] text-emerald-400" strokeWidth={3} />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
