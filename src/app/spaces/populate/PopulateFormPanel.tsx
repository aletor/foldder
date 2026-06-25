"use client";

import React from "react";
import { Copy, Link2, Loader2, Sparkles } from "lucide-react";
import type { PopulateFormModel } from "./populate-form";

export interface PopulateFormPanelProps {
  model: PopulateFormModel;
  textValues: Record<string, string>;
  imageRows: Record<string, number>;
  busy: boolean;
  canGenerate: boolean;
  onChangeText: (fieldKey: string, value: string) => void;
  onChangeImageRow: (inputId: string, rowIndex: number) => void;
  onAutofill: (rowIndex: number) => void;
  onGenerate: () => void;
  shareToken?: string | null;
  shareBusy?: boolean;
  shareError?: string | null;
  onShare: () => void;
  onCopyShareUrl: () => void;
}

/**
 * Formulario derivado de las variables de la plantilla (modo "una pieza al
 * instante"). No se diseña: aparece un campo por variable. Texto libre con
 * sugerencias del Dataset, o selección de fila para las imágenes.
 */
export function PopulateFormPanel({
  model,
  textValues,
  imageRows,
  busy,
  canGenerate,
  onChangeText,
  onChangeImageRow,
  onAutofill,
  onGenerate,
  shareToken,
  shareBusy = false,
  shareError,
  onShare,
  onCopyShareUrl,
}: PopulateFormPanelProps) {
  if (model.empty) {
    return (
      <div className="populate-form-panel nodrag" onPointerDown={(e) => e.stopPropagation()}>
        <span className="populate-form-panel__empty">
          Inserta campos del Dataset en el prompt o mapea una referencia para
          generar el formulario.
        </span>
      </div>
    );
  }

  const datalistId = "populate-form-suggest";

  return (
    <div className="populate-form-panel nodrag" onPointerDown={(e) => e.stopPropagation()}>
      <div className="populate-template-panel__head">
        <span className="populate-template-panel__title">Formulario</span>
        <span className="populate-template-panel__hint">rellena y genera una pieza</span>
      </div>

      <div className="populate-form-share nodrag" onPointerDown={(e) => e.stopPropagation()}>
        {shareToken ? (
          <button
            type="button"
            className="populate-form-share__copy nodrag"
            onClick={(e) => {
              e.stopPropagation();
              onCopyShareUrl();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title="Copiar URL pública"
          >
            <Copy size={11} />
            Copiar URL pública
          </button>
        ) : null}
        <button
          type="button"
          className="populate-form-share__create nodrag"
          disabled={shareBusy}
          onClick={(e) => {
            e.stopPropagation();
            onShare();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          title={shareToken ? "Actualizar instantánea del enlace público" : "Crear enlace público compartible"}
        >
          {shareBusy ? <Loader2 size={11} className="animate-spin" /> : <Link2 size={11} />}
          {shareToken ? "Actualizar enlace" : "URL pública"}
        </button>
        {shareError ? <span className="populate-form-share__error">{shareError}</span> : null}
      </div>

      {model.rows.length > 0 ? (
        <label className="populate-form-panel__autofill">
          <span className="populate-template-panel__ref-label">Autorellenar</span>
          <select
            className="populate-template-panel__select nodrag"
            value=""
            onChange={(e) => {
              const idx = Number(e.target.value);
              if (Number.isInteger(idx)) onAutofill(idx);
              e.target.value = "";
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title="Rellenar el formulario desde una fila del Dataset"
          >
            <option value="">Desde una fila ▾</option>
            {model.rows.map((r) => (
              <option key={r.rowIndex} value={r.rowIndex}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="populate-form-panel__fields">
        {model.textFields.map((field) => {
          if (field.kind === "constant") {
            return (
              <label key={field.fieldKey} className="populate-form-panel__field">
                <span className="populate-form-panel__label">{field.label}</span>
                <span className="populate-form-panel__constant" title="Valor constante del Dataset">
                  {field.constantValue || "—"}
                </span>
              </label>
            );
          }
          const listId = field.suggestions.length > 0 ? `${datalistId}-${field.fieldKey}` : undefined;
          return (
            <label key={field.fieldKey} className="populate-form-panel__field">
              <span className="populate-form-panel__label">{field.label}</span>
              <input
                className="populate-form-panel__input nodrag"
                type="text"
                value={textValues[field.fieldKey] ?? ""}
                list={listId}
                placeholder={`${field.label}…`}
                onChange={(e) => onChangeText(field.fieldKey, e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              />
              {listId ? (
                <datalist id={listId}>
                  {field.suggestions.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              ) : null}
            </label>
          );
        })}

        {model.imageFields.map((field) => (
          <label key={field.inputId} className="populate-form-panel__field">
            <span className="populate-form-panel__label">{field.label}</span>
            <select
              className="populate-template-panel__select nodrag"
              value={imageRows[field.inputId] ?? ""}
              onChange={(e) => {
                const idx = Number(e.target.value);
                if (Number.isInteger(idx)) onChangeImageRow(field.inputId, idx);
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <option value="">Elegir imagen ▾</option>
              {field.options.map((o) => (
                <option key={o.rowIndex} value={o.rowIndex}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <button
        type="button"
        disabled={busy || !canGenerate}
        onClick={(e) => {
          e.stopPropagation();
          onGenerate();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="execute-btn populate-form-generate nodrag"
        title="Genera una pieza con los valores del formulario"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} strokeWidth={2.2} />}
        Generar 1
      </button>
    </div>
  );
}
