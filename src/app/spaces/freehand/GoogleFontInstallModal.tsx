"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  STUDIO_BODY_PORTAL_Z,
  studioModalBackdropHandlers,
  studioOverlayPointerGuards,
} from "./studio-modal-shell";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import type { GoogleFontCatalogEntry } from "./google-fonts";
import {
  GOOGLE_FONTS_INSTALL_PAGE_SIZE,
  paginateGoogleFontCatalog,
  searchGoogleFontCatalog,
} from "./google-fonts-catalog";
import {
  cssFontFamilyForGooglePreview,
  ensureGoogleFontPreviewBatchLoaded,
} from "./google-fonts-preview-loader";

export type GoogleFontInstallModalProps = {
  open: boolean;
  busy: boolean;
  loadingCatalog: boolean;
  catalogError: string | null;
  catalogCount: number;
  catalog: GoogleFontCatalogEntry[];
  categoryByFamily: Map<string, string>;
  installedFamilies: ReadonlySet<string>;
  selection: string;
  onSelectionChange: (family: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  onRetryCatalog: () => void;
};

export function GoogleFontInstallModal({
  open,
  busy,
  loadingCatalog,
  catalogError,
  catalogCount,
  catalog,
  categoryByFamily,
  installedFamilies,
  selection,
  onSelectionChange,
  onClose,
  onConfirm,
  onRetryCatalog,
}: GoogleFontInstallModalProps) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [previewReadyTick, setPreviewReadyTick] = useState(0);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setPage(1);
  }, [open]);

  useEffect(() => {
    setPage(1);
  }, [query]);

  const filtered = useMemo(() => searchGoogleFontCatalog(catalog, query), [catalog, query]);
  const { pageItems, page: safePage, totalPages, total } = useMemo(
    () => paginateGoogleFontCatalog(filtered, page, GOOGLE_FONTS_INSTALL_PAGE_SIZE),
    [filtered, page],
  );

  useEffect(() => {
    if (!open) return;
    const families = [
      ...(selection ? [selection] : []),
      ...pageItems.map((f) => f.family),
    ];
    const unique = Array.from(new Set(families)).slice(0, GOOGLE_FONTS_INSTALL_PAGE_SIZE + 1);
    if (unique.length === 0) return;
    let cancelled = false;
    void ensureGoogleFontPreviewBatchLoaded(unique)
      .then(() => {
        if (!cancelled) setPreviewReadyTick((t) => t + 1);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, pageItems, selection, query, page]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-stretch justify-center p-2 sm:p-3"
      style={{ zIndex: STUDIO_BODY_PORTAL_Z }}
      {...studioModalBackdropHandlers(() => {
        if (busy) return;
        onClose();
      })}
    >
      <div
        className="absolute inset-0 bg-black/65"
        aria-hidden
        onClick={() => {
          if (busy) return;
          onClose();
        }}
      />
      <div
        className="relative z-10 flex w-full max-w-2xl min-h-0 max-h-full flex-col overflow-hidden rounded-xl border border-white/[0.12] bg-[#12151a] shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="designer-google-font-install-title"
        {...studioOverlayPointerGuards}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.1] px-3 py-2">
          <div className="min-w-0">
            <h2 id="designer-google-font-install-title" className="text-[12px] font-semibold text-zinc-100">
              Todas las tipografías
            </h2>
            <p className="mt-0.5 text-[10px] text-zinc-500">
              {loadingCatalog
                ? "Cargando catálogo de Google Fonts…"
                : `${catalogCount.toLocaleString("es")} fuentes · busca y navega por páginas`}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="inline-flex h-7 shrink-0 items-center justify-center rounded-[5px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-[10px] font-semibold text-zinc-200 transition hover:bg-white/[0.1] disabled:opacity-40"
          >
            Cerrar
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o categoría"
            className="h-7 w-full shrink-0 rounded-[5px] border border-white/[0.12] bg-[#0f131a] px-2.5 text-[11px] text-zinc-100 outline-none ring-violet-500/40 focus:ring-2"
          />

          {catalogError ? (
            <div className="flex shrink-0 items-center justify-between gap-2 rounded-[5px] border border-amber-400/25 bg-amber-500/10 px-2.5 py-1.5 text-[10px] text-amber-100">
              <span>No se pudo cargar el catálogo completo. Mostrando lista reducida.</span>
              <button
                type="button"
                onClick={onRetryCatalog}
                className="shrink-0 rounded border border-amber-300/30 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide"
              >
                Reintentar
              </button>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto rounded-[6px] border border-white/[0.08] bg-[#0f131a] p-1.5">
            {loadingCatalog && pageItems.length === 0 ? (
              <div className="flex items-center justify-center gap-2 px-3 py-10 text-[11px] text-zinc-500">
                <Loader2 size={14} className="animate-spin" aria-hidden />
                Cargando fuentes…
              </div>
            ) : pageItems.length === 0 ? (
              <div className="px-3 py-6 text-center text-[11px] text-zinc-500">
                No hay resultados para esa búsqueda.
              </div>
            ) : (
              <div key={previewReadyTick} className="space-y-0.5">
                {pageItems.map((font) => {
                  const isSelected = selection === font.family;
                  const isInstalled = installedFamilies.has(font.family);
                  const category = categoryByFamily.get(font.family) ?? font.category;
                  return (
                    <button
                      key={font.family}
                      type="button"
                      onClick={() => onSelectionChange(font.family)}
                      className={`flex w-full items-center justify-between gap-2 rounded-[5px] border px-2 py-1.5 text-left transition ${
                        isSelected
                          ? "border-violet-400/60 bg-violet-500/20"
                          : "border-transparent bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.05]"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div
                          className="truncate text-[12px] text-zinc-100"
                          style={{ fontFamily: cssFontFamilyForGooglePreview(font.family) }}
                        >
                          {font.family}
                        </div>
                        <div className="text-[9px] uppercase tracking-wide text-zinc-500">{category}</div>
                        <div
                          className="mt-1 truncate rounded-[4px] border border-white/[0.08] bg-black/20 px-1.5 py-0.5 text-[13px] leading-tight text-zinc-200"
                          style={{ fontFamily: cssFontFamilyForGooglePreview(font.family) }}
                          aria-hidden
                        >
                          The quick brown fox 123
                        </div>
                      </div>
                      {isInstalled ? (
                        <span className="rounded border border-emerald-400/30 bg-emerald-500/15 px-1.5 py-px text-[8px] font-semibold uppercase tracking-wide text-emerald-200">
                          Instalada
                        </span>
                      ) : (
                        <span className="rounded border border-white/[0.14] bg-white/[0.04] px-1.5 py-px text-[8px] font-semibold uppercase tracking-wide text-zinc-400">
                          Disponible
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 text-[10px] text-zinc-400">
            <span>
              {total === 0
                ? "0 fuentes"
                : `${(safePage - 1) * GOOGLE_FONTS_INSTALL_PAGE_SIZE + 1}–${Math.min(safePage * GOOGLE_FONTS_INSTALL_PAGE_SIZE, total)} de ${total.toLocaleString("es")}`}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={busy || safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex h-7 items-center gap-0.5 rounded-[5px] border border-white/[0.12] bg-white/[0.04] px-2 text-[10px] font-medium text-zinc-200 transition hover:bg-white/[0.1] disabled:opacity-40"
              >
                <ChevronLeft size={12} aria-hidden />
                Ant.
              </button>
              <span className="min-w-[3.5rem] text-center tabular-nums">
                {safePage}/{totalPages}
              </span>
              <button
                type="button"
                disabled={busy || safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex h-7 items-center gap-0.5 rounded-[5px] border border-white/[0.12] bg-white/[0.04] px-2 text-[10px] font-medium text-zinc-200 transition hover:bg-white/[0.1] disabled:opacity-40"
              >
                Sig.
                <ChevronRight size={12} aria-hidden />
              </button>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-1.5 border-t border-white/[0.08] px-3 py-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-[5px] border border-white/[0.12] bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium text-zinc-300 transition hover:bg-white/[0.1] disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy || !selection}
            onClick={onConfirm}
            className="inline-flex items-center gap-1.5 rounded-[5px] border border-violet-400/40 bg-violet-600/35 px-2.5 py-1 text-[10px] font-semibold text-violet-50 transition hover:bg-violet-600/50 disabled:opacity-40"
          >
            {busy ? <Loader2 size={11} className="animate-spin" aria-hidden /> : null}
            {busy ? "Instalando..." : "Instalar y usar"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
