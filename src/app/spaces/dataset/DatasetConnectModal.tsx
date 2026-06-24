"use client";

import React, { useEffect, useState } from "react";
import { Globe } from "lucide-react";
import { listGlobalDatasets, type DatasetListItem } from "./dataset-api";
import {
  DATASET_MODAL_BTN_SECONDARY,
  datasetModalFooterClass,
  datasetModalHeaderClass,
  datasetModalOverlayClass,
  datasetModalPanelProps,
} from "./dataset-modal-chrome";

type DatasetConnectModalProps = {
  onSelect: (item: DatasetListItem) => void;
  onCreateNew: () => void;
  onClose: () => void;
};

export function DatasetConnectModal({ onSelect, onCreateNew, onClose }: DatasetConnectModalProps) {
  const [rows, setRows] = useState<DatasetListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listGlobalDatasets()
      .then((datasets) => {
        if (!cancelled) setRows(datasets);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "No se pudo cargar la lista");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={datasetModalOverlayClass} onClick={onClose}>
      <div {...datasetModalPanelProps("max-w-md")} onClick={(e) => e.stopPropagation()}>
        <header className={datasetModalHeaderClass}>
          <div className="flex items-center gap-2">
            <Globe size={14} className="text-[var(--foldder-studio-accent,#14b8a6)]" strokeWidth={2.25} />
            <h3 className="text-[11px] font-black uppercase tracking-[0.08em] text-white/85">Usar uno guardado</h3>
          </div>
          <p className="mt-1 text-[11px] text-white/45">
            Referencia viva — los cambios se propagan a todos los proyectos.
          </p>
        </header>

        <div className="custom-scrollbar min-h-0 max-h-[50vh] flex-1 overflow-auto">
          {loading ? <p className="px-4 py-3 text-[11px] text-white/45">Cargando…</p> : null}
          {error ? <p className="px-4 py-3 text-[11px] text-rose-300">{error}</p> : null}
          {!loading && !error && rows.length === 0 ? (
            <p className="px-4 py-6 text-center text-[11px] text-white/45">
              Aún no tienes Datasets guardados en tu cuenta.
            </p>
          ) : null}
          <ul className="divide-y divide-white/[0.06]">
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => onSelect(row)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-white/[0.04]"
                >
                  <span>
                    <span className="block text-[12px] font-medium text-white/85">{row.name}</span>
                    <span className="text-[10px] text-white/40">
                      {row.listCount ?? 1} pestañas · {row.cardCount} filas
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <footer className={`${datasetModalFooterClass} divide-x divide-white/10`}>
          <button type="button" onClick={onCreateNew} className={`${DATASET_MODAL_BTN_SECONDARY} flex-1 border-0`}>
            Empezar vacío
          </button>
          <button type="button" onClick={onClose} className={`${DATASET_MODAL_BTN_SECONDARY} flex-1 border-0`}>
            Cancelar
          </button>
        </footer>
      </div>
    </div>
  );
}
