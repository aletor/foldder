"use client";

import React from "react";
import type { DatasetScope } from "./dataset-types";
import {
  DATASET_MODAL_BTN_GHOST,
  datasetModalHeaderClass,
  datasetModalOverlayClass,
  datasetModalPanelProps,
} from "./dataset-modal-chrome";

type DatasetImportScopeModalProps = {
  filename: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (scope: DatasetScope) => void;
};

/** Tras elegir un .folddata, el usuario decide si importarlo local o como Dataset global persistente. */
export function DatasetImportScopeModal({
  filename,
  busy = false,
  onCancel,
  onConfirm,
}: DatasetImportScopeModalProps) {
  return (
    <div className={datasetModalOverlayClass} onClick={busy ? undefined : onCancel}>
      <div {...datasetModalPanelProps("max-w-md")} onClick={(e) => e.stopPropagation()}>
        <div className={datasetModalHeaderClass}>
          <h3 className="text-[11px] font-black uppercase tracking-[0.08em] text-white/85">
            Importar .folddata
          </h3>
          <p className="mt-1 truncate text-[11px] text-white/45" title={filename}>
            {filename}
          </p>
        </div>

        <p className="px-4 py-3 text-[12px] leading-relaxed text-white/55">
          El archivo es un <strong className="text-white/85">snapshot</strong> independiente. Se creará un Dataset
          nuevo con ids distintos.
        </p>

        <div className="grid gap-px border-y border-white/10 bg-white/10 sm:grid-cols-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm("local")}
            className="flex flex-col items-start gap-1.5 bg-[#0b0f14] p-4 text-left transition hover:bg-white/[0.04] disabled:opacity-45"
          >
            <span className="text-[11px] font-black uppercase tracking-[0.06em] text-white/85">Local</span>
            <span className="text-[10px] leading-relaxed text-white/40">Solo en este proyecto</span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm("global")}
            className="flex flex-col items-start gap-1.5 border-l border-white/10 bg-[#0b0f14] p-4 text-left transition hover:bg-white/[0.04] disabled:opacity-45 sm:border-l-0"
          >
            <span className="text-[11px] font-black uppercase tracking-[0.06em] text-white/85">Global</span>
            <span className="text-[10px] leading-relaxed text-white/40">Persistente en tu cuenta</span>
          </button>
        </div>

        <button type="button" disabled={busy} onClick={onCancel} className={DATASET_MODAL_BTN_GHOST}>
          {busy ? "Importando…" : "Cancelar"}
        </button>
      </div>
    </div>
  );
}
