"use client";

import React, { useEffect, useRef, useState } from "react";
import { listGlobalDatasets, type DatasetListItem } from "./dataset-api";

type DatasetGlobalPickerProps = {
  currentDatasetId: string;
  currentName: string;
  disabled?: boolean;
  onSelect: (item: DatasetListItem) => void;
  onCreateNew?: () => void;
};

export function DatasetGlobalPicker({
  currentDatasetId,
  currentName,
  disabled,
  onSelect,
  onCreateNew,
}: DatasetGlobalPickerProps) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<DatasetListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void listGlobalDatasets()
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="relative ml-auto">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-[220px] items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-zinc-200 hover:bg-white/10 disabled:opacity-50"
        title="Cambiar Dataset global"
      >
        <span className="truncate font-semibold">{currentName || "Dataset"}</span>
        <span className="text-zinc-500">▾</span>
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-20 mt-1 w-[min(320px,calc(100vw-2rem))] rounded-lg border border-white/15 bg-[#15191e] py-1 shadow-2xl">
          <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Datasets globales
          </p>
          {loading ? <p className="px-3 py-2 text-[12px] text-zinc-500">Cargando…</p> : null}
          {!loading && rows.length === 0 ? (
            <p className="px-3 py-2 text-[12px] text-zinc-500">No hay Datasets globales.</p>
          ) : null}
          <ul className="max-h-[280px] overflow-auto">
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(row);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-[12px] hover:bg-white/5 ${
                    row.id === currentDatasetId ? "bg-cyan-400/10 text-cyan-200" : "text-zinc-200"
                  }`}
                >
                  <span>
                    <span className="block font-semibold">{row.name}</span>
                    <span className="text-[10px] text-zinc-500">
                      {row.cardCount} cards · v{row.version}
                    </span>
                  </span>
                  {row.id === currentDatasetId ? <span className="text-[10px]">✓</span> : null}
                </button>
              </li>
            ))}
          </ul>
          {onCreateNew ? (
            <button
              type="button"
              onClick={() => {
                onCreateNew();
                setOpen(false);
              }}
              className="w-full border-t border-white/10 px-3 py-2 text-left text-[12px] text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
            >
              + Nuevo Dataset local
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
