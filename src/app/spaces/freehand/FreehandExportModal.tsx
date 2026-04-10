"use client";

import React, { useMemo, useState, useEffect } from "react";
import { X } from "lucide-react";
import type { Rect } from "./freehand-export";

export type ExportFormat = "png" | "svg" | "jpg";
export type ExportScalePreset = 1 | 2 | 3;

export type ProfessionalExportOptions = {
  format: ExportFormat;
  scale: number;
  background: "transparent" | string;
  filename: string;
  merged: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Bounds in world/canvas units (before pixel scale). */
  bounds: Rect | null;
  defaultFilename: string;
  selectionLabel: string;
  hasSelection: boolean;
  onExport: (opts: ProfessionalExportOptions) => void | Promise<void>;
};

export function FreehandExportModal({
  open,
  onClose,
  bounds,
  defaultFilename,
  selectionLabel,
  hasSelection,
  onExport,
}: Props) {
  const [format, setFormat] = useState<ExportFormat>("png");
  const [scalePreset, setScalePreset] = useState<ExportScalePreset>(1);
  const [customScale, setCustomScale] = useState("1");
  const [useCustomScale, setUseCustomScale] = useState(false);
  const [bgMode, setBgMode] = useState<"transparent" | "custom">("transparent");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [filename, setFilename] = useState(defaultFilename);
  const [merged, setMerged] = useState(true);

  useEffect(() => {
    if (open) setFilename(defaultFilename.replace(/[^a-z0-9-_]/gi, "_").slice(0, 80));
  }, [open, defaultFilename]);

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

  const run = async () => {
    const base = filename.trim() || "export";
    const ext = format === "svg" ? "svg" : format === "jpg" ? "jpg" : "png";
    const safe = `${base.replace(/\.(png|svg|jpg|jpeg)$/i, "")}.${ext}`;
    await onExport({
      format,
      scale: effectiveScale,
      background: format === "jpg" ? bgMode === "transparent" ? "#ffffff" : bgColor : bgMode === "transparent" ? "transparent" : bgColor,
      filename: safe,
      merged,
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
          <div className="space-y-2">
            <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Format</label>
            <div className="grid grid-cols-3 gap-2">
              {(["png", "svg", "jpg"] as const).map((f) => (
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

          {hasSelection && (
            <div className="space-y-2">
              <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Multi-selection</label>
              <label className="flex cursor-pointer items-center gap-2 text-[11px] text-zinc-300">
                <input type="checkbox" checked={merged} onChange={(e) => setMerged(e.target.checked)} className="accent-sky-500" />
                Single merged asset (uncheck to export each object separately — PNG/SVG only)
              </label>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">File name</label>
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              className="h-8 w-full rounded-lg border border-white/[0.08] bg-[#0b0d10] px-3 text-[12px] text-white outline-none transition-colors duration-150 focus:border-sky-500/50"
            />
          </div>

          {bounds && (
            <div className="rounded-lg border border-white/[0.06] bg-[#0b0d10] px-3 py-2 text-[11px] text-zinc-400">
              <span className="text-zinc-500">Output size · </span>
              <span className="font-mono text-zinc-200">
                {pixelSize.w} × {pixelSize.h} px
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
