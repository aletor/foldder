"use client";

import React from "react";
import { Copy, Download, Image as ImageIcon, Link2, Loader2, Sparkles } from "lucide-react";
import type { DesignerFormModel } from "./populate-designer-form";
import { DesignerFormImagePicker } from "./DesignerFormImagePicker";

export interface DesignerFormPanelProps {
  model: DesignerFormModel;
  /** Valores del formulario (texto y, para imagen, el `value` de la opción elegida). */
  values: Record<string, string>;
  busy: boolean;
  progress: { done: number; total: number } | null;
  /** URLs (data URL) de los slides rasterizados tras generar. */
  results: string[];
  canGenerate: boolean;
  onChangeValue: (slotKey: string, value: string) => void;
  onAutofill?: (rowIndex: number) => void;
  onGenerate: () => void;
  shareToken?: string | null;
  shareBusy?: boolean;
  shareError?: string | null;
  onShare: () => void;
  onCopyShareUrl: () => void;
}

function downloadDataUrl(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Formulario derivado de los campos dinámicos de una plantilla Designer (modo "una pieza manual").
 * Al generar, congela una instancia con los valores tecleados y muestra tantas imágenes como slides.
 */
export function DesignerFormPanel({
  model,
  values,
  busy,
  progress,
  results,
  canGenerate,
  onChangeValue,
  onAutofill,
  onGenerate,
  shareToken,
  shareBusy = false,
  shareError,
  onShare,
  onCopyShareUrl,
}: DesignerFormPanelProps) {
  if (model.empty) {
    return (
      <div className="populate-form-panel nodrag" onPointerDown={(e) => e.stopPropagation()}>
        <span className="populate-form-panel__empty">
          Marca objetos como campo dinámico dentro del Designer para generar el formulario.
        </span>
      </div>
    );
  }

  const datalistId = "designer-form-suggest";

  return (
    <div className="populate-form-panel nodrag" onPointerDown={(e) => e.stopPropagation()}>
      <div className="populate-template-panel__head">
        <span className="populate-template-panel__title">Formulario</span>
        <span className="populate-template-panel__hint">
          rellena y genera · {model.slideCount} slide{model.slideCount === 1 ? "" : "s"}
        </span>
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

      {model.rows.length > 0 && onAutofill ? (
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
            <option value="">Desde un jugador ▾</option>
            {model.rows.map((r) => (
              <option key={r.rowIndex} value={r.rowIndex}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="populate-form-panel__fields">
        {model.fields.map((field) => {
          if (field.kind === "image") {
            return (
              <DesignerFormImagePicker
                key={field.slotKey}
                label={field.label}
                options={field.imageOptions}
                value={values[field.slotKey] ?? ""}
                onChange={(v) => onChangeValue(field.slotKey, v)}
                variant="studio"
              />
            );
          }
          const listId = field.suggestions.length > 0 ? `${datalistId}-${field.slotKey}` : undefined;
          return (
            <label key={field.slotKey} className="populate-form-panel__field">
              <span className="populate-form-panel__label">{field.label}</span>
              <input
                className="populate-form-panel__input nodrag"
                type="text"
                value={values[field.slotKey] ?? ""}
                list={listId}
                placeholder={`${field.label}…`}
                onChange={(e) => onChangeValue(field.slotKey, e.target.value)}
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
        title="Genera una instancia con los valores del formulario"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} strokeWidth={2.2} />}
        {busy && progress
          ? `Rasterizando ${progress.done}/${progress.total}`
          : `Generar · ${model.slideCount} slide${model.slideCount === 1 ? "" : "s"}`}
      </button>

      {results.length > 0 ? (
        <div className="designer-form-results nodrag">
          <span className="designer-form-results__label">
            <ImageIcon size={13} strokeWidth={1.75} aria-hidden />
            {results.length} slide{results.length === 1 ? "" : "s"}
          </span>
          <div className="designer-form-results__grid">
            {results.map((url, i) => (
              <div key={i} className="designer-form-results__item">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Slide ${i + 1}`} draggable={false} />
                <button
                  type="button"
                  className="designer-form-results__download nodrag"
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadDataUrl(url, `slide-${i + 1}.png`);
                  }}
                  title={`Descargar slide ${i + 1}`}
                >
                  <Download size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
