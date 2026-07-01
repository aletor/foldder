"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Type } from "lucide-react";
import type { FieldDef } from "@/app/spaces/dataset/dataset-types";
import type { PopulatePickOption } from "./populate-designer-form";
import type { PopulatePoseOptionVisual } from "./populate-row-preview";

function useCloseOnOutside(open: boolean, onClose: () => void, rootRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onClose, rootRef]);
}

export function PopulateRecordGrid({
  label,
  options,
  value,
  onChange,
  thumbForOption,
  variant = "studio",
  layout = "grid",
}: {
  label: string;
  options: PopulatePickOption[];
  value: string;
  onChange: (cardId: string) => void;
  thumbForOption?: (cardId: string) => string | undefined;
  variant?: "studio" | "public";
  /** `compact`: lista vertical. `dropdown`: desplegable con foto + nombre. */
  layout?: "grid" | "compact" | "dropdown";
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  useCloseOnOutside(open, () => setOpen(false), rootRef);

  const selected = options.find((o) => o.cardId === value) ?? options[0];
  const selectedThumb = selected ? thumbForOption?.(selected.cardId) : undefined;

  const root =
    variant === "public"
      ? "populate-record-grid populate-record-grid--public"
      : "populate-record-grid";
  const layoutClass =
    layout === "compact"
      ? " populate-record-grid--compact"
      : layout === "dropdown"
        ? " populate-record-grid--dropdown"
        : "";

  if (layout === "dropdown") {
    return (
      <div className={`${root}${layoutClass}`} ref={rootRef}>
        <span className="populate-record-grid__label">{label}</span>
        <div className="populate-record-dropdown nodrag">
          <button
            type="button"
            className={`populate-record-dropdown__trigger${open ? " is-open" : ""}`}
            aria-expanded={open}
            aria-haspopup="listbox"
            onClick={() => setOpen((o) => !o)}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <span className="populate-record-dropdown__value">
              {selectedThumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedThumb}
                  alt=""
                  className="populate-record-dropdown__thumb"
                  draggable={false}
                />
              ) : (
                <span className="populate-record-dropdown__thumb populate-record-dropdown__thumb--empty" />
              )}
              <span className="populate-record-dropdown__name">{selected?.label ?? "Elegir…"}</span>
            </span>
            <ChevronDown size={14} className="populate-record-dropdown__chevron" aria-hidden />
          </button>
          {open ? (
            <div className="populate-record-dropdown__panel nodrag" onPointerDown={(e) => e.stopPropagation()}>
              {options.length > 8 ? (
                <input
                  type="search"
                  className="populate-record-dropdown__search"
                  placeholder="Buscar…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              ) : null}
              <ul className="populate-record-dropdown__list" role="listbox">
                {filtered.map((o) => {
                  const thumb = thumbForOption?.(o.cardId);
                  const isSelected = value === o.cardId;
                  return (
                    <li key={o.cardId} role="option" aria-selected={isSelected}>
                      <button
                        type="button"
                        className={`populate-record-dropdown__option${isSelected ? " is-selected" : ""}`}
                        onClick={() => {
                          onChange(o.cardId);
                          setOpen(false);
                          setQuery("");
                        }}
                      >
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumb}
                            alt=""
                            className="populate-record-dropdown__thumb"
                            draggable={false}
                          />
                        ) : (
                          <span className="populate-record-dropdown__thumb populate-record-dropdown__thumb--empty" />
                        )}
                        <span className="populate-record-dropdown__name">{o.label}</span>
                        {isSelected ? (
                          <Check size={12} className="populate-record-dropdown__check" aria-hidden />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className={`${root}${layoutClass}`}>
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
          const isSelected = value === o.cardId;
          return (
            <li key={o.cardId}>
              <button
                type="button"
                className={`populate-record-grid__item${isSelected ? " is-selected" : ""}`}
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
                {isSelected ? <Check size={12} className="populate-record-grid__check" aria-hidden /> : null}
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
  layout = "grid",
}: {
  label: string;
  options: PopulatePoseOptionVisual[];
  value: string;
  onChange: (fieldId: string) => void;
  variant?: "studio" | "public";
  /** `dropdown`: desplegable compacto (recomendado en formulario público). */
  layout?: "grid" | "dropdown";
}) {
  if (options.length <= 1) return null;

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useCloseOnOutside(open, () => setOpen(false), rootRef);

  const selected = options.find((o) => o.fieldId === value) ?? options[0];
  const root =
    variant === "public" ? "populate-pose-grid populate-pose-grid--public" : "populate-pose-grid";
  const layoutClass = layout === "dropdown" ? " populate-pose-grid--dropdown" : "";

  if (layout === "dropdown") {
    return (
      <div className={`${root}${layoutClass}`} ref={rootRef}>
        <span className="populate-pose-grid__label">{label}</span>
        <div className="populate-record-dropdown nodrag">
          <button
            type="button"
            className={`populate-record-dropdown__trigger${open ? " is-open" : ""}`}
            aria-expanded={open}
            aria-haspopup="listbox"
            onClick={() => setOpen((o) => !o)}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <span className="populate-record-dropdown__value">
              {selected?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selected.url}
                  alt=""
                  className="populate-record-dropdown__thumb"
                  draggable={false}
                />
              ) : (
                <span className="populate-record-dropdown__thumb populate-record-dropdown__thumb--empty" />
              )}
              <span className="populate-record-dropdown__name">{selected?.label ?? "Elegir…"}</span>
            </span>
            <ChevronDown size={14} className="populate-record-dropdown__chevron" aria-hidden />
          </button>
          {open ? (
            <div className="populate-record-dropdown__panel nodrag" onPointerDown={(e) => e.stopPropagation()}>
              <ul className="populate-record-dropdown__list" role="listbox">
                {options.map((o) => {
                  const isSelected = value === o.fieldId;
                  return (
                    <li key={o.fieldId} role="option" aria-selected={isSelected}>
                      <button
                        type="button"
                        className={`populate-record-dropdown__option${isSelected ? " is-selected" : ""}`}
                        onClick={() => {
                          onChange(o.fieldId);
                          setOpen(false);
                        }}
                      >
                        {o.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={o.url}
                            alt=""
                            className="populate-record-dropdown__thumb"
                            draggable={false}
                          />
                        ) : (
                          <span className="populate-record-dropdown__thumb populate-record-dropdown__thumb--empty" />
                        )}
                        <span className="populate-record-dropdown__name">{o.label}</span>
                        {isSelected ? (
                          <Check size={12} className="populate-record-dropdown__check" aria-hidden />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className={`${root}${layoutClass}`}>
      <span className="populate-pose-grid__label">{label}</span>
      <ul className="populate-pose-grid__list nodrag" onPointerDown={(e) => e.stopPropagation()}>
        {options.map((o) => {
          const isSelected = value === o.fieldId;
          return (
            <li key={o.fieldId}>
              <button
                type="button"
                className={`populate-pose-grid__item${isSelected ? " is-selected" : ""}`}
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
