"use client";

import React from "react";
import { INDESIGN_PAGE_FORMATS, type IndesignPageFormatId } from "../indesign/page-formats";

export type DesignerFormatModalState =
  | null
  | { kind: "add" }
  | { kind: "resize"; pageIndex: number };

type Props = {
  formatModal: DesignerFormatModalState;
  pendingFormat: IndesignPageFormatId;
  onPendingFormatChange: (id: IndesignPageFormatId) => void;
  onDismiss: () => void;
  onConfirmAdd: () => void;
  onConfirmResize: () => void;
};

export function DesignerFormatModal({
  formatModal,
  pendingFormat,
  onPendingFormatChange,
  onDismiss,
  onConfirmAdd,
  onConfirmResize,
}: Props) {
  if (!formatModal) return null;

  return (
    <div
      className="fixed inset-0 z-[10060] flex items-center justify-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      data-foldder-studio-flush=""
    >
      <div className="w-full max-w-sm border border-white/10 bg-[#0b0f14]">
        <div className="border-b border-white/10 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-[0.1em] text-white">
            {formatModal.kind === "add" ? "Nueva página" : "Tamaño del pliego"}
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            {formatModal.kind === "add"
              ? "Elige el preset del pliego que se añadirá al final."
              : "Aplica un preset de tamaño a esta página (se sustituyen ancho y alto personalizados)."}
          </p>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-3">
          <div className="space-y-1">
            {INDESIGN_PAGE_FORMATS.map((f) => (
              <label
                key={f.id}
                className={`flex cursor-pointer items-center gap-3 border px-3 py-2 text-xs transition ${
                  pendingFormat === f.id
                    ? "border-[#534AB7] bg-[#534AB7]/15 text-zinc-100"
                    : "border-white/[0.08] bg-black/20 text-zinc-400 hover:border-white/15"
                }`}
              >
                <input
                  type="radio"
                  name="fmt"
                  className="accent-[#534AB7]"
                  checked={pendingFormat === f.id}
                  onChange={() => onPendingFormatChange(f.id)}
                />
                <span>
                  {f.label}{" "}
                  <span className="text-zinc-600">
                    ({f.width}×{f.height})
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="flex items-stretch divide-x divide-white/10 border-t border-white/10">
          <button
            type="button"
            className="flex-1 bg-white/[0.04] px-3 py-2 text-[11px] font-black uppercase tracking-[0.1em] text-white/45 transition hover:bg-white/[0.08] hover:text-white"
            onClick={onDismiss}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="flex-1 bg-[#534AB7] px-3 py-2 text-[11px] font-black uppercase tracking-[0.1em] text-white transition hover:bg-[#6357c9]"
            onClick={formatModal.kind === "add" ? onConfirmAdd : onConfirmResize}
          >
            {formatModal.kind === "add" ? "Añadir" : "Aplicar"}
          </button>
        </div>
      </div>
    </div>
  );
}
