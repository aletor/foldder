"use client";

import React, { useState } from "react";
import type { FieldDef, FieldType } from "./dataset-types";
import {
  DATASET_MODAL_BTN_PRIMARY,
  DATASET_MODAL_BTN_SECONDARY,
  datasetModalOverlayClass,
  datasetModalPanelProps,
} from "./dataset-modal-chrome";

export const FIELD_TYPE_OPTIONS: Array<{ type: FieldType; label: string; icon: string }> = [
  { type: "text", label: "Texto", icon: "Aa" },
  { type: "number", label: "Número", icon: "#" },
  { type: "image", label: "Imagen", icon: "🖼" },
  { type: "video", label: "Vídeo", icon: "▶" },
  { type: "color", label: "Color", icon: "◼" },
  { type: "boolean", label: "Sí/No", icon: "✓" },
  { type: "select", label: "Opciones", icon: "▾" },
  { type: "url", label: "Enlace", icon: "🔗" },
];

export function FieldEditor({
  field,
  onSave,
  onCancel,
  onDelete,
  title,
}: {
  field?: FieldDef;
  onSave: (partial: Pick<FieldDef, "label" | "type"> & Partial<FieldDef>) => void;
  onCancel: () => void;
  onDelete?: () => void;
  title?: string;
}) {
  const [label, setLabel] = useState(field?.label ?? "");
  const [type, setType] = useState<FieldType>(field?.type ?? "text");
  const [required, setRequired] = useState(field?.required ?? false);
  const [optionsText, setOptionsText] = useState((field?.options ?? []).join(", "));

  const save = () => {
    if (!label.trim()) return;
    onSave({
      label: label.trim(),
      type,
      required,
      key: field?.key,
      options:
        type === "select"
          ? optionsText.split(",").map((s) => s.trim()).filter(Boolean)
          : undefined,
    });
  };

  return (
    <div className={datasetModalOverlayClass} onClick={onCancel}>
      <div {...datasetModalPanelProps("max-w-sm")} onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-white/10 px-4 py-3">
          <h3 className="text-[11px] font-black uppercase tracking-[0.08em] text-white/85">
            {title ?? (field ? "Editar columna" : "Nueva columna")}
          </h3>
        </div>

        <div className="px-4 py-4">
          <label className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.08em] text-white/45">Nombre</label>
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            className="mb-4 w-full border border-white/10 bg-black/30 px-3 py-2 text-[12px] text-white outline-none focus:border-[var(--foldder-studio-accent,#14b8a6)]/50"
            placeholder="p.ej. Nombre, Foto, Equipo…"
          />

          <label className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.08em] text-white/45">Tipo</label>
          <div className="mb-4 grid grid-cols-4 gap-px border border-white/10 bg-white/10">
            {FIELD_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.type}
                type="button"
                onClick={() => setType(opt.type)}
                className={`flex flex-col items-center gap-0.5 bg-[#0b0f14] px-1 py-2 text-[9px] font-black uppercase tracking-[0.06em] transition ${
                  type === opt.type
                    ? "bg-[var(--foldder-studio-accent,#14b8a6)]/15 text-[var(--foldder-studio-accent,#14b8a6)]"
                    : "text-white/45 hover:bg-white/[0.04] hover:text-white/75"
                }`}
              >
                <span className="text-[12px]">{opt.icon}</span>
                {opt.label}
              </button>
            ))}
          </div>

          {type === "select" ? (
            <>
              <label className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.08em] text-white/45">
                Opciones (separadas por coma)
              </label>
              <input
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                className="mb-4 w-full border border-white/10 bg-black/30 px-3 py-2 text-[12px] text-white outline-none focus:border-[var(--foldder-studio-accent,#14b8a6)]/50"
                placeholder="Opción A, Opción B…"
              />
            </>
          ) : null}

          <label className="mb-4 flex items-center gap-2 text-[11px] text-white/65">
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              className="accent-[var(--foldder-studio-accent,#14b8a6)]"
            />
            Obligatorio
          </label>
        </div>

        <div className="flex items-stretch border-t border-white/10">
          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="flex h-10 shrink-0 items-center justify-center border-r border-white/10 px-4 text-[10px] font-black uppercase tracking-[0.08em] text-rose-300 hover:bg-rose-500/10"
            >
              Eliminar
            </button>
          ) : null}
          <button type="button" onClick={onCancel} className={`${DATASET_MODAL_BTN_SECONDARY} flex-1 border-0 border-r border-white/10`}>
            Cancelar
          </button>
          <button type="button" onClick={save} disabled={!label.trim()} className={`${DATASET_MODAL_BTN_PRIMARY} flex-1`}>
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
