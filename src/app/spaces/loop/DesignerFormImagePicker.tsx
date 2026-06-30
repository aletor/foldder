"use client";

import React, { useMemo, useState } from "react";
import type { DesignerFormImageOption } from "./loop-designer-form";

export type DesignerFormImagePickerProps = {
  label: string;
  options: DesignerFormImageOption[];
  value: string;
  onChange: (value: string) => void;
  /** Estilos del panel Loop Studio (por defecto) o formulario público. */
  variant?: "studio" | "public";
  emptyHint?: string;
};

export function DesignerFormImagePicker({
  label,
  options,
  value,
  onChange,
  variant = "studio",
  emptyHint = "Mapea una columna de imagen en el Studio",
}: DesignerFormImagePickerProps) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const isPublic = variant === "public";

  if (options.length === 0) {
    return (
      <div className={isPublic ? "flex flex-col gap-1" : "loop-form-panel__field"}>
        <span
          className={
            isPublic
              ? "text-[10px] font-extrabold uppercase tracking-wider text-[#fd52eb]/85"
              : "loop-form-panel__label"
          }
        >
          {label}
        </span>
        <span
          className={isPublic ? "text-sm italic text-white/45" : "loop-form-panel__constant"}
          title={emptyHint}
        >
          Sin opciones — {emptyHint.toLowerCase()}
        </span>
      </div>
    );
  }

  const searchClass = isPublic
    ? "rounded-lg border border-[#fd52eb]/30 bg-black/50 px-3 py-2 text-sm text-white outline-none focus:border-[#fd52eb]/70"
    : "designer-form-image-picker__search nodrag loop-form-panel__input";

  const gridClass = isPublic
    ? "grid max-h-56 grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2 overflow-y-auto p-0 list-none"
    : "designer-form-image-picker__grid nodrag";

  const optionBase = isPublic
    ? "flex w-full flex-col gap-1 rounded-lg border p-1 transition"
    : "designer-form-image-picker__option";

  const optionSelected = isPublic
    ? "border-[#fd52eb]/75 bg-[#fd52eb]/12 shadow-[0_0_0_1px_rgba(253,82,235,0.25)]"
    : " is-selected";

  const optionDefault = isPublic
    ? "border-white/15 bg-black/30 hover:border-[#fd52eb]/45 hover:bg-[#fd52eb]/10"
    : "";

  const imgClass = isPublic
    ? "aspect-square w-full rounded object-cover bg-black/40"
    : undefined;

  const labelClass = isPublic
    ? "truncate text-center text-[9px] font-semibold leading-tight text-white/75"
    : undefined;

  return (
    <div
      className={
        isPublic ? "flex flex-col gap-2" : "loop-form-panel__field designer-form-image-picker"
      }
    >
      <span
        className={
          isPublic
            ? "text-[10px] font-extrabold uppercase tracking-wider text-[#fd52eb]/85"
            : "loop-form-panel__label"
        }
      >
        {label}
      </span>
      {options.length > 5 ? (
        <input
          type="search"
          className={searchClass}
          placeholder="Buscar jugador…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        />
      ) : null}
      <ul className={gridClass} onPointerDown={(e) => e.stopPropagation()}>
        {filtered.length === 0 ? (
          <li className={isPublic ? "col-span-full text-sm italic text-white/45" : "designer-form-image-picker__empty"}>
            Sin coincidencias
          </li>
        ) : (
          filtered.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                className={`${optionBase}${value === o.value ? optionSelected : optionDefault}`}
                onClick={() => onChange(o.value)}
                title={o.label}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={o.url} alt="" draggable={false} className={imgClass} />
                <span className={labelClass}>{o.label}</span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
