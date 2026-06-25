"use client";

import React, { useMemo, useRef } from "react";
import type { FieldDef } from "@/app/spaces/dataset/dataset-types";
import { insertTokenAtSelection } from "./populate-tokens";
import {
  datasetFieldTypesForInputKind,
  type PopulateBindings,
  type PopulateInputBinding,
} from "./populate-types";

const REF_SLOTS = [
  { id: "image", label: "Ref 1 (Fondo)" },
  { id: "image2", label: "Ref 2" },
  { id: "image3", label: "Ref 3" },
  { id: "image4", label: "Ref 4" },
] as const;

export interface PopulateTemplatePanelProps {
  promptText: string;
  bindings: PopulateBindings;
  schema: FieldDef[];
  listId: string | null;
  onChangePrompt: (next: string) => void;
  onChangeBinding: (inputId: string, binding: PopulateInputBinding) => void;
}

/**
 * Panel que aparece en Image Creation cuando está conectado a Populate.
 * Permite: escribir el prompt plantilla con tokens {campo} (inserción asistida)
 * y elegir por cada referencia entre "imagen fija" o "columna del Dataset".
 */
export function PopulateTemplatePanel({
  promptText,
  bindings,
  schema,
  listId,
  onChangePrompt,
  onChangeBinding,
}: PopulateTemplatePanelProps) {
  const textRef = useRef<HTMLTextAreaElement>(null);

  const textColumns = useMemo(() => {
    const allowed = datasetFieldTypesForInputKind("text");
    return schema.filter((f) => allowed.includes(f.type));
  }, [schema]);

  const imageColumns = useMemo(() => {
    const allowed = datasetFieldTypesForInputKind("image");
    return schema.filter((f) => allowed.includes(f.type));
  }, [schema]);

  const insertField = (fieldKey: string) => {
    if (!fieldKey) return;
    const el = textRef.current;
    const start = el?.selectionStart ?? promptText.length;
    const end = el?.selectionEnd ?? promptText.length;
    const { text, caret } = insertTokenAtSelection(promptText, start, end, fieldKey);
    onChangePrompt(text);
    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        el.setSelectionRange(caret, caret);
      }
    });
  };

  const setRefSource = (inputId: string, value: string) => {
    if (value === "__fixed__") {
      onChangeBinding(inputId, { inputId, source: "fixed" });
      return;
    }
    const field = imageColumns.find((f) => f.id === value);
    if (!field) return;
    onChangeBinding(inputId, {
      inputId,
      source: "column",
      listId: listId ?? undefined,
      fieldId: field.id,
      fieldKey: field.key,
    });
  };

  return (
    <div
      className="nodrag nopan flex flex-col gap-2 border-b border-cyan-500/30 bg-cyan-50/70 px-2 py-2 text-[11px] text-slate-700"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wide text-cyan-700">
          Plantilla Populate
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[10px] font-semibold text-slate-500">Prompt</span>
          <select
            className="nodrag rounded border border-slate-300 bg-white px-1 py-0.5 text-[10px]"
            value=""
            onChange={(e) => {
              insertField(e.target.value);
              e.target.value = "";
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title="Insertar campo del Dataset"
          >
            <option value="">Insertar campo ▾</option>
            {textColumns.map((f) => (
              <option key={f.id} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <textarea
          ref={textRef}
          className="nodrag min-h-[52px] w-full resize-y rounded border border-slate-300 bg-white px-1.5 py-1 text-[11px]"
          placeholder="Texto fijo + {campo} del Dataset…"
          value={promptText}
          onChange={(e) => onChangePrompt(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
        />
      </div>

      <div className="flex flex-col gap-1">
        {REF_SLOTS.map((slot) => {
          const binding = bindings[slot.id];
          const current = binding?.source === "column" ? binding.fieldId ?? "__fixed__" : "__fixed__";
          return (
            <label key={slot.id} className="flex items-center gap-1.5">
              <span className="w-20 shrink-0 text-[10px] text-slate-500">{slot.label}</span>
              <select
                className="nodrag w-full rounded border border-slate-300 bg-white px-1 py-0.5 text-[10px]"
                value={current}
                onChange={(e) => setRefSource(slot.id, e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <option value="__fixed__">Imagen fija</option>
                {imageColumns.map((f) => (
                  <option key={f.id} value={f.id}>
                    Columna: {f.label}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
    </div>
  );
}
