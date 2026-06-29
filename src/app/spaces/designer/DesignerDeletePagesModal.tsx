"use client";

import React from "react";
import { createPortal } from "react-dom";
import { Trash2, X } from "lucide-react";
import { STUDIO_BODY_PORTAL_Z, studioOverlayPointerGuards } from "../freehand/studio-modal-shell";

type Props = {
  pageNumbers: number[];
  totalPages: number;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DesignerDeletePagesModal({ pageNumbers, totalPages, onCancel, onConfirm }: Props) {
  const count = pageNumbers.length;
  const canDelete = count > 0 && count < totalPages;
  const sorted = [...pageNumbers].sort((a, b) => a - b);
  const label =
    count === 1
      ? `la página ${sorted[0]}`
      : count <= 4
        ? `las páginas ${sorted.join(", ")}`
        : `${count} páginas (${sorted.slice(0, 3).join(", ")}…)`;

  const dialog = (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/55 p-4"
      style={{ zIndex: STUDIO_BODY_PORTAL_Z }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="designer-delete-pages-title"
      data-foldder-studio-flush=""
      data-foldder-studio-panel
      {...studioOverlayPointerGuards}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm border border-white/10 bg-[#0b0f14] shadow-[0_24px_70px_rgba(0,0,0,0.55)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-stretch border-b border-rose-500/25 bg-rose-500/15">
          <div className="flex min-w-0 flex-1 items-center gap-2 px-4 py-3">
            <Trash2 className="h-3.5 w-3.5 shrink-0 text-rose-200" strokeWidth={2} />
            <h2 id="designer-delete-pages-title" className="text-[10px] font-black uppercase tracking-[0.1em] text-rose-50">
              ¿Eliminar {count === 1 ? "página" : "páginas"}?
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="flex w-10 shrink-0 items-center justify-center border-l border-white/10 text-white/50 transition hover:bg-white/[0.08] hover:text-white"
            aria-label="Cerrar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="border-b border-white/10 px-4 py-3 text-[11px] leading-relaxed text-zinc-400">
          {canDelete ? (
            <>
              Se eliminará permanentemente <span className="font-semibold text-white">{label}</span>. No se puede deshacer.
            </>
          ) : (
            <>Debe permanecer al menos una página en el documento. Deselecciona alguna página antes de continuar.</>
          )}
        </p>
        <div className="grid grid-cols-2 divide-x divide-white/10">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.1em] text-zinc-400 transition hover:bg-white/[0.04] hover:text-zinc-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!canDelete}
            onClick={onConfirm}
            className="px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.1em] text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(dialog, document.body);
}
