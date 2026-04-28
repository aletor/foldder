"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pipette } from "lucide-react";
import type { DocumentColorStat } from "./extract-document-colors";
import { normalizeHexColor } from "./extract-document-colors";
import { setColorDragData } from "./color-drag";

export const PALETTE_LS_KEY = "foldder-freehand-palette-saved-v1";

/** Tamaño visual de cada muestra (mitad del antiguo 28px → 14px). */
const SW = "h-[14px] w-[14px] min-h-[14px] min-w-[14px] rounded-[3px]";
const SW_BTN = `${SW} shrink-0 border shadow-sm transition-colors`;
const SW_BORDER_IDLE = "border-white/20 hover:border-white/40";

/** Clase de botón-muestra alineada con la paleta principal (relleno en barra izquierda, etc.). */
export const PALETTE_SWATCH_BTN_CLASS = `${SW_BTN} ${SW_BORDER_IDLE} cursor-grab active:cursor-grabbing`;

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
      .filter((h): h is string => h != null)
      .filter((h) => {
        const x = h.toLowerCase();
        return x !== "#000000" && x !== "#ffffff";
      });
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

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const n = normalizeHexColor(hex);
  if (!n) return null;
  const x = parseInt(n.slice(1), 16);
  return { r: (x >> 16) & 255, g: (x >> 8) & 255, b: x & 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  const t = (x: number) => clamp(Math.round(x), 0, 255).toString(16).padStart(2, "0");
  return `#${t(r)}${t(g)}${t(b)}`;
}

/** HSL (H 0–360, S/L 0–100) → hex. */
function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 100) / 100;
  l = clamp(l, 0, 100) / 100;
  if (s === 0) {
    const v = Math.round(l * 255);
    return rgbToHex(v, v, v);
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = h / 360;
  const r = hue2rgb(p, q, hk + 1 / 3);
  const g = hue2rgb(p, q, hk);
  const b = hue2rgb(p, q, hk - 1 / 3);
  return rgbToHex(r * 255, g * 255, b * 255);
}

const TEMPLATE_HUES = [358, 28, 48, 142, 210, 268] as const;

const COLOR_TEMPLATES: { id: string; label: string; hexes: string[] }[] = [
  {
    id: "sat",
    label: "Saturados",
    hexes: TEMPLATE_HUES.map((hue) => hslToHex(hue, 88, 52)),
  },
  {
    id: "desat",
    label: "Desaturados",
    hexes: TEMPLATE_HUES.map((hue) => hslToHex(hue, 22, 58)),
  },
  {
    id: "dark",
    label: "Oscuros",
    hexes: TEMPLATE_HUES.map((hue) => hslToHex(hue, 68, 28)),
  },
  {
    id: "light",
    label: "Claros",
    hexes: TEMPLATE_HUES.map((hue) => hslToHex(hue, 42, 86)),
  },
];

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const rgb = hexToRgb(hex);
  if (!rgb) return { h: 0, s: 0, v: 0 };
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max < 1e-9 ? 0 : d / max;
  const v = max;
  if (d > 1e-6) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s, v };
}

function hsvToHex(h: number, s: number, v: number): string {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 1);
  v = clamp(v, 0, 1);
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rp = 0,
    gp = 0,
    bp = 0;
  if (h < 60) [rp, gp, bp] = [c, x, 0];
  else if (h < 120) [rp, gp, bp] = [x, c, 0];
  else if (h < 180) [rp, gp, bp] = [0, c, x];
  else if (h < 240) [rp, gp, bp] = [0, x, c];
  else if (h < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  return rgbToHex((rp + m) * 255, (gp + m) * 255, (bp + m) * 255);
}

type ColorModalKind = "add" | { kind: "inuse"; hex: string } | { kind: "saved"; index: number };

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
  brainColors?: string[];
  savedColors: string[];
  onSavedColorsChange: (colors: string[]) => void;
  onApplyHex: (hex: string) => void;
  onReplaceDocumentColor: (fromHex: string, toHex: string) => void;
  onCommitHistory: () => void;
  embedded?: boolean;
};

const FIXED_BLACK = "#000000";
const FIXED_WHITE = "#ffffff";

export function filterSavedPaletteExtras(saved: string[]): string[] {
  return saved.filter((h) => {
    const n = normalizeHexColor(h)?.toLowerCase();
    return n && n !== FIXED_BLACK && n !== FIXED_WHITE;
  });
}

type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };

function hasEyeDropperApi(): boolean {
  return typeof window !== "undefined" && typeof (window as Window & { EyeDropper?: EyeDropperCtor }).EyeDropper === "function";
}

export function ColorPickerModal({
  open,
  title,
  confirmLabel,
  initialHex,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  confirmLabel: string;
  initialHex: string;
  onClose: () => void;
  onConfirm: (hex: string) => void;
}) {
  const [h, setH] = useState(0);
  const [s, setS] = useState(1);
  const [v, setV] = useState(1);
  const [hexDraft, setHexDraft] = useState("#000000");
  const [panelPos, setPanelPos] = useState<{ left: number; top: number } | null>(null);
  const [eyeBusy, setEyeBusy] = useState(false);
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef(0);
  const panelDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origLeft: number;
    origTop: number;
  } | null>(null);

  useEffect(() => {
    hueRef.current = h;
  }, [h]);

  useEffect(() => {
    if (!open) return;
    const { h: hh, s: ss, v: vv } = hexToHsv(initialHex);
    setH(hh);
    setS(ss);
    setV(vv);
    const n = normalizeHexColor(initialHex) ?? "#000000";
    setHexDraft(n);
  }, [open, initialHex]);

  const applyHsvToDraft = useCallback((nh: number, ns: number, nv: number) => {
    setH(nh);
    setS(ns);
    setV(nv);
    setHexDraft(hsvToHex(nh, ns, nv));
  }, []);

  const readSvFromEvent = useCallback(
    (clientX: number, clientY: number, hue: number) => {
      const el = svRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = clamp((clientX - r.left) / Math.max(r.width, 1), 0, 1);
      const y = clamp((clientY - r.top) / Math.max(r.height, 1), 0, 1);
      applyHsvToDraft(hue, x, 1 - y);
    },
    [applyHsvToDraft],
  );

  const onHexBlur = useCallback(() => {
    const n = normalizeHexColor(hexDraft.trim());
    if (!n) {
      setHexDraft(hsvToHex(h, s, v));
      return;
    }
    const { h: hh, s: ss, v: vv } = hexToHsv(n);
    setH(hh);
    setS(ss);
    setV(vv);
    setHexDraft(n);
  }, [hexDraft, h, s, v]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useLayoutEffect(() => {
    if (!open) {
      setPanelPos(null);
      panelDragRef.current = null;
      return;
    }
    const estimateW = 320;
    const estimateH = 440;
    setPanelPos({
      left: Math.round(Math.max(8, (window.innerWidth - estimateW) / 2)),
      top: Math.round(Math.max(8, (window.innerHeight - estimateH) / 2)),
    });
  }, [open]);

  const clampPanelPos = useCallback((left: number, top: number) => {
    const margin = 8;
    const panelW = Math.min(320, window.innerWidth - margin * 2);
    const maxL = Math.max(margin, window.innerWidth - panelW - margin);
    const maxT = Math.max(margin, window.innerHeight - 48);
    return {
      left: clamp(left, margin, maxL),
      top: clamp(top, margin, maxT),
    };
  }, []);

  const onPanelHeaderPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 || panelPos == null) return;
      if ((e.target as HTMLElement).closest("button")) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      panelDragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        origLeft: panelPos.left,
        origTop: panelPos.top,
      };
    },
    [panelPos],
  );

  const onPanelHeaderPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = panelDragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      setPanelPos(clampPanelPos(d.origLeft + dx, d.origTop + dy));
    },
    [clampPanelPos],
  );

  const onPanelHeaderPointerUp = useCallback((e: React.PointerEvent) => {
    const d = panelDragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    panelDragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  }, []);

  const runEyeDropper = useCallback(async (opts?: { applyDirect?: boolean }) => {
    if (!hasEyeDropperApi()) return;
    setEyeBusy(true);
    try {
      const Ctor = (window as unknown as Window & { EyeDropper: EyeDropperCtor }).EyeDropper;
      const ed = new Ctor();
      const r = await ed.open();
      const n = normalizeHexColor(r.sRGBHex) ?? r.sRGBHex;
      const { h: hh, s: ss, v: vv } = hexToHsv(n);
      setH(hh);
      setS(ss);
      setV(vv);
      setHexDraft(n);
      if (opts?.applyDirect) {
        onConfirm(n);
        onClose();
      }
    } catch {
      /* usuario canceló o error */
    } finally {
      setEyeBusy(false);
    }
  }, [onClose, onConfirm]);

  const handleConfirm = useCallback(() => {
    const n = normalizeHexColor(hexDraft) ?? hsvToHex(h, s, v);
    onConfirm(n);
    onClose();
  }, [hexDraft, h, s, v, onConfirm, onClose]);

  if (!open || typeof document === "undefined" || panelPos == null) return null;

  const pureHue = hsvToHex(h, 1, 1);
  const eyeSupported = hasEyeDropperApi();

  return createPortal(
    <>
      {/* Sin oscurecer el lienzo: el cuenta gotas debe muestrear el color real bajo el cursor. */}
      <div
        className="fixed inset-0 z-[100025] bg-transparent"
        role="presentation"
        data-fh-color-picker-modal
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      />
      <div
        data-fh-color-picker-modal
        className="fixed z-[100026] w-[min(320px,calc(100vw-16px))] rounded-xl border border-white/[0.12] bg-[#151820] p-4 shadow-2xl"
        style={{ left: panelPos.left, top: panelPos.top }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fh-color-modal-title"
        onMouseLeave={() => {
          if (!eyeSupported || eyeBusy) return;
          void runEyeDropper({ applyDirect: true });
        }}
      >
        <div
          className="mb-3 flex cursor-grab select-none items-center gap-2 border-b border-white/[0.06] pb-2.5 active:cursor-grabbing"
          onPointerDown={onPanelHeaderPointerDown}
          onPointerMove={onPanelHeaderPointerMove}
          onPointerUp={onPanelHeaderPointerUp}
          onPointerCancel={onPanelHeaderPointerUp}
        >
          <h2 id="fh-color-modal-title" className="min-w-0 flex-1 text-[11px] font-bold uppercase tracking-widest text-zinc-400">
            {title}
          </h2>
          <button
            type="button"
            className="shrink-0 cursor-pointer rounded-md border border-white/10 bg-white/[0.06] p-1.5 text-zinc-300 hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!eyeSupported || eyeBusy}
            title={
              eyeSupported
                ? "Cuentagotas (muestrear color en pantalla)"
                : "Cuentagotas no disponible en este navegador (usa Chrome, Edge u Opera)"
            }
            aria-label="Cuentagotas"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => void runEyeDropper()}
          >
            <Pipette size={15} strokeWidth={2} className="pointer-events-none" />
          </button>
        </div>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            handleConfirm();
          }}
        >
          <div className="flex gap-3">
            <div
              ref={svRef}
              className="relative h-[140px] w-[140px] shrink-0 cursor-crosshair overflow-hidden rounded-md border border-white/15 select-none touch-none"
              onPointerDown={(e) => {
                e.preventDefault();
                const el = e.currentTarget as HTMLDivElement;
                el.setPointerCapture(e.pointerId);
                readSvFromEvent(e.clientX, e.clientY, hueRef.current);
                const move = (ev: PointerEvent) => {
                  readSvFromEvent(ev.clientX, ev.clientY, hueRef.current);
                };
                const up = (ev: PointerEvent) => {
                  window.removeEventListener("pointermove", move);
                  window.removeEventListener("pointerup", up);
                  window.removeEventListener("pointercancel", up);
                  try {
                    el.releasePointerCapture(ev.pointerId);
                  } catch {
                    /* noop */
                  }
                };
                window.addEventListener("pointermove", move);
                window.addEventListener("pointerup", up);
                window.addEventListener("pointercancel", up);
              }}
            >
              <div className="absolute inset-0" style={{ backgroundColor: pureHue }} />
              <div className="absolute inset-0 bg-gradient-to-r from-white to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black" />
              <div
                className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md"
                style={{
                  left: `${s * 100}%`,
                  top: `${(1 - v) * 100}%`,
                }}
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div
                className="h-3 w-full rounded-full border border-white/15"
                style={{
                  background:
                    "linear-gradient(to right,#f00 0%,#ff0 17%,#0f0 33%,#0ff 50%,#00f 67%,#f0f 83%,#f00 100%)",
                }}
              />
              <input
                type="range"
                min={0}
                max={360}
                step={0.25}
                value={h}
                onChange={(e) => applyHsvToDraft(Number(e.target.value), s, v)}
                className="w-full accent-violet-500"
                aria-label="Matiz"
              />
              <div
                draggable
                title="Color actual — arrastra a relleno, trazo o muestras"
                className="mt-1 h-10 w-full shrink-0 cursor-grab rounded-md border border-white/15 active:cursor-grabbing"
                style={{ backgroundColor: hsvToHex(h, s, v) }}
                onDragStart={(e) => {
                  const n = normalizeHexColor(hexDraft) ?? hsvToHex(h, s, v);
                  setColorDragData(e, n);
                }}
              />
              <label className="block text-[9px] font-medium uppercase tracking-wider text-zinc-500">Hex</label>
              <input
                type="text"
                value={hexDraft}
                onChange={(e) => setHexDraft(e.target.value)}
                onBlur={onHexBlur}
                spellCheck={false}
                className="w-full rounded-md border border-white/[0.1] bg-white/[0.06] px-2 py-1.5 font-mono text-[12px] text-zinc-100 outline-none focus:border-violet-500/50"
                placeholder="#000000"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-zinc-300 hover:bg-white/[0.08]"
              onClick={onClose}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-md border border-violet-500/40 bg-violet-600/70 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-violet-600"
            >
              {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </>,
    document.body,
  );
}

export function FreehandColorPalette({
  inUse,
  brainColors = [],
  savedColors,
  onSavedColorsChange,
  onApplyHex,
  onReplaceDocumentColor,
  onCommitHistory,
  embedded = false,
}: Props) {
  const [colorModal, setColorModal] = useState<null | ColorModalKind>(null);
  const [ctx, setCtx] = useState<CtxState>(null);
  const longPressRef = useRef<number | null>(null);

  useEffect(() => {
    const close = () => setCtx(null);
    window.addEventListener("mousedown", close, true);
    return () => window.removeEventListener("mousedown", close, true);
  }, []);

  const modalInitialHex = useCallback((): string => {
    if (!colorModal) return "#6366f1";
    if (colorModal === "add") return "#6366f1";
    if (colorModal.kind === "inuse") return colorModal.hex;
    return savedColors[colorModal.index] ?? "#6366f1";
  }, [colorModal, savedColors]);

  const modalTitle = !colorModal
    ? ""
    : colorModal === "add"
      ? "Añadir color"
      : colorModal.kind === "inuse"
        ? "Sustituir color en el documento"
        : "Editar color guardado";

  const modalConfirm =
    !colorModal || colorModal === "add"
      ? "Añadir a guardados"
      : colorModal.kind === "inuse"
        ? "Sustituir en documento"
        : "Guardar";

  const handleModalConfirm = useCallback(
    (hex: string) => {
      const v = normalizeHexColor(hex);
      if (!v || !colorModal) return;
      if (colorModal === "add") {
        const extras = filterSavedPaletteExtras(savedColors);
        const next = [...extras];
        if (!next.includes(v)) next.push(v);
        onSavedColorsChange(next);
        onCommitHistory();
        return;
      }
      if (colorModal.kind === "inuse") {
        onReplaceDocumentColor(colorModal.hex, v);
        onCommitHistory();
        return;
      }
      const i = colorModal.index;
      const next = [...savedColors];
      if (next[i] !== undefined) {
        next[i] = v;
        onSavedColorsChange(next);
        onCommitHistory();
      }
    },
    [colorModal, savedColors, onSavedColorsChange, onReplaceDocumentColor, onCommitHistory],
  );

  const copyHex = useCallback((hex: string) => {
    void navigator.clipboard.writeText(hex);
    setCtx(null);
  }, []);

  const onSwatchDragStart = useCallback((e: React.DragEvent, hex: string) => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
    setCtx(null);
    setColorDragData(e, hex);
  }, []);

  const pinFromInUse = useCallback(
    (hex: string) => {
      const n = normalizeHexColor(hex);
      if (!n) return;
      const extras = filterSavedPaletteExtras(savedColors);
      if (!extras.includes(n)) onSavedColorsChange([...extras, n]);
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

  return (
    <div
      className={
        embedded ? "space-y-2.5 px-[14px] pb-3 pt-1" : "space-y-2.5 border-b border-white/[0.08] px-[14px] py-3"
      }
    >
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
        <Pipette size={12} className="text-zinc-400" strokeWidth={2} />
        Paleta
      </div>

      <ColorPickerModal
        open={colorModal != null}
        title={modalTitle}
        confirmLabel={modalConfirm}
        initialHex={modalInitialHex()}
        onClose={() => setColorModal(null)}
        onConfirm={handleModalConfirm}
      />

      <div>
        <div className="mb-1 text-[8px] font-bold uppercase tracking-wider text-zinc-600">Brain</div>
        <div className="flex flex-wrap gap-1">
          {brainColors.length === 0 ? (
            <p className="text-[9px] text-zinc-600">Sin colores de Brain conectados.</p>
          ) : (
            brainColors.map((hex) => (
              <button
                key={`brain-${hex}`}
                type="button"
                draggable
                title={`${hex} — clic o arrastrar al relleno/trazo`}
                className={`${SW_BTN} ${SW_BORDER_IDLE}`}
                style={{ backgroundColor: hex }}
                onDragStart={(e) => onSwatchDragStart(e, hex)}
                onClick={() => onApplyHex(hex)}
              />
            ))
          )}
        </div>
      </div>

      <div className="h-px bg-white/[0.08]" />

      <div>
        <div className="mb-1 text-[8px] font-bold uppercase tracking-wider text-zinc-600">En uso</div>
        <div className="flex flex-wrap gap-1">
          {inUse.length === 0 ? null : (
            inUse.map(({ hex, count }) => (
              <button
                key={hex}
                type="button"
                draggable
                title={`${hex} · ${count}× — clic o arrastrar al relleno/trazo`}
                className={`${SW_BTN} ${SW_BORDER_IDLE}`}
                style={{ backgroundColor: hex }}
                onDragStart={(e) => onSwatchDragStart(e, hex)}
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
        <div className="mb-1 text-[8px] font-bold uppercase tracking-wider text-zinc-600">Guardados</div>
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            draggable
            title="Negro — clic o arrastrar"
            className={`${SW_BTN} ${SW_BORDER_IDLE}`}
            style={{ backgroundColor: FIXED_BLACK }}
            onDragStart={(e) => onSwatchDragStart(e, FIXED_BLACK)}
            onClick={() => onApplyHex(FIXED_BLACK)}
          />
          <button
            type="button"
            draggable
            title="Blanco — clic o arrastrar"
            className={`${SW_BTN} ${SW_BORDER_IDLE}`}
            style={{ backgroundColor: FIXED_WHITE, boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.12)" }}
            onDragStart={(e) => onSwatchDragStart(e, FIXED_WHITE)}
            onClick={() => onApplyHex(FIXED_WHITE)}
          />
          {savedColors.map((hex, realIndex) => {
            const n = normalizeHexColor(hex)?.toLowerCase();
            if (n === FIXED_BLACK || n === FIXED_WHITE) return null;
            return (
              <button
                key={`${hex}-${realIndex}`}
                type="button"
                draggable
                title={`${hex} — clic o arrastrar`}
                className={`${SW_BTN} ${SW_BORDER_IDLE}`}
                style={{ backgroundColor: hex }}
                onDragStart={(e) => onSwatchDragStart(e, hex)}
                onClick={() => onApplyHex(hex)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setCtx({ x: e.clientX, y: e.clientY, section: "saved", hex, savedIndex: realIndex });
                }}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  longPressRef.current = window.setTimeout(() => {
                    setCtx({ x: e.clientX, y: e.clientY, section: "saved", hex, savedIndex: realIndex });
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
            );
          })}
          <button
            type="button"
            title="Añadir color (selector)"
            className={`flex ${SW} shrink-0 items-center justify-center rounded-[3px] border border-dashed border-white/25 bg-white/[0.03] text-[11px] font-light text-zinc-500 hover:border-violet-400/50 hover:bg-white/[0.06] hover:text-white`}
            onClick={() => setColorModal("add")}
          >
            +
          </button>
        </div>
      </div>

      <div className="h-px bg-white/[0.08]" />

      <div>
        <div className="mb-1 text-[8px] font-bold uppercase tracking-wider text-zinc-600">Plantillas</div>
        <div className="space-y-1.5">
          {COLOR_TEMPLATES.map((row) => (
            <div key={row.id} className="flex flex-col gap-0.5">
              <span className="text-[8px] font-medium uppercase tracking-wider text-zinc-500">{row.label}</span>
              <div className="flex flex-wrap gap-1">
                {row.hexes.map((hex) => (
                  <button
                    key={`${row.id}-${hex}`}
                    type="button"
                    draggable
                    title={`${hex} — clic o arrastrar`}
                    className={`${SW_BTN} ${SW_BORDER_IDLE}`}
                    style={{ backgroundColor: hex }}
                    onDragStart={(e) => onSwatchDragStart(e, hex)}
                    onClick={() => onApplyHex(hex)}
                  />
                ))}
              </div>
            </div>
          ))}
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
                  setColorModal({ kind: "inuse", hex: ctx.hex });
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
                  setColorModal({ kind: "saved", index: ctx.savedIndex! });
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
