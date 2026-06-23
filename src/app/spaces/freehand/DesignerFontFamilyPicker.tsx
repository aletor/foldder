"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { GoogleFontCatalogEntry } from "./google-fonts";
import {
  cssFontFamilyForGooglePreview,
  ensureGoogleFontPreviewBatchLoaded,
} from "./google-fonts-preview-loader";

export type DesignerFontPickerOption = {
  value: string;
  label: string;
  /** Texto renderizado con la tipografía de vista previa (p. ej. solo el nombre de familia). */
  previewText: string;
  previewFamily: string;
  /** Subtítulo opcional (categoría, etc.) sin forzar la fuente de preview. */
  metaLabel?: string;
  /** Si true, se incluye en la precarga batch de Google Fonts. */
  googlePreview?: boolean;
};

export type DesignerFontPickerGroup = {
  label: string;
  options: DesignerFontPickerOption[];
};

export function buildDesignerFontPickerGroups(input: {
  currentFont?: DesignerFontPickerOption | null;
  customFamilies: string[];
  installedGoogleFamilies: string[];
  popularGoogleFonts: GoogleFontCatalogEntry[];
  systemFamilyLabels: string[];
  systemPreviewFamilyByLabel: Map<string, string>;
  googleCategoryByFamily: Map<string, string>;
}): DesignerFontPickerGroup[] {
  const groups: DesignerFontPickerGroup[] = [];
  if (input.currentFont) {
    groups.push({ label: "Fuente actual", options: [input.currentFont] });
  }
  if (input.customFamilies.length > 0) {
    groups.push({
      label: "Tipografías importadas",
      options: input.customFamilies.map((family) => ({
        value: family,
        label: family,
        previewText: family,
        previewFamily: cssFontFamilyForGooglePreview(family),
      })),
    });
  }
  if (input.installedGoogleFamilies.length > 0) {
    groups.push({
      label: "Google Fonts instaladas",
      options: input.installedGoogleFamilies.map((family) => {
        const category = input.googleCategoryByFamily.get(family) ?? "Google";
        return {
          value: family,
          label: `${family} (${category})`,
          previewText: family,
          metaLabel: category,
          previewFamily: cssFontFamilyForGooglePreview(family),
          googlePreview: true,
        };
      }),
    });
  }
  if (input.popularGoogleFonts.length > 0) {
    groups.push({
      label: "Google Fonts recomendadas",
      options: input.popularGoogleFonts.map((g) => ({
        value: g.family,
        label: `${g.family} (${g.category})`,
        previewText: g.family,
        metaLabel: g.category,
        previewFamily: cssFontFamilyForGooglePreview(g.family),
        googlePreview: true,
      })),
    });
  }
  if (input.systemFamilyLabels.length > 0) {
    groups.push({
      label: "Helvetica · sistema",
      options: input.systemFamilyLabels.map((familyLabel) => ({
        value: `${DESIGNER_SYSTEM_FONT_FAMILY_VALUE_PREFIX}${familyLabel}`,
        label: familyLabel,
        previewText: familyLabel,
        previewFamily: input.systemPreviewFamilyByLabel.get(familyLabel) ?? "Helvetica, sans-serif",
      })),
    });
  }
  return groups;
}

/** Prefijo de valor del picker para familias Helvetica del sistema (debe coincidir con FreehandStudio). */
export const DESIGNER_SYSTEM_FONT_FAMILY_VALUE_PREFIX = "__system-family:";

export type DesignerFontFamilyPickerProps = {
  value: string;
  onChange: (value: string) => void;
  groups: DesignerFontPickerGroup[];
  placeholder?: string;
  className?: string;
  menuClassName?: string;
  buttonClassName?: string;
};

function FontPreviewLabel({
  previewText,
  previewFamily,
  metaLabel,
  className = "",
}: {
  previewText: string;
  previewFamily: string;
  metaLabel?: string;
  className?: string;
}) {
  return (
    <span className={`min-w-0 ${className}`}>
      <span
        data-designer-font-picker-label
        className="block truncate leading-tight"
        style={
          {
            fontFamily: previewFamily,
            ["--designer-font-preview-family" as string]: previewFamily,
          } as React.CSSProperties
        }
      >
        {previewText}
      </span>
      {metaLabel ? (
        <span className="mt-0.5 block truncate text-[10px] uppercase tracking-wide text-zinc-500">{metaLabel}</span>
      ) : null}
    </span>
  );
}

export function DesignerFontFamilyPicker({
  value,
  onChange,
  groups,
  placeholder = "— Font —",
  className = "",
  menuClassName = "",
  buttonClassName,
}: DesignerFontFamilyPickerProps) {
  const [open, setOpen] = useState(false);
  const [previewReadyTick, setPreviewReadyTick] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const flatOptions = useMemo(() => groups.flatMap((g) => g.options), [groups]);
  const selected = flatOptions.find((o) => o.value === value) ?? null;

  const googlePreloadFamilies = useMemo(
    () =>
      Array.from(
        new Set(flatOptions.filter((o) => o.googlePreview).map((o) => o.value.trim()).filter(Boolean)),
      ),
    [flatOptions],
  );

  useEffect(() => {
    if (googlePreloadFamilies.length === 0) return;
    let cancelled = false;
    void ensureGoogleFontPreviewBatchLoaded(googlePreloadFamilies)
      .then(() => {
        if (!cancelled) setPreviewReadyTick((t) => t + 1);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [googlePreloadFamilies]);

  useEffect(() => {
    if (!open || typeof document === "undefined" || !document.fonts) return;
    const bump = () => setPreviewReadyTick((t) => t + 1);
    document.fonts.addEventListener("loadingdone", bump);
    return () => document.fonts.removeEventListener("loadingdone", bump);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  return (
    <div ref={wrapRef} className={`relative min-w-0 flex-1 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={
          buttonClassName ??
          "flex h-8 min-h-0 w-full min-w-0 items-center justify-between gap-2 rounded-[6px] border border-[#2d2f34] bg-[#1e2024] px-2 py-0 text-left text-[11px] text-zinc-100 transition hover:border-[#3f4249]"
        }
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected ? (
          <FontPreviewLabel
            previewText={selected.previewText}
            previewFamily={selected.previewFamily}
            metaLabel={selected.metaLabel}
            className="flex-1 text-[11px] text-zinc-100"
          />
        ) : (
          <span className="min-w-0 truncate text-zinc-400">{placeholder}</span>
        )}
        <ChevronDown size={12} className="shrink-0 text-zinc-500" strokeWidth={2.25} aria-hidden />
      </button>
      {open ? (
        <div
          key={previewReadyTick}
          className={`absolute left-0 right-0 top-[calc(100%+4px)] z-[180] max-h-[min(280px,42vh)] overflow-y-auto rounded-[8px] border border-white/[0.12] bg-[#1a1d26]/98 py-1 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-sm ${menuClassName}`}
          role="listbox"
          aria-label="Elegir fuente"
        >
          <button
            type="button"
            role="option"
            aria-selected={!value}
            className={`flex w-full px-2.5 py-1.5 text-left text-[11px] text-zinc-400 transition hover:bg-white/[0.07] ${!value ? "bg-white/[0.06]" : ""}`}
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            {placeholder}
          </button>
          {groups.map((group) => (
            <div key={group.label}>
              <div className="px-2.5 pb-0.5 pt-2 text-[9px] font-bold uppercase tracking-widest text-zinc-500">
                {group.label}
              </div>
              {group.options.map((opt) => {
                const active = value === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`flex w-full px-2.5 py-1.5 text-left transition ${
                      active ? "bg-violet-600/25 text-violet-50" : "text-zinc-100 hover:bg-white/[0.07]"
                    }`}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                  >
                    <FontPreviewLabel
                      previewText={opt.previewText}
                      previewFamily={opt.previewFamily}
                      metaLabel={opt.metaLabel}
                      className="text-[13px]"
                    />
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function resolveDesignerFontPickerPreviewFamily(
  value: string,
  systemPreviewFamilyByLabel: Map<string, string>,
): string {
  if (!value) return "inherit";
  if (value.startsWith(DESIGNER_SYSTEM_FONT_FAMILY_VALUE_PREFIX)) {
    const label = value.slice(DESIGNER_SYSTEM_FONT_FAMILY_VALUE_PREFIX.length);
    return systemPreviewFamilyByLabel.get(label) ?? "Helvetica, sans-serif";
  }
  return cssFontFamilyForGooglePreview(value);
}
