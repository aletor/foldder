"use client";

import React, { useMemo } from "react";
import type { FieldDef } from "@/app/spaces/dataset/dataset-types";
import {
  datasetFieldTypesForInputKind,
  type CreativeInputDescriptor,
  type PopulateBindings,
  type PopulateInputBinding,
} from "./populate-types";
import { PopulatePromptEditor } from "./PopulatePromptEditor";
import type { ActiveImageRef } from "./populate-active-refs";

export interface PopulateTemplatePanelProps {
  /** Prompt plantilla (texto fijo + tokens {campo}); editado dentro de Populate. */
  promptText: string;
  bindings: PopulateBindings;
  /** Esquema del listado activo del Dataset (columnas disponibles). */
  schema: FieldDef[];
  /** Campos constantes del Dataset (para resolver/validar chips de constantes). */
  constantFields?: FieldDef[];
  listId: string | null;
  /**
   * Referencias de imagen conectadas al nodo creativo (solo cables activos).
   */
  imageSlots: ActiveImageRef[];
  /** Etiqueta del input de texto principal (del declaración; p. ej. "Prompt"). */
  promptLabel?: string;
  onChangePrompt: (next: string) => void;
  onChangeBinding: (inputId: string, binding: PopulateInputBinding) => void;
}

const FIXED_VALUE = "__fixed__";
const MANUAL_VALUE = "__manual__";

/**
 * Editor de plantilla que vive DENTRO de Populate. Muestra el prompt que se enviará
 * al nodo creativo y permite insertar campos del Dataset como tokens, y por cada
 * referencia de imagen elegir "imagen fija" o "columna del Dataset".
 *
 * Es agnóstico al tipo de nodo: recibe los slots por declaración. Hoy se usa con
 * Image Creation; un nodo con más slots de texto (Designer) extenderá esto con un
 * array de inputs de texto en lugar de un único prompt.
 */
export function PopulateTemplatePanel({
  promptText,
  bindings,
  schema,
  constantFields,
  listId,
  imageSlots,
  promptLabel = "Prompt",
  onChangePrompt,
  onChangeBinding,
}: PopulateTemplatePanelProps) {
  const insertableFields = useMemo(() => {
    const allowed = datasetFieldTypesForInputKind("text");
    const fromList = schema.filter((f) => allowed.includes(f.type));
    const fromConst = (constantFields ?? []).filter((f) => allowed.includes(f.type));
    return [...fromList, ...fromConst].map((f) => ({ key: f.key, label: f.label }));
  }, [schema, constantFields]);

  // Validez/etiqueta de chips: cualquier campo (listado + constantes) resuelve.
  const validityFields = useMemo(
    () =>
      [...schema, ...(constantFields ?? [])].map((f) => ({ key: f.key, label: f.label })),
    [schema, constantFields],
  );

  const imageColumns = useMemo(() => {
    const allowed = datasetFieldTypesForInputKind("image");
    return schema.filter((f) => allowed.includes(f.type));
  }, [schema]);

  const setRefSource = (inputId: string, value: string) => {
    if (value === FIXED_VALUE) {
      onChangeBinding(inputId, { inputId, source: "fixed" });
      return;
    }
    if (value === MANUAL_VALUE) {
      const prev = bindings[inputId];
      onChangeBinding(inputId, {
        inputId,
        source: "manual",
        manualValue: prev?.manualValue ?? "",
      });
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

  const setManualValue = (inputId: string, manualValue: string) => {
    onChangeBinding(inputId, { inputId, source: "manual", manualValue });
  };

  const manualSlots = imageSlots.filter((slot) => bindings[slot.inputId]?.source === "manual");

  return (
    <div
      className="populate-template-panel nodrag nopan"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="populate-template-panel__head">
        <span className="populate-template-panel__title">Plantilla</span>
        <span className="populate-template-panel__hint">se envía al nodo creativo</span>
      </div>

      <div className="populate-template-panel__field">
        <PopulatePromptEditor
          value={promptText}
          fields={validityFields}
          insertableFields={insertableFields}
          label={promptLabel}
          onChange={onChangePrompt}
        />
      </div>

      {imageSlots.length > 0 ? (
        <div className="populate-template-panel__refs">
          <span className="populate-template-panel__refs-head">
            Referencias conectadas ({imageSlots.length})
          </span>
          {imageSlots.map((slot) => {
            const binding = bindings[slot.inputId];
            const current =
              binding?.source === "manual"
                ? MANUAL_VALUE
                : binding?.source === "column"
                  ? binding.fieldId ?? FIXED_VALUE
                  : FIXED_VALUE;
            return (
              <label key={slot.inputId} className="populate-template-panel__ref">
                <span className="populate-template-panel__ref-label">{slot.label}</span>
                {slot.sourceLabel ? (
                  <span className="populate-template-panel__ref-connected" title="Cable activo en Image Creation">
                    Conectado: {slot.sourceLabel}
                  </span>
                ) : null}
                <select
                  className="populate-template-panel__select nodrag"
                  value={current}
                  onChange={(e) => setRefSource(slot.inputId, e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <option value={FIXED_VALUE}>Imagen fija (actual)</option>
                  {imageColumns.map((f) => (
                    <option key={f.id} value={f.id}>
                      Columna: {f.label}
                    </option>
                  ))}
                  <option value={MANUAL_VALUE}>Manual (rellenar antes de generar)</option>
                </select>
              </label>
            );
          })}
        </div>
      ) : null}

      {manualSlots.length > 0 ? (
        <div className="populate-template-panel__refs">
          <span className="populate-template-panel__refs-head">Rellenar antes de generar</span>
          {manualSlots.map((slot) => {
            const binding = bindings[slot.inputId];
            return (
              <label key={slot.inputId} className="populate-template-panel__ref">
                <span className="populate-template-panel__ref-label">{binding?.manualLabel || slot.label}</span>
                <input
                  type="text"
                  className="populate-template-panel__select nodrag"
                  value={binding?.manualValue ?? ""}
                  placeholder={binding?.manualPlaceholder || "Pega una URL de imagen…"}
                  onChange={(e) => setManualValue(slot.inputId, e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </label>
            );
          })}
        </div>
      ) : imageSlots.length === 0 ? (
        <span className="populate-template-panel__refs-empty">
          Conecta referencias de imagen a Image Creation para variarlas desde el Dataset.
        </span>
      ) : null}
    </div>
  );
}
