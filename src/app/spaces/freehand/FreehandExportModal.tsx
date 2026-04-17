"use client";

import React, { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { Rect } from "./freehand-export";
import type { VectorPdfExportOptions } from "./text-outline";

export type ExportFormat = "png" | "svg" | "jpg" | "pdf";
export type ExportScalePreset = 1 | 2 | 3;

export type ProfessionalExportOptions = {
  format: ExportFormat;
  scale: number;
  background: "transparent" | string;
  filename: string;
  merged: boolean;
  /** Si se define y tiene longitud > 0, exporta cada artboard indicado (vista completa). */
  batchArtboardIds?: string[] | null;
  /** Solo PDF: recomprime imágenes raster como JPEG (~72) para archivo más pequeño. */
  optimizeImages?: boolean;
  /**
   * Solo PDF: capa de texto invisible alineada con los trazados para copiar/pegar en el visor de PDF.
   * Por defecto true en el modal.
   */
  pdfSelectableText?: boolean;
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
  /** Designer: export full document as one multipage vector PDF (separate from single-frame export). */
  designerMultipageVectorPdf?: {
    pageCount: number;
    busy: boolean;
    onExport: (opts: VectorPdfExportOptions) => void | Promise<void>;
  } | null;
};

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

  if (!open) return null;

  const showDesignerDocumentPdf =
    designerMultipageVectorPdf != null && designerMultipageVectorPdf.pageCount > 0;

  const run = async () => {
    const base =
      (defaultFilename || "export").trim().replace(/[^a-z0-9-_]/gi, "_").slice(0, 80) || "export";
    const ext =
      format === "svg" ? "svg" : format === "jpg" ? "jpg" : format === "pdf" ? "pdf" : "png";
    const safe = `${base.replace(/\.(png|svg|jpg|jpeg|pdf)$/i, "")}.${ext}`;
    const batchIds =
      exportScope === "full" && batchAllArtboards && artboardList.length > 0
        ? artboardList.filter((a) => batchSelected[a.id]).map((a) => a.id)
        : null;
    await onExport({
      format,
      scale: effectiveScale,
      background: format === "jpg" ? bgMode === "transparent" ? "#ffffff" : bgColor : bgMode === "transparent" ? "transparent" : bgColor,
      filename: safe,
      merged,
      batchArtboardIds: batchIds && batchIds.length > 0 ? batchIds : undefined,
      optimizeImages: format === "pdf" ? pdfOptimizeImages : undefined,
      pdfSelectableText: format === "pdf" ? pdfSelectableText : undefined,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/70 backdrop-blur-sm transition-opacity duration-150"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-xl border border-white/[0.12] bg-[#12151a] shadow-2xl transition-transform duration-150 ease-out"
        style={{ fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
          <div>
            <h2 className="text-[13px] font-semibold tracking-tight text-white">Export</h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">{selectionLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
            aria-label="Close"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          {showDesignerDocumentPdf && designerMultipageVectorPdf && (
            <div className="space-y-3 rounded-xl border border-violet-500/25 bg-gradient-to-b from-violet-950/35 to-[#12151a] p-3.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-violet-200/95">
                  PDF del documento (Designer)
                </label>
                <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-400">
                  PDF vectorial multipágina: una hoja por página del documento. Con una sola página obtienes un PDF de una
                  hoja. Las mismas opciones se aplican si más abajo eliges PDF y pulsas Export (solo la vista actual).
                </p>
              </div>
              <label className="flex cursor-pointer items-start gap-2 text-[11px] text-zinc-200">
                <input
                  type="checkbox"
                  checked={pdfSelectableText}
                  onChange={(e) => setPdfSelectableText(e.target.checked)}
                  className="accent-violet-400 mt-0.5"
                />
                <span>
                  Texto seleccionable
                  <span className="mt-0.5 block text-[10px] font-normal text-zinc-500">
                    Capa alineada con los trazados para copiar en el visor; el dibujo visible sigue siendo vectorial.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 text-[11px] text-zinc-200">
                <input
                  type="checkbox"
                  checked={pdfMakeUrlsClickable}
                  onChange={(e) => setPdfMakeUrlsClickable(e.target.checked)}
                  className="accent-violet-400 mt-0.5"
                />
                <span>
                  URLs clickeables
                  <span className="mt-0.5 block text-[10px] font-normal text-zinc-500">
                    Detecta <span className="font-mono text-zinc-400">https://…</span> en el texto y los exporta como
                    enlaces.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 text-[11px] text-zinc-200">
                <input
                  type="checkbox"
                  checked={pdfOutlineLinkRects}
                  onChange={(e) => setPdfOutlineLinkRects(e.target.checked)}
                  className="accent-violet-400 mt-0.5"
                />
                <span>
                  Recuadro en enlaces
                  <span className="mt-0.5 block text-[10px] font-normal text-zinc-500">
                    Borde fino alrededor del área de clic (alineación y revisión).
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 text-[11px] text-zinc-200">
                <input
                  type="checkbox"
                  checked={pdfOptimizeImages}
                  onChange={(e) => setPdfOptimizeImages(e.target.checked)}
                  className="accent-violet-400 mt-0.5"
                />
                <span>
                  Optimizar imágenes (JPEG ~72%)
                  <span className="mt-0.5 block text-[10px] font-normal text-zinc-500">
                    PDF más ligero; la transparencia se aplana sobre blanco donde aplique.
                  </span>
                </span>
              </label>
              <button
                type="button"
                disabled={designerMultipageVectorPdf.busy}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void Promise.resolve(
                    designerMultipageVectorPdf.onExport({
                      makeUrlsClickable: pdfMakeUrlsClickable,
                      outlineLinkRects: pdfOutlineLinkRects,
                      optimizeImages: pdfOptimizeImages,
                      selectableText: pdfSelectableText,
                    }),
                  ).catch((err: unknown) => {
                    console.error("[Export] PDF multipágina Designer:", err);
                  });
                }}
                className="w-full rounded-lg border border-violet-400/35 bg-violet-600/30 px-3 py-2.5 text-[11px] font-semibold text-violet-50 shadow-lg shadow-violet-950/40 transition-colors duration-150 hover:bg-violet-500/35 disabled:pointer-events-none disabled:opacity-45"
              >
                {designerMultipageVectorPdf.busy
                  ? "Generando PDF…"
                  : `Descargar PDF del documento (${designerMultipageVectorPdf.pageCount})`}
              </button>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              {showDesignerDocumentPdf ? "Exportar esta vista" : "Format"}
            </label>
            {showDesignerDocumentPdf && (
              <p className="text-[10px] leading-snug text-zinc-500">
                Raster o vector de lo que ves en el lienzo (incluido PDF de una sola hoja). No sustituye al bloque de
                arriba.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(["png", "svg", "jpg", "pdf"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  className={`rounded-lg py-2 text-[11px] font-semibold uppercase tracking-wide transition-colors duration-150 ${
                    format === f ? "bg-sky-500/25 text-sky-300 ring-1 ring-sky-500/40" : "bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08] hover:text-white"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            {format === "pdf" && !showDesignerDocumentPdf && (
              <>
                <p className="text-[10px] leading-snug text-zinc-500">
                  El aspecto del texto sigue siendo vectorial (trazados); opcionalmente se añade una capa de texto
                  invisible alineada para poder seleccionar y copiar en el lector PDF.
                </p>
                <label className="mt-2 flex cursor-pointer items-start gap-2 text-[11px] text-zinc-300">
                  <input
                    type="checkbox"
                    checked={pdfSelectableText}
                    onChange={(e) => setPdfSelectableText(e.target.checked)}
                    className="accent-sky-500 mt-0.5"
                  />
                  <span>
                    Texto seleccionable en PDF
                    <span className="mt-0.5 block text-[10px] font-normal text-zinc-500">
                      Misma posición y saltos de línea que en el lienzo; el dibujo visible sigue siendo el trazado
                      vectorial.
                    </span>
                  </span>
                </label>
                <label className="mt-2 flex cursor-pointer items-start gap-2 text-[11px] text-zinc-300">
                  <input
                    type="checkbox"
                    checked={pdfOptimizeImages}
                    onChange={(e) => setPdfOptimizeImages(e.target.checked)}
                    className="accent-sky-500 mt-0.5"
                  />
                  <span>
                    Optimizar imágenes (JPEG ~72%)
                    <span className="mt-0.5 block text-[10px] font-normal text-zinc-500">
                      Reduce mucho el peso del PDF. La transparencia se aplana sobre blanco; los SVG incrustados como imagen no se convierten.
                    </span>
                  </span>
                </label>
              </>
            )}
            {format === "pdf" && showDesignerDocumentPdf && (
              <p className="text-[10px] leading-relaxed text-zinc-500">
                PDF de <span className="text-zinc-400">una sola hoja</span> con la página visible. Texto seleccionable e
                imágenes: mismas casillas que en «PDF del documento» arriba.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Scale</label>
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
                    !useCustomScale && scalePreset === s ? "bg-white/[0.12] text-white" : "bg-white/[0.04] text-zinc-400 hover:text-white"
                  }`}
                >
                  {s}×
                </button>
              ))}
              <label className="flex flex-1 items-center gap-2 rounded-lg bg-white/[0.04] px-2 py-1">
                <span className="text-[10px] text-zinc-500">Custom</span>
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

          <div className="space-y-2">
            <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Background</label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-[11px] text-zinc-300">
                <input
                  type="radio"
                  name="bg"
                  checked={bgMode === "transparent"}
                  onChange={() => setBgMode("transparent")}
                  className="accent-sky-500"
                />
                Transparent
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-[11px] text-zinc-300">
                <input
                  type="radio"
                  name="bg"
                  checked={bgMode === "custom"}
                  onChange={() => setBgMode("custom")}
                  className="accent-sky-500"
                />
                <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="h-7 w-10 cursor-pointer rounded border border-white/10 bg-transparent" />
              </label>
            </div>
            {format === "jpg" && (
              <p className="text-[10px] text-amber-500/90">JPG always uses a solid background; transparent becomes white.</p>
            )}
          </div>

          {exportScope === "full" && artboardList.length > 1 && (
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

          {hasSelection && (
            <div className="space-y-2">
              <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Multi-selection</label>
              <label className="flex cursor-pointer items-center gap-2 text-[11px] text-zinc-300">
                <input type="checkbox" checked={merged} onChange={(e) => setMerged(e.target.checked)} className="accent-sky-500" />
                Single merged asset (uncheck to export each object separately — PNG/SVG/PDF)
              </label>
            </div>
          )}

          {bounds && (
            <div className="rounded-lg border border-white/[0.06] bg-[#0b0d10] px-3 py-2 text-[11px] text-zinc-400">
              <span className="text-zinc-500">Output size · </span>
              <span className="font-mono text-zinc-200">
                {pixelSize.w} × {pixelSize.h} px{format === "pdf" ? " (vector)" : ""}
              </span>
              <span className="text-zinc-600"> · artboard {Math.round(bounds.w)} × {Math.round(bounds.h)}</span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-white/[0.08] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-[12px] font-medium text-zinc-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void run()}
            className="rounded-lg bg-sky-600 px-4 py-2 text-[12px] font-semibold text-white shadow-lg shadow-sky-900/30 transition-colors duration-150 hover:bg-sky-500"
          >
            Export
          </button>
        </div>
      </div>
    </div>
  );
}
