"use client";

import React, { useMemo, useState } from "react";
import { Check, Type } from "lucide-react";
import type { FieldDef } from "@/app/spaces/dataset/dataset-types";
import type { PopulatePickOption } from "./populate-designer-form";
import type { PopulatePoseOptionVisual } from "./populate-row-preview";

export function PopulateRecordGrid({
  label,
  options,
  value,
  onChange,
  thumbForOption,
  variant = "studio",
}: {
  label: string;
  options: PopulatePickOption[];
  value: string;
  onChange: (cardId: string) => void;
  thumbForOption?: (cardId: string) => string | undefined;
  variant?: "studio" | "public";
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const root = variant === "public" ? "populate-record-grid populate-record-grid--public" : "populate-record-grid";

  return (
    <div className={root}>
      <span className="populate-record-grid__label">{label}</span>
      {options.length > 6 ? (
        <input
          type="search"
          className="populate-record-grid__search nodrag"
          placeholder="Buscar…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
        />
      ) : null}
      <ul className="populate-record-grid__list nodrag" onPointerDown={(e) => e.stopPropagation()}>
        {filtered.map((o) => {
          const thumb = thumbForOption?.(o.cardId);
          const selected = value === o.cardId;
          return (
            <li key={o.cardId}>
              <button
                type="button"
                className={`populate-record-grid__item${selected ? " is-selected" : ""}`}
                onClick={() => onChange(o.cardId)}
                title={o.label}
              >
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt="" className="populate-record-grid__thumb" draggable={false} />
                ) : (
                  <span className="populate-record-grid__thumb populate-record-grid__thumb--empty" />
                )}
                <span className="populate-record-grid__name">{o.label}</span>
                {selected ? <Check size={12} className="populate-record-grid__check" aria-hidden /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PopulatePoseGrid({
  label,
  options,
  value,
  onChange,
  variant = "studio",
}: {
  label: string;
  options: PopulatePoseOptionVisual[];
  value: string;
  onChange: (fieldId: string) => void;
  variant?: "studio" | "public";
}) {
  if (options.length <= 1) return null;
  const root = variant === "public" ? "populate-pose-grid populate-pose-grid--public" : "populate-pose-grid";

  return (
    <div className={root}>
      <span className="populate-pose-grid__label">{label}</span>
      <ul className="populate-pose-grid__list nodrag" onPointerDown={(e) => e.stopPropagation()}>
        {options.map((o) => {
          const selected = value === o.fieldId;
          return (
            <li key={o.fieldId}>
              <button
                type="button"
                className={`populate-pose-grid__item${selected ? " is-selected" : ""}`}
                onClick={() => onChange(o.fieldId)}
                title={o.label}
              >
                {o.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={o.url} alt="" className="populate-pose-grid__thumb" draggable={false} />
                ) : (
                  <span className="populate-pose-grid__thumb populate-pose-grid__thumb--empty">{o.label}</span>
                )}
                <span className="populate-pose-grid__name">{o.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PopulateTextPreviews({
  items,
  variant = "studio",
}: {
  items: Array<{ label: string; text: string }>;
  variant?: "studio" | "public";
}) {
  const visible = items.filter((i) => i.text.trim());
  if (visible.length === 0) return null;
  const root = variant === "public" ? "populate-text-previews populate-text-previews--public" : "populate-text-previews";

  return (
    <ul className={root}>
      {visible.map((item) => (
        <li key={item.label} className="populate-text-previews__item">
          <Type size={12} aria-hidden className="populate-text-previews__icon" />
          <span className="populate-text-previews__field">{item.label}</span>
          <span className="populate-text-previews__value">{item.text}</span>
        </li>
      ))}
    </ul>
  );
}

export function PopulateColumnPicker({
  kind,
  schema,
  valueFieldId,
  onPick,
  previewText,
  previewUrl,
}: {
  kind: "text" | "image";
  schema: FieldDef[];
  valueFieldId: string;
  onPick: (fieldId: string) => void;
  previewText?: (fieldId: string) => string;
  previewUrl?: (fieldId: string) => string | undefined;
}) {
  const fields = schema.filter((f) => (kind === "image" ? f.type === "image" : f.type === "text"));

  return (
    <ul className="populate-column-picker nodrag" onPointerDown={(e) => e.stopPropagation()}>
      {fields.map((f) => {
        const selected = valueFieldId === f.id;
        const text = kind === "text" ? previewText?.(f.id) : undefined;
        const url = kind === "image" ? previewUrl?.(f.id) : undefined;
        return (
          <li key={f.id}>
            <button
              type="button"
              className={`populate-column-picker__item${selected ? " is-selected" : ""}`}
              onClick={() => onPick(f.id)}
            >
              {kind === "image" && url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" className="populate-column-picker__thumb" draggable={false} />
              ) : null}
              <span className="populate-column-picker__body">
                <span className="populate-column-picker__name">{f.label}</span>
                {kind === "text" && text ? (
                  <span className="populate-column-picker__sample">{text}</span>
                ) : null}
                {kind === "image" && !url ? (
                  <span className="populate-column-picker__sample populate-column-picker__sample--muted">
                    Sin imagen en vista previa
                  </span>
                ) : null}
              </span>
              {selected ? <Check size={14} className="populate-column-picker__check" aria-hidden /> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
