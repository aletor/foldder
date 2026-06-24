"use client";

import React from "react";
import { FileUp, Globe, Plus } from "lucide-react";
import {
  DATASET_MODAL_BTN_GHOST,
  datasetModalHeaderClass,
  datasetModalOverlayClass,
  datasetModalPanelProps,
} from "./dataset-modal-chrome";

type DatasetAddChooserProps = {
  onCreateLocal: () => void;
  onConnectGlobal: () => void;
  onClose: () => void;
};

/** Chooser al añadir un nodo Dataset desde el sidebar. */
export function DatasetAddChooser({ onCreateLocal, onConnectGlobal, onClose }: DatasetAddChooserProps) {
  return (
    <div className={datasetModalOverlayClass} onClick={onClose}>
      <div {...datasetModalPanelProps()} onClick={(e) => e.stopPropagation()}>
        <div className={datasetModalHeaderClass}>
          <h3 className="text-[11px] font-black uppercase tracking-[0.08em] text-white/85">Añadir Dataset</h3>
          <p className="mt-1 text-[11px] text-white/45">¿Qué quieres hacer?</p>
        </div>

        <div className="grid gap-px border-b border-white/10 bg-white/10 sm:grid-cols-2">
          <button
            type="button"
            onClick={onCreateLocal}
            className="flex flex-col items-start gap-2 bg-[#0b0f14] p-4 text-left transition hover:bg-white/[0.04]"
          >
            <span className="flex h-9 w-9 items-center justify-center bg-[var(--foldder-studio-accent,#14b8a6)]/15 text-[var(--foldder-studio-accent,#14b8a6)]">
              <Plus size={18} strokeWidth={2.5} />
            </span>
            <span className="text-[11px] font-black uppercase tracking-[0.06em] text-white/85">Empezar vacío</span>
            <span className="text-[10px] leading-relaxed text-white/40">Tabla nueva en este proyecto</span>
          </button>

          <button
            type="button"
            onClick={onConnectGlobal}
            className="flex flex-col items-start gap-2 border-l border-white/10 bg-[#0b0f14] p-4 text-left transition hover:bg-white/[0.04] sm:border-l-0 sm:border-t-0"
          >
            <span className="flex h-9 w-9 items-center justify-center bg-[var(--foldder-studio-accent,#14b8a6)]/15 text-[var(--foldder-studio-accent,#14b8a6)]">
              <Globe size={18} strokeWidth={2.5} />
            </span>
            <span className="text-[11px] font-black uppercase tracking-[0.06em] text-white/85">Usar uno guardado</span>
            <span className="text-[10px] leading-relaxed text-white/40">De tu cuenta, referencia viva</span>
          </button>

          <button
            type="button"
            disabled
            title="Próximamente"
            className="flex flex-col items-start gap-2 border-t border-white/10 bg-[#0b0f14] p-4 text-left opacity-40 sm:col-span-2"
          >
            <span className="flex h-9 w-9 items-center justify-center bg-white/[0.04] text-white/35">
              <FileUp size={18} strokeWidth={2.5} />
            </span>
            <span className="text-[11px] font-black uppercase tracking-[0.06em] text-white/55">Importar archivo</span>
            <span className="text-[10px] text-white/30">.folddata — próximamente</span>
          </button>
        </div>

        <button type="button" onClick={onClose} className={DATASET_MODAL_BTN_GHOST}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
