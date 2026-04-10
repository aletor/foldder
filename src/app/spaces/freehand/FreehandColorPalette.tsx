"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pipette } from "lucide-react";
import type { DocumentColorStat } from "./extract-document-colors";
import { normalizeHexColor } from "./extract-document-colors";

export const PALETTE_LS_KEY = "foldder-freehand-palette-saved-v1";

export function loadSavedPaletteFromStorage(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PALETTE_LS_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return [];
    return p
      .filter((x): x is string => typeof x === "string")
      .map((h) => normalizeHexColor(h))
      .filter((h): h is string => h != null);
  } catch {
    return [];
  }
}

export function persistSavedPalette(colors: string[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PALETTE_LS_KEY, JSON.stringify(colors));
  } catch {
    /* noop */
  }
}

type PickerSession =
  | null
  | { kind: "add" }
  | { kind: "inuse"; hex: string }
  | { kind: "saved"; index: number };

type CtxState =
  | null
  | {
      x: number;
      y: number;
      section: "inuse" | "saved";
      hex: string;
      savedIndex?: number;
    };

type Props = {
  inUse: DocumentColorStat[];
  savedColors: string[];
  onSavedColorsChange: (colors: string[]) => void;
  applyTarget: "fill" | "stroke";
  onApplyTargetChange: (t: "fill" | "stroke") => void;
  onApplyHex: (hex: string) => void;
  onReplaceDocumentColor: (fromHex: string, toHex: string) => void;
  onCommitHistory: () => void;
};

export function FreehandColorPalette({
  inUse,
  savedColors,
  onSavedColorsChange,
  applyTarget,
  onApplyTargetChange,
  onApplyHex,
  onReplaceDocumentColor,
  onCommitHistory,
}: Props) {
  const colorInputRef = useRef<HTMLInputElement>(null);
  const [pickerSession, setPickerSession] = useState<PickerSession>(null);
  const [ctx, setCtx] = useState<CtxState>(null);
  const longPressRef = useRef<number | null>(null);

  useEffect(() => {
    const close = () => setCtx(null);
    window.addEventListener("mousedown", close, true);
    return () => window.removeEventListener("mousedown", close, true);
  }, []);

  useEffect(() => {
    if (pickerSession?.kind === "add") {
      const t = window.setTimeout(() => colorInputRef.current?.click(), 0);
      return () => clearTimeout(t);
    }
  }, [pickerSession]);

  const openPicker = useCallback((session: PickerSession) => {
    setPickerSession(session);
  }, []);

  const pickerValue = (): string => {
    if (!pickerSession) return "#6366f1";
    if (pickerSession.kind === "add") return "#6366f1";
    if (pickerSession.kind === "inuse") return pickerSession.hex;
    return savedColors[pickerSession.index] ?? "#6366f1";
  };

  const handleColorInput = useCallback(
    (e: React.FormEvent<HTMLInputElement>) => {
      const raw = (e.target as HTMLInputElement).value;
      const v = normalizeHexColor(raw);
      if (!v || !pickerSession) return;
      if (pickerSession.kind === "add") return;
      if (pickerSession.kind === "inuse") {
        onReplaceDocumentColor(pickerSession.hex, v);
        setPickerSession({ kind: "inuse", hex: v });
        return;
      }
      const i = pickerSession.index;
      const next = [...savedColors];
      if (next[i] !== undefined) {
        next[i] = v;
        onSavedColorsChange(next);
      }
    },
    [pickerSession, onReplaceDocumentColor, onSavedColorsChange, savedColors],
  );

  const handleColorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = normalizeHexColor(e.target.value);
      if (!v || !pickerSession) return;
      if (pickerSession.kind === "add") {
        const next = [...savedColors];
        if (!next.includes(v)) next.push(v);
        onSavedColorsChange(next);
        setPickerSession(null);
        return;
      }
      setPickerSession(null);
      onCommitHistory();
    },
    [pickerSession, savedColors, onSavedColorsChange, onCommitHistory],
  );

  const copyHex = useCallback((hex: string) => {
    void navigator.clipboard.writeText(hex);
    setCtx(null);
  }, []);

  const pinFromInUse = useCallback(
    (hex: string) => {
      const n = normalizeHexColor(hex);
      if (!n) return;
      if (!savedColors.includes(n)) onSavedColorsChange([...savedColors, n]);
      setCtx(null);
    },
    [savedColors, onSavedColorsChange],
  );

  const deleteSaved = useCallback(
    (index: number) => {
      onSavedColorsChange(savedColors.filter((_, j) => j !== index));
      setCtx(null);
      onCommitHistory();
    },
    [savedColors, onSavedColorsChange, onCommitHistory],
  );

  const isSwatchActive = (kind: "inuse" | "saved", hex: string, savedIdx?: number) => {
    if (!pickerSession) return false;
    if (pickerSession.kind === "inuse" && kind === "inuse" && pickerSession.hex === hex) return true;
    if (pickerSession.kind === "saved" && kind === "saved" && pickerSession.index === savedIdx) return true;
    return false;
  };

  return (
    <div className="border-b border-white/[0.08] px-[14px] py-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
          <Pipette size={12} className="text-zinc-400" strokeWidth={2} />
          Paleta
        </div>
        <div className="flex rounded-md border border-white/[0.08] bg-white/[0.04] p-0.5 text-[9px] font-semibold">
          <button
            type="button"
            className={`rounded px-2 py-0.5 transition-colors ${applyTarget === "fill" ? "bg-violet-600/50 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
            onClick={() => onApplyTargetChange("fill")}
          >
            Relleno
          </button>
          <button
            type="button"
            className={`rounded px-2 py-0.5 transition-colors ${applyTarget === "stroke" ? "bg-violet-600/50 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
            onClick={() => onApplyTargetChange("stroke")}
          >
            Trazo
          </button>
        </div>
      </div>

      <input
        ref={colorInputRef}
        type="color"
        className="sr-only"
        value={pickerValue()}
        onInput={handleColorInput}
        onChange={handleColorChange}
      />

      <div>
        <div className="mb-1.5 text-[8px] font-bold uppercase tracking-wider text-zinc-600">En uso</div>
        <div className="flex flex-wrap gap-1.5">
          {inUse.length === 0 ? (
            <p className="text-[9px] text-zinc-600">Los colores del lienzo aparecen aquí.</p>
          ) : (
            inUse.map(({ hex, count }) => (
              <button
                key={hex}
                type="button"
                title={`${hex} · ${count}× — clic para aplicar`}
                className={`relative h-7 w-7 shrink-0 rounded-md border-2 shadow-sm transition-all ${
                  isSwatchActive("inuse", hex)
                    ? "border-sky-400 ring-2 ring-sky-500/40 scale-105"
                    : "border-white/15 hover:border-white/30"
                }`}
                style={{ backgroundColor: hex }}
                onClick={() => onApplyHex(hex)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setCtx({ x: e.clientX, y: e.clientY, section: "inuse", hex });
                }}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  longPressRef.current = window.setTimeout(() => {
                    setCtx({ x: e.clientX, y: e.clientY, section: "inuse", hex });
                  }, 550);
                }}
                onPointerUp={() => {
                  if (longPressRef.current) {
                    clearTimeout(longPressRef.current);
                    longPressRef.current = null;
                  }
                }}
                onPointerLeave={() => {
                  if (longPressRef.current) {
                    clearTimeout(longPressRef.current);
                    longPressRef.current = null;
                  }
                }}
              />
            ))
          )}
        </div>
      </div>

      <div className="h-px bg-white/[0.08]" />

      <div>
        <div className="mb-1.5 text-[8px] font-bold uppercase tracking-wider text-zinc-600">Guardados</div>
        <div className="flex flex-wrap items-center gap-1.5">
          {savedColors.map((hex, idx) => (
            <button
              key={`${hex}-${idx}`}
              type="button"
              title={`${hex} — clic para aplicar`}
              className={`relative h-7 w-7 shrink-0 rounded-md border-2 shadow-sm transition-all ${
                isSwatchActive("saved", hex, idx)
                  ? "border-sky-400 ring-2 ring-sky-500/40 scale-105"
                  : "border-white/15 hover:border-white/30"
              }`}
              style={{ backgroundColor: hex }}
              onClick={() => onApplyHex(hex)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCtx({ x: e.clientX, y: e.clientY, section: "saved", hex, savedIndex: idx });
              }}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                longPressRef.current = window.setTimeout(() => {
                  setCtx({ x: e.clientX, y: e.clientY, section: "saved", hex, savedIndex: idx });
                }, 550);
              }}
              onPointerUp={() => {
                if (longPressRef.current) {
                  clearTimeout(longPressRef.current);
                  longPressRef.current = null;
                }
              }}
              onPointerLeave={() => {
                if (longPressRef.current) {
                  clearTimeout(longPressRef.current);
                  longPressRef.current = null;
                }
              }}
            />
          ))}
          <button
            type="button"
            title="Añadir color a guardados"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-dashed border-white/20 bg-white/[0.03] text-zinc-500 hover:border-violet-400/50 hover:bg-white/[0.06] hover:text-white"
            onClick={() => openPicker({ kind: "add" })}
          >
            <span className="text-lg font-light leading-none">+</span>
          </button>
        </div>
      </div>

      {ctx && (
        <div
          className="fixed z-[100020] min-w-[11rem] rounded-lg border border-white/[0.12] bg-[#1a1f28] py-1 text-[11px] shadow-xl"
          style={{ left: ctx.x, top: ctx.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {ctx.section === "inuse" && (
            <>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-zinc-200 hover:bg-white/10"
                onClick={() => copyHex(ctx.hex)}
              >
                Copiar hex
              </button>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-zinc-200 hover:bg-white/10"
                onClick={() => pinFromInUse(ctx.hex)}
              >
                Guardar en paleta
              </button>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-zinc-200 hover:bg-white/10"
                onClick={() => {
                  openPicker({ kind: "inuse", hex: ctx.hex });
                  setCtx(null);
                }}
              >
                Editar color…
              </button>
            </>
          )}
          {ctx.section === "saved" && ctx.savedIndex !== undefined && (
            <>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-zinc-200 hover:bg-white/10"
                onClick={() => copyHex(ctx.hex)}
              >
                Copiar hex
              </button>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-zinc-200 hover:bg-white/10"
                onClick={() => {
                  openPicker({ kind: "saved", index: ctx.savedIndex! });
                  setCtx(null);
                }}
              >
                Editar color…
              </button>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-rose-300 hover:bg-rose-500/15"
                onClick={() => deleteSaved(ctx.savedIndex!)}
              >
                Eliminar
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
