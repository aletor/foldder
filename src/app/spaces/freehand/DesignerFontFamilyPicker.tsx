"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  /** Subtítulo opcional (reservado; no se muestra en el listado). */
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
      options: input.installedGoogleFamilies.map((family) => ({
        value: family,
        label: family,
        previewText: family,
        previewFamily: cssFontFamilyForGooglePreview(family),
        googlePreview: true,
      })),
    });
  }
  if (input.popularGoogleFonts.length > 0) {
    groups.push({
      label: "Google Fonts recomendadas",
      options: input.popularGoogleFonts.map((g) => ({
        value: g.family,
        label: g.family,
        previewText: g.family,
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

const DEFAULT_BUTTON_CLASS =
  "flex h-7 min-h-0 w-full min-w-0 items-center justify-between gap-1.5 rounded-[6px] border border-[#2d2f34] bg-[#1e2024] px-2 py-0 text-left text-[10px] text-zinc-100 transition hover:border-[#3f4249]";

export type DesignerFontFamilyPickerProps = {
  value: string;
  onChange: (value: string) => void;
  groups: DesignerFontPickerGroup[];
  placeholder?: string;
  className?: string;
  menuClassName?: string;
  buttonClassName?: string;
  /** Portal al body para que el menú no quede recortado por overflow del panel. */
  usePortal?: boolean;
};

function FontPreviewLabel({
  previewText,
  previewFamily,
  className = "",
  compact = false,
}: {
  previewText: string;
  previewFamily: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <span className={`min-w-0 ${className}`}>
      <span
        data-designer-font-picker-label
        className={`block truncate leading-tight ${compact ? "text-[11px]" : ""}`}
        style={
          {
            fontFamily: previewFamily,
            ["--designer-font-preview-family" as string]: previewFamily,
          } as React.CSSProperties
        }
      >
        {previewText}
      </span>
    </span>
  );
}

type MenuLayout = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

function computeMenuLayout(trigger: HTMLElement): MenuLayout {
  const rect = trigger.getBoundingClientRect();
  const margin = 8;
  const gap = 4;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(Math.max(rect.width, 200), vw - margin * 2);
  const left = Math.min(Math.max(rect.left, margin), vw - width - margin);
  const spaceBelow = vh - rect.bottom - gap - margin;
  const spaceAbove = rect.top - gap - margin;
  const openBelow = spaceBelow >= 120 || spaceBelow >= spaceAbove;
  const maxHeight = Math.max(120, openBelow ? spaceBelow : spaceAbove);
  const top = openBelow ? rect.bottom + gap : rect.top - gap - maxHeight;
  return { top, left, width, maxHeight };
}

export function DesignerFontFamilyPicker({
  value,
  onChange,
  groups,
  placeholder = "— Font —",
  className = "",
  menuClassName = "",
  buttonClassName,
  usePortal = true,
}: DesignerFontFamilyPickerProps) {
  const [open, setOpen] = useState(false);
  const [previewReadyTick, setPreviewReadyTick] = useState(0);
  const [menuLayout, setMenuLayout] = useState<MenuLayout | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const flatOptions = useMemo(() => groups.flatMap((g) => g.options), [groups]);
  const selected = flatOptions.find((o) => o.value === value) ?? null;

  const googlePreloadFamilies = useMemo(
    () =>
      Array.from(
        new Set(flatOptions.filter((o) => o.googlePreview).map((o) => o.value.trim()).filter(Boolean)),
      ),
    [flatOptions],
  );

  const updateMenuLayout = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    setMenuLayout(computeMenuLayout(trigger));
  }, []);

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

  useLayoutEffect(() => {
    if (!open) {
      setMenuLayout(null);
      return;
    }
    updateMenuLayout();
  }, [open, updateMenuLayout, groups.length]);

  useEffect(() => {
    if (!open) return;
    const onReposition = () => updateMenuLayout();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, updateMenuLayout]);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  const menuContent = open ? (
    <div
      ref={menuRef}
      key={previewReadyTick}
      className={`overflow-y-auto rounded-[8px] border border-white/[0.12] bg-[#1a1d26]/98 py-0.5 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-sm ${menuClassName}`}
      style={
        usePortal && menuLayout
          ? {
              position: "fixed",
              top: menuLayout.top,
              left: menuLayout.left,
              width: menuLayout.width,
              maxHeight: menuLayout.maxHeight,
              zIndex: 100150,
            }
          : {
              maxHeight: "min(280px, 42vh)",
            }
      }
      role="listbox"
      aria-label="Elegir fuente"
    >
      <button
        type="button"
        role="option"
        aria-selected={!value}
        className={`flex w-full px-2 py-1 text-left text-[10px] text-zinc-400 transition hover:bg-white/[0.07] ${!value ? "bg-white/[0.06]" : ""}`}
        onClick={() => {
          onChange("");
          setOpen(false);
        }}
      >
        {placeholder}
      </button>
      {groups.map((group) => (
        <div key={group.label}>
          <div className="px-2 pb-px pt-1.5 text-[8px] font-bold uppercase tracking-widest text-zinc-500">
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
                className={`flex w-full px-2 py-1 text-left transition ${
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
                  compact
                  className="text-[12px]"
                />
              </button>
            );
          })}
        </div>
      ))}
    </div>
  ) : null;

  return (
    <div ref={wrapRef} className={`relative min-w-0 flex-1 ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setOpen((wasOpen) => {
            const next = !wasOpen;
            if (next && triggerRef.current) {
              setMenuLayout(computeMenuLayout(triggerRef.current));
            }
            if (!next) setMenuLayout(null);
            return next;
          });
        }}
        className={buttonClassName ?? DEFAULT_BUTTON_CLASS}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected ? (
          <FontPreviewLabel
            previewText={selected.previewText}
            previewFamily={selected.previewFamily}
            compact
            className="flex-1 text-[10px] text-zinc-100"
          />
        ) : (
          <span className="min-w-0 truncate text-zinc-400">{placeholder}</span>
        )}
        <ChevronDown size={11} className="shrink-0 text-zinc-500" strokeWidth={2.25} aria-hidden />
      </button>
      {menuContent && (!usePortal || menuLayout)
        ? usePortal && typeof document !== "undefined"
          ? createPortal(menuContent, document.body)
          : (
            <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-[180]">{menuContent}</div>
          )
        : null}
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
