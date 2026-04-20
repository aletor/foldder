"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { NewDocumentConfig } from "./new-document-model";

export interface NewDocumentPanelProps {
  onConfirm: (config: NewDocumentConfig) => void;
  onCancel: () => void;
  /** `create`: asistente al abrir el nodo; `resize`: cambiar tamaño/fondo del lienzo (botón Aplicar). */
  mode?: "create" | "resize";
  /** Valores iniciales (modo resize: tomar del lienzo actual). */
  initialWidth?: number;
  initialHeight?: number;
  initialBackground?: NewDocumentConfig["background"];
  /** Modo resize: actualiza el lienzo detrás del modal al cambiar medidas o fondo (vista previa). */
  onCanvasPreviewChange?: (partial: {
    width: number;
    height: number;
    background: NewDocumentConfig["background"];
  }) => void;
}

export type PhotoRoomNewDocumentPanelProps = NewDocumentPanelProps;

type TabId = "web" | "art";

type PresetIconKind =
  | "monitor"
  | "square"
  | "portrait"
  | "vertical"
  | "image"
  | "panoramic"
  | "landscape";

type PresetDef = {
  id: string;
  icon: PresetIconKind;
  category: string;
  title: string;
  width: number;
  height: number;
};

const PRESETS_WEB: readonly PresetDef[] = [
  { id: "web-small", icon: "monitor", category: "Monitor", title: "Web Small", width: 1024, height: 768 },
  { id: "web-common", icon: "monitor", category: "Monitor", title: "Web Common", width: 1366, height: 768 },
  { id: "web-large", icon: "monitor", category: "Monitor", title: "Web Large", width: 1920, height: 1080 },
  { id: "ig-post", icon: "square", category: "Cuadrado", title: "Instagram Post", width: 1080, height: 1080 },
  { id: "ig-portrait", icon: "portrait", category: "Retrato", title: "Instagram Portrait", width: 1080, height: 1350 },
  { id: "ig-reel", icon: "vertical", category: "Vertical", title: "Instagram Reel", width: 1080, height: 1920 },
  { id: "tiktok", icon: "vertical", category: "Vertical", title: "TikTok", width: 1080, height: 1920 },
  { id: "yt-thumb", icon: "image", category: "Imagen", title: "YouTube Thumbnail", width: 1280, height: 720 },
  { id: "yt-banner", icon: "panoramic", category: "Panorámico", title: "YouTube Banner", width: 2560, height: 1440 },
  { id: "twitter", icon: "landscape", category: "Paisaje", title: "Twitter/X Post", width: 1600, height: 900 },
  { id: "fb-post", icon: "landscape", category: "Paisaje", title: "Facebook Post", width: 1200, height: 630 },
  { id: "fb-cover", icon: "panoramic", category: "Panorámico", title: "Facebook Cover", width: 1640, height: 624 },
] as const;

const PRESETS_ART: readonly PresetDef[] = [
  { id: "a4-v", icon: "portrait", category: "Retrato", title: "A4 Vertical", width: 2480, height: 3508 },
  { id: "a4-h", icon: "landscape", category: "Paisaje", title: "A4 Horizontal", width: 3508, height: 2480 },
  { id: "a3-v", icon: "portrait", category: "Retrato", title: "A3 Vertical", width: 3508, height: 4961 },
  { id: "a3-h", icon: "landscape", category: "Paisaje", title: "A3 Horizontal", width: 4961, height: 3508 },
] as const;

function findPresetIdForSize(w: number, h: number): string | null {
  for (const p of PRESETS_WEB) {
    if (p.width === w && p.height === h) return p.id;
  }
  for (const p of PRESETS_ART) {
    if (p.width === w && p.height === h) return p.id;
  }
  return null;
}

function tabForPresetId(id: string | null): TabId {
  if (!id) return "web";
  return PRESETS_ART.some((p) => p.id === id) ? "art" : "web";
}

function IconWebTab({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path d="M8 20h8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M12 16v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconArtTab({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="5" width="16" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M8 14.5 10.5 12l2.5 2.5L17 10"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="9" r="1.25" fill="currentColor" />
    </svg>
  );
}

function PresetShapeIcon({ kind }: { kind: PresetIconKind }) {
  const common = "text-zinc-400 group-hover:text-zinc-200 group-data-[active=true]:text-sky-400";
  switch (kind) {
    case "monitor":
      return (
        <svg className={common} width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 20 17.5H4A1.5 1.5 0 0 1 2.5 16v-9A1.5 1.5 0 0 1 4 5.5Z"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path d="M9 20.5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M12 17.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "square":
      return (
        <svg className={common} width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="5" y="5" width="14" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case "portrait":
      return (
        <svg className={common} width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="7" y="4" width="10" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case "vertical":
      return (
        <svg className={common} width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="8" y="3" width="8" height="18" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case "image":
      return (
        <svg className={common} width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="4" y="6" width="16" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="9" cy="10.5" r="1.5" fill="currentColor" />
          <path d="M4 16.5 8.5 12l3.5 3L17 10l3 3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "panoramic":
      return (
        <svg className={common} width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="3" y="8" width="18" height="8" rx="1.25" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case "landscape":
      return (
        <svg className={common} width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="4" y="7" width="16" height="10" rx="1.25" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    default: {
      const _n: never = kind;
      return _n;
    }
  }
}

function CheckerboardBg({ className }: { className?: string }) {
  return (
    <span
      className={`inline-block rounded border border-white/20 ${className ?? ""}`}
      style={{
        backgroundImage:
          "linear-gradient(45deg, #404040 25%, transparent 25%), linear-gradient(-45deg, #404040 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #404040 75%), linear-gradient(-45deg, transparent 75%, #404040 75%)",
        backgroundSize: "8px 8px",
        backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px",
        backgroundColor: "#2a2a2a",
      }}
      aria-hidden
    />
  );
}

export function PhotoRoomNewDocumentPanel({
  onConfirm,
  onCancel,
  mode = "create",
  initialWidth,
  initialHeight,
  initialBackground,
  onCanvasPreviewChange,
}: PhotoRoomNewDocumentPanelProps) {
  const isResize = mode === "resize";
  const initW = initialWidth ?? 1920;
  const initH = initialHeight ?? 1080;
  const initBg = initialBackground ?? "white";
  const initPreset = isResize ? findPresetIdForSize(initW, initH) : "web-large";

  const [tab, setTab] = useState<TabId>(() => (isResize ? tabForPresetId(initPreset) : "web"));
  const [widthStr, setWidthStr] = useState(() => String(isResize ? initW : 1920));
  const [heightStr, setHeightStr] = useState(() => String(isResize ? initH : 1080));
  const [background, setBackground] = useState<NewDocumentConfig["background"]>(() =>
    isResize ? initBg : "white",
  );
  const [activePresetId, setActivePresetId] = useState<string | null>(() =>
    isResize ? initPreset : "web-large",
  );

  const widthNum = useMemo(() => {
    const n = Number.parseInt(widthStr, 10);
    return Number.isFinite(n) ? n : 0;
  }, [widthStr]);
  const heightNum = useMemo(() => {
    const n = Number.parseInt(heightStr, 10);
    return Number.isFinite(n) ? n : 0;
  }, [heightStr]);

  const canCreate = widthNum > 0 && heightNum > 0;

  useEffect(() => {
    if (!isResize || !onCanvasPreviewChange || !canCreate) return;
    onCanvasPreviewChange({ width: widthNum, height: heightNum, background });
  }, [isResize, onCanvasPreviewChange, canCreate, widthNum, heightNum, background]);

  const presets = tab === "web" ? PRESETS_WEB : PRESETS_ART;

  const applyPreset = useCallback((p: PresetDef) => {
    setWidthStr(String(p.width));
    setHeightStr(String(p.height));
    setActivePresetId(p.id);
  }, []);

  const onWidthChange = useCallback((v: string) => {
    setWidthStr(v.replace(/\D/g, ""));
    setActivePresetId(null);
  }, []);

  const onHeightChange = useCallback((v: string) => {
    setHeightStr(v.replace(/\D/g, ""));
    setActivePresetId(null);
  }, []);

  const swapOrientation = useCallback(() => {
    setWidthStr(String(heightNum || 0));
    setHeightStr(String(widthNum || 0));
    setActivePresetId(null);
  }, [widthNum, heightNum]);

  const documentName = useMemo(() => {
    if (activePresetId) {
      const all = [...PRESETS_WEB, ...PRESETS_ART];
      const p = all.find((x) => x.id === activePresetId);
      if (p) return `${p.category} — ${p.title}`;
    }
    return `${widthNum}×${heightNum} px`;
  }, [activePresetId, widthNum, heightNum]);

  const handleConfirm = useCallback(() => {
    if (!canCreate) return;
    onConfirm({
      name: documentName,
      width: widthNum,
      height: heightNum,
      background,
    });
  }, [canCreate, onConfirm, documentName, widthNum, heightNum, background]);

  const titleId = isResize ? "photoroom-resize-title" : "photoroom-newdoc-title";

  return (
    <div
      className="fixed inset-0 z-[10100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/65 backdrop-blur-[2px]"
        aria-label="Cerrar fondo"
        onClick={onCancel}
      />
      <div className="relative flex h-[min(90vh,760px)] w-[min(1120px,96vw)] max-w-[1120px] flex-col overflow-hidden rounded-2xl border border-white/[0.12] bg-[#14181f] shadow-2xl shadow-black/60">
        <header className="shrink-0 border-b border-white/[0.08] px-6 py-4">
          <h1 id={titleId} className="text-[15px] font-semibold tracking-tight text-zinc-100">
            {isResize ? "Tamaño del lienzo" : "Nuevo documento"}
          </h1>
          <p className="mt-1 text-[12px] text-zinc-500">
            {isResize
              ? "Presets Web / Arte, medidas en px y fondo del pliego. Aplicar actualiza el lienzo (el contenido se mantiene; puede quedar fuera de los bordes)."
              : "Elige un tamaño para el lienzo o define medidas personalizadas."}
          </p>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* Izquierda ~60% */}
          <div className="flex w-[60%] min-w-0 flex-col border-r border-white/[0.08]">
            <div className="flex shrink-0 gap-1 border-b border-white/[0.06] px-4 pt-3">
              <button
                type="button"
                onClick={() => setTab("web")}
                className={`flex items-center gap-2 rounded-t-lg px-3 py-2 text-[12px] font-medium transition ${
                  tab === "web"
                    ? "bg-[#1a1f28] text-zinc-100 ring-1 ring-white/10"
                    : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
                }`}
              >
                <IconWebTab className="shrink-0 opacity-90" />
                Web
              </button>
              <button
                type="button"
                onClick={() => setTab("art")}
                className={`flex items-center gap-2 rounded-t-lg px-3 py-2 text-[12px] font-medium transition ${
                  tab === "art"
                    ? "bg-[#1a1f28] text-zinc-100 ring-1 ring-white/10"
                    : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
                }`}
              >
                <IconArtTab className="shrink-0 opacity-90" />
                Arte e ilustración
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
                {presets.map((p) => {
                  const active = activePresetId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      data-active={active}
                      onClick={() => applyPreset(p)}
                      className="group flex flex-col items-start gap-2 rounded-xl border border-white/[0.08] bg-[#0f1218] p-3 text-left transition hover:border-white/20 hover:bg-[#151a22] data-[active=true]:border-sky-500/60 data-[active=true]:bg-sky-500/10 data-[active=true]:ring-1 data-[active=true]:ring-sky-500/40"
                    >
                      <PresetShapeIcon kind={p.icon} />
                      <div>
                        <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{p.category}</div>
                        <div className="text-[13px] font-medium text-zinc-100">{p.title}</div>
                        <div className="mt-0.5 font-mono text-[11px] tabular-nums text-zinc-400">
                          {p.width} × {p.height} px
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Derecha ~40% */}
          <div className="flex w-[40%] min-w-[260px] flex-col gap-5 p-5">
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-zinc-500">Anchura</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={widthStr}
                  onChange={(e) => onWidthChange(e.target.value)}
                  className="nodrag w-full rounded-lg border border-white/10 bg-[#0c0f14] px-3 py-2 text-[13px] tabular-nums text-zinc-100 outline-none ring-sky-500/30 focus:ring-2"
                />
                <span className="shrink-0 text-[11px] text-zinc-500">px</span>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-zinc-500">Altura</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={heightStr}
                  onChange={(e) => onHeightChange(e.target.value)}
                  className="nodrag w-full rounded-lg border border-white/10 bg-[#0c0f14] px-3 py-2 text-[13px] tabular-nums text-zinc-100 outline-none ring-sky-500/30 focus:ring-2"
                />
                <span className="shrink-0 text-[11px] text-zinc-500">px</span>
              </div>
            </div>
            <div>
              <span className="mb-2 block text-[11px] font-medium uppercase tracking-wide text-zinc-500">Orientación</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  title="Intercambiar ancho y alto (vertical ↔ horizontal)"
                  onClick={swapOrientation}
                  className="nodrag flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/10 bg-[#0c0f14] px-3 py-2.5 text-[12px] text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.04]"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <rect x="8" y="5" width="8" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                  Vertical
                </button>
                <button
                  type="button"
                  title="Intercambiar ancho y alto (vertical ↔ horizontal)"
                  onClick={swapOrientation}
                  className="nodrag flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/10 bg-[#0c0f14] px-3 py-2.5 text-[12px] text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.04]"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <rect x="5" y="8" width="14" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                  Horizontal
                </button>
              </div>
            </div>
            <div>
              <span className="mb-2 block text-[11px] font-medium uppercase tracking-wide text-zinc-500">Fondo</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setBackground("white")}
                  className={`nodrag flex flex-1 flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-[11px] transition ${
                    background === "white"
                      ? "border-sky-500 bg-sky-500/15 text-zinc-100 ring-1 ring-sky-500/50"
                      : "border-white/10 bg-[#0c0f14] text-zinc-400 hover:border-white/20"
                  }`}
                >
                  <span className="h-8 w-full rounded border border-zinc-600/50 bg-white" />
                  Blanco
                </button>
                <button
                  type="button"
                  onClick={() => setBackground("black")}
                  className={`nodrag flex flex-1 flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-[11px] transition ${
                    background === "black"
                      ? "border-sky-500 bg-sky-500/15 text-zinc-100 ring-1 ring-sky-500/50"
                      : "border-white/10 bg-[#0c0f14] text-zinc-400 hover:border-white/20"
                  }`}
                >
                  <span className="h-8 w-full rounded border border-zinc-700 bg-black" />
                  Negro
                </button>
                <button
                  type="button"
                  onClick={() => setBackground("transparent")}
                  className={`nodrag flex flex-1 flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-[11px] transition ${
                    background === "transparent"
                      ? "border-sky-500 bg-sky-500/15 text-zinc-100 ring-1 ring-sky-500/50"
                      : "border-white/10 bg-[#0c0f14] text-zinc-400 hover:border-white/20"
                  }`}
                >
                  <CheckerboardBg className="h-8 w-full" />
                  Transparente
                </button>
              </div>
            </div>
          </div>
        </div>

        <footer className="flex shrink-0 justify-end gap-2 border-t border-white/[0.08] px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="nodrag rounded-lg border border-white/15 bg-transparent px-4 py-2 text-[13px] font-medium text-zinc-300 transition hover:bg-white/[0.06]"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!canCreate}
            onClick={handleConfirm}
            className="nodrag rounded-lg bg-sky-600 px-4 py-2 text-[13px] font-medium text-white shadow-lg shadow-sky-900/30 transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isResize ? "Aplicar" : "Crear"}
          </button>
        </footer>
      </div>
    </div>
  );
}
