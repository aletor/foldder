"use client";

import React, { useMemo, useState } from "react";
import { BookmarkPlus, Check, Download, FolderDown, Loader2, X } from "lucide-react";
import {
  STUDIO_LAYER_MODAL_Z,
  studioModalBackdropHandlers,
} from "./studio-modal-shell";
import type { Rect } from "./freehand-export";
import {
  exportCtaLabel,
  pageScopeHint,
  showDesignerPageScope,
  type ExportDestination,
  type ExportFormat,
  type ExportPageScope,
  type ExportScalePreset,
  type ProfessionalExportOptions,
} from "./freehand-export-modal-logic";

export type {
  ExportDestination,
  ExportFormat,
  ExportPageScope,
  ExportScalePreset,
  ProfessionalExportOptions,
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Bounds in world/canvas units (before pixel scale). */
  bounds: Rect | null;
  defaultFilename: string;
  selectionLabel: string;
  hasSelection: boolean;
  exportScope?: "selection" | "full";
  /** Listado para exportación por lote (mismo documento). */
  artboardList?: { id: string; name: string }[];
  onExport: (opts: ProfessionalExportOptions) => void | Promise<void>;
  /** Designer: documento multipágina (ámbito de páginas + PDF del documento). */
  designerMultipageVectorPdf?: {
    pageCount: number;
    busy: boolean;
  } | null;
  /** Designer: guardar el documento como plantilla en Inspiración. */
  saveToInspiration?: {
    state: "idle" | "busy" | "done" | "error";
    onSave: () => void | Promise<void>;
  } | null;
  /** Variante Flush Chrome (PhotoRoom): rectangular, sin sombras, fondo plano. */
  flush?: boolean;
};

const FORMAT_TABS: { id: ExportFormat; label: string }[] = [
  { id: "png", label: "PNG" },
  { id: "jpg", label: "JPG" },
  { id: "svg", label: "SVG" },
  { id: "pdf", label: "PDF" },
];

export function FreehandExportModal({
  open,
  onClose,
  bounds,
  defaultFilename,
  selectionLabel,
  hasSelection,
  exportScope = "selection",
  artboardList = [],
  onExport,
  designerMultipageVectorPdf = null,
  saveToInspiration = null,
  flush = false,
}: Props) {
  const [format, setFormat] = useState<ExportFormat>("png");
  const [scalePreset, setScalePreset] = useState<ExportScalePreset>(1);
  const [customScale, setCustomScale] = useState("1");
  const [useCustomScale, setUseCustomScale] = useState(false);
  const [bgMode, setBgMode] = useState<"transparent" | "custom">("transparent");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [merged, setMerged] = useState(true);
  const [batchAllArtboards, setBatchAllArtboards] = useState(false);
  const [batchSelected, setBatchSelected] = useState<Record<string, boolean>>({});
  const [pdfMakeUrlsClickable, setPdfMakeUrlsClickable] = useState(false);
  const [pdfOutlineLinkRects, setPdfOutlineLinkRects] = useState(false);
  const [pdfOptimizeImages, setPdfOptimizeImages] = useState(false);
  const [pdfSelectableText, setPdfSelectableText] = useState(true);
  const [destination, setDestination] = useState<ExportDestination>("download");
  const [pageScope, setPageScope] = useState<ExportPageScope>("current");
  const [running, setRunning] = useState(false);

  const designerPageCount = designerMultipageVectorPdf?.pageCount ?? 0;
  const pageScopeVisible = showDesignerPageScope(designerPageCount, exportScope);
  const effectivePageScope: ExportPageScope = pageScopeVisible ? pageScope : "current";
  const showRasterScale = format === "png" || format === "jpg";
  const showBackground = format === "png" || format === "jpg" || format === "svg";
  const showPdfOptions = format === "pdf";
  const designerBusy = Boolean(designerMultipageVectorPdf?.busy);
  const busy = running || designerBusy;

  const effectiveScale = useMemo(() => {
    if (useCustomScale) {
      const n = parseFloat(customScale.replace(",", "."));
      return Number.isFinite(n) && n > 0 ? Math.min(16, Math.max(0.25, n)) : 1;
    }
    return scalePreset;
  }, [useCustomScale, customScale, scalePreset]);

  const pixelSize = useMemo(() => {
    if (!bounds) return { w: 0, h: 0 };
    return {
      w: Math.max(1, Math.round(bounds.w * effectiveScale)),
      h: Math.max(1, Math.round(bounds.h * effectiveScale)),
    };
  }, [bounds, effectiveScale]);

  const ctaLabel = exportCtaLabel({
    format,
    destination,
    pageScope: effectivePageScope,
    pageCount: designerPageCount,
  });

  if (!open) return null;

  const run = async () => {
    if (busy) return;
    const base =
      (defaultFilename || "export").trim().replace(/[^a-z0-9-_]/gi, "_").slice(0, 80) || "export";
    const ext =
      format === "svg" ? "svg" : format === "jpg" ? "jpg" : format === "pdf" ? "pdf" : "png";
    const safe = `${base.replace(/\.(png|svg|jpg|jpeg|pdf)$/i, "")}.${ext}`;
    const batchIds =
      exportScope === "full" && batchAllArtboards && artboardList.length > 0
        ? artboardList.filter((a) => batchSelected[a.id]).map((a) => a.id)
        : null;
    setRunning(true);
    try {
      await onExport({
        format,
        scale: effectiveScale,
        background:
          format === "jpg"
            ? bgMode === "transparent"
              ? "#ffffff"
              : bgColor
            : bgMode === "transparent"
              ? "transparent"
              : bgColor,
        filename: safe,
        merged,
        batchArtboardIds: batchIds && batchIds.length > 0 ? batchIds : undefined,
        optimizeImages: format === "pdf" ? pdfOptimizeImages : undefined,
        pdfSelectableText: format === "pdf" ? pdfSelectableText : undefined,
        pdfMakeUrlsClickable: format === "pdf" ? pdfMakeUrlsClickable : undefined,
        pdfOutlineLinkRects: format === "pdf" ? pdfOutlineLinkRects : undefined,
        destination,
        pageScope: effectivePageScope,
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm transition-opacity duration-150"
      style={{ zIndex: STUDIO_LAYER_MODAL_Z }}
      role="presentation"
      {...studioModalBackdropHandlers(onClose)}
    >
      <div
        data-foldder-studio-flush={flush ? "" : undefined}
        className={`w-full max-w-md border border-white/[0.12] transition-transform duration-150 ease-out ${
          flush ? "bg-[#0b0f14] shadow-[0_24px_70px_rgba(0,0,0,0.55)]" : "rounded-xl bg-[#12151a] shadow-2xl"
        }`}
        style={{ fontFamily: '"Passion One", ui-sans-serif, system-ui, sans-serif' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
          <div>
            <h2 className="text-[13px] font-semibold tracking-tight text-white">Exportar</h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">{selectionLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
            aria-label="Cerrar"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          <div className="space-y-2">
            <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Formato</label>
            <div className="grid grid-cols-4 gap-1.5">
              {FORMAT_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFormat(tab.id)}
                  className={`rounded-lg py-2 text-[11px] font-semibold tracking-wide transition-colors duration-150 ${
                    format === tab.id
                      ? "bg-sky-500/25 text-sky-300 ring-1 ring-sky-500/40"
                      : "bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08] hover:text-white"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {showRasterScale && (
            <div className="space-y-2">
              <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Escala</label>
              <div className="flex flex-wrap gap-2">
                {([1, 2, 3] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setScalePreset(s);
                      setUseCustomScale(false);
                    }}
                    className={`min-w-[3rem] rounded-lg py-1.5 text-[11px] font-mono transition-colors duration-150 ${
                      !useCustomScale && scalePreset === s
                        ? "bg-white/[0.12] text-white"
                        : "bg-white/[0.04] text-zinc-400 hover:text-white"
                    }`}
                  >
                    {s}×
                  </button>
                ))}
                <label className="flex flex-1 items-center gap-2 rounded-lg bg-white/[0.04] px-2 py-1">
                  <span className="text-[10px] text-zinc-500">Otra</span>
                  <input
                    type="text"
                    value={customScale}
                    onChange={(e) => {
                      setCustomScale(e.target.value);
                      setUseCustomScale(true);
                    }}
                    className="min-w-0 flex-1 bg-transparent text-right text-[11px] font-mono text-white outline-none"
                    placeholder="1"
                  />
                </label>
              </div>
            </div>
          )}

          {showBackground && (
            <div className="space-y-2">
              <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Fondo</label>
              <div className="flex flex-wrap items-center gap-3">
                {format !== "jpg" && (
                  <label className="flex cursor-pointer items-center gap-2 text-[11px] text-zinc-300">
                    <input
                      type="radio"
                      name="bg"
                      checked={bgMode === "transparent"}
                      onChange={() => setBgMode("transparent")}
                      className="accent-sky-500"
                    />
                    Transparente
                  </label>
                )}
                <label className="flex cursor-pointer items-center gap-2 text-[11px] text-zinc-300">
                  <input
                    type="radio"
                    name="bg"
                    checked={format === "jpg" || bgMode === "custom"}
                    onChange={() => setBgMode("custom")}
                    className="accent-sky-500"
                  />
                  <input
                    type="color"
                    value={bgColor}
                    onChange={(e) => {
                      setBgColor(e.target.value);
                      setBgMode("custom");
                    }}
                    className="h-7 w-10 cursor-pointer rounded border border-white/10 bg-transparent"
                  />
                </label>
              </div>
              {format === "jpg" && (
                <p className="text-[10px] text-amber-500/90">JPG siempre usa un fondo sólido; el transparente pasa a blanco.</p>
              )}
            </div>
          )}

          {showPdfOptions && (
            <div className="space-y-2.5">
              <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">PDF</label>
              <p className="text-[10px] leading-snug text-zinc-500">
                El texto visible sigue siendo vectorial. Opcionalmente se añade una capa invisible para copiar en el lector.
              </p>
              <label className="flex cursor-pointer items-start gap-2 text-[11px] text-zinc-300">
                <input
                  type="checkbox"
                  checked={pdfSelectableText}
                  onChange={(e) => setPdfSelectableText(e.target.checked)}
                  className="accent-sky-500 mt-0.5"
                />
                <span>
                  Texto seleccionable
                  <span className="mt-0.5 block text-[10px] font-normal text-zinc-500">
                    Misma posición que en el lienzo; el dibujo visible sigue siendo el trazado.
                  </span>
                </span>
              </label>
              {designerPageCount > 0 && (
                <>
                  <label className="flex cursor-pointer items-start gap-2 text-[11px] text-zinc-300">
                    <input
                      type="checkbox"
                      checked={pdfMakeUrlsClickable}
                      onChange={(e) => setPdfMakeUrlsClickable(e.target.checked)}
                      className="accent-sky-500 mt-0.5"
                    />
                    <span>
                      URLs clicables
                      <span className="mt-0.5 block text-[10px] font-normal text-zinc-500">
                        Detecta <span className="font-mono text-zinc-400">https://…</span> en el texto.
                      </span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2 text-[11px] text-zinc-300">
                    <input
                      type="checkbox"
                      checked={pdfOutlineLinkRects}
                      onChange={(e) => setPdfOutlineLinkRects(e.target.checked)}
                      className="accent-sky-500 mt-0.5"
                    />
                    <span>
                      Recuadro en enlaces
                      <span className="mt-0.5 block text-[10px] font-normal text-zinc-500">
                        Borde fino alrededor del área de clic.
                      </span>
                    </span>
                  </label>
                </>
              )}
              <label className="flex cursor-pointer items-start gap-2 text-[11px] text-zinc-300">
                <input
                  type="checkbox"
                  checked={pdfOptimizeImages}
                  onChange={(e) => setPdfOptimizeImages(e.target.checked)}
                  className="accent-sky-500 mt-0.5"
                />
                <span>
                  Optimizar imágenes (JPEG ~72%)
                  <span className="mt-0.5 block text-[10px] font-normal text-zinc-500">
                    PDF más ligero; la transparencia se aplana sobre blanco.
                  </span>
                </span>
              </label>
            </div>
          )}

          {pageScopeVisible && (
            <div className="space-y-2">
              <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Páginas</label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setPageScope("current")}
                  className={`rounded-lg py-2 text-[11px] font-semibold transition-colors duration-150 ${
                    effectivePageScope === "current"
                      ? "bg-white/[0.12] text-white ring-1 ring-white/15"
                      : "bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08] hover:text-white"
                  }`}
                >
                  Página actual
                </button>
                <button
                  type="button"
                  onClick={() => setPageScope("all")}
                  className={`rounded-lg py-2 text-[11px] font-semibold transition-colors duration-150 ${
                    effectivePageScope === "all"
                      ? "bg-white/[0.12] text-white ring-1 ring-white/15"
                      : "bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08] hover:text-white"
                  }`}
                >
                  Todas ({designerPageCount})
                </button>
              </div>
              <p className="text-[10px] leading-snug text-zinc-500">
                {pageScopeHint({
                  format,
                  pageScope: effectivePageScope,
                  pageCount: designerPageCount,
                })}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Destino</label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setDestination("download")}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-[11px] font-semibold transition-colors duration-150 ${
                  destination === "download"
                    ? "bg-white/[0.12] text-white ring-1 ring-white/15"
                    : "bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08] hover:text-white"
                }`}
              >
                <Download size={12} strokeWidth={1.75} aria-hidden />
                Descargar
              </button>
              <button
                type="button"
                onClick={() => setDestination("foldder")}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-[11px] font-semibold transition-colors duration-150 ${
                  destination === "foldder"
                    ? "bg-white/[0.12] text-white ring-1 ring-white/15"
                    : "bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08] hover:text-white"
                }`}
              >
                <FolderDown size={12} strokeWidth={1.75} aria-hidden />
                Guardar en Foldder
              </button>
            </div>
            <p className="text-[10px] leading-snug text-zinc-500">
              {destination === "foldder"
                ? "El archivo queda en el nodo Foldder, en Exportados."
                : "Se descarga al disco de este dispositivo."}
            </p>
          </div>

          {exportScope === "full" && artboardList.length > 1 && !pageScopeVisible && (
            <div className="space-y-2">
              <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Artboards</label>
              <label className="flex cursor-pointer items-center gap-2 text-[11px] text-zinc-300">
                <input
                  type="checkbox"
                  checked={batchAllArtboards}
                  onChange={(e) => setBatchAllArtboards(e.target.checked)}
                  className="accent-sky-500"
                />
                Exportar todos los artboards (ZIP si hay más de uno)
              </label>
              {batchAllArtboards && (
                <ul className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-white/[0.06] bg-[#0b0d10] p-2">
                  {artboardList.map((a) => (
                    <li key={a.id} className="flex items-center gap-2 text-[11px] text-zinc-300">
                      <input
                        type="checkbox"
                        className="accent-sky-500"
                        checked={batchSelected[a.id] ?? true}
                        onChange={(e) => setBatchSelected((prev) => ({ ...prev, [a.id]: e.target.checked }))}
                      />
                      <span className="truncate">{a.name || a.id}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {hasSelection && exportScope === "selection" && (
            <div className="space-y-2">
              <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Selección múltiple</label>
              <label className="flex cursor-pointer items-center gap-2 text-[11px] text-zinc-300">
                <input type="checkbox" checked={merged} onChange={(e) => setMerged(e.target.checked)} className="accent-sky-500" />
                Un solo archivo combinado
              </label>
            </div>
          )}

          {bounds && showRasterScale && (
            <div className="rounded-lg border border-white/[0.06] bg-[#0b0d10] px-3 py-2 text-[11px] text-zinc-400">
              <span className="text-zinc-500">Tamaño · </span>
              <span className="font-mono text-zinc-200">
                {pixelSize.w} × {pixelSize.h} px
              </span>
              <span className="text-zinc-600">
                {" "}
                · {Math.round(bounds.w)} × {Math.round(bounds.h)}
              </span>
            </div>
          )}

          {saveToInspiration && (
            <button
              type="button"
              disabled={saveToInspiration.state === "busy"}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void Promise.resolve(saveToInspiration.onSave()).catch((err: unknown) => {
                  console.error("[Export] Guardar en Inspiración:", err);
                });
              }}
              className="flex items-center gap-1.5 text-[10px] text-zinc-500 transition-colors hover:text-zinc-300 disabled:opacity-45"
            >
              {saveToInspiration.state === "busy" ? (
                <Loader2 size={11} className="animate-spin" aria-hidden />
              ) : saveToInspiration.state === "done" ? (
                <Check size={11} aria-hidden />
              ) : (
                <BookmarkPlus size={11} aria-hidden />
              )}
              {saveToInspiration.state === "busy"
                ? "Guardando plantilla…"
                : saveToInspiration.state === "done"
                  ? "Guardada en Inspiración"
                  : saveToInspiration.state === "error"
                    ? "Reintentar plantilla"
                    : "Guardar como plantilla"}
            </button>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-white/[0.08] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg px-4 py-2 text-[12px] font-medium text-zinc-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run().catch((err: unknown) => console.error("[Export]", err))}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-[12px] font-semibold text-white shadow-lg shadow-sky-900/30 transition-colors duration-150 hover:bg-sky-500 disabled:pointer-events-none disabled:opacity-55"
          >
            {busy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : null}
            {busy ? (destination === "foldder" ? "Guardando…" : "Exportando…") : ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
