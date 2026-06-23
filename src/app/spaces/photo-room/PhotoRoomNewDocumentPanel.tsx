"use client";

import React, { useCallback, useLayoutEffect, useMemo, useState, type ComponentProps } from "react";
import type { NewDocumentConfig } from "./new-document-model";
import { PhotoRoomCanvasMeasuresControls } from "./PhotoRoomCanvasMeasuresControls";

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

type PresetBrand = "web" | "instagram" | "tiktok" | "youtube" | "x" | "facebook" | "print";

type PresetDef = {
  id: string;
  icon: PresetIconKind;
  category: string;
  title: string;
  width: number;
  height: number;
  brand?: PresetBrand;
};

const PRESET_BRAND_META: Record<
  PresetBrand,
  { accent: string; tileBg: string; tileActiveBg: string; iconBg: string; iconColor: string }
> = {
  web: {
    accent: "#71449f",
    tileBg: "rgba(113, 68, 159, 0.06)",
    tileActiveBg: "rgba(113, 68, 159, 0.18)",
    iconBg: "#71449f",
    iconColor: "#ffffff",
  },
  instagram: {
    accent: "#E4405F",
    tileBg: "rgba(228, 64, 95, 0.08)",
    tileActiveBg: "rgba(228, 64, 95, 0.2)",
    iconBg: "linear-gradient(135deg, #833AB4 0%, #FD1D1D 50%, #FCAF45 100%)",
    iconColor: "#ffffff",
  },
  tiktok: {
    accent: "#EE1D52",
    tileBg: "rgba(238, 29, 82, 0.08)",
    tileActiveBg: "rgba(238, 29, 82, 0.18)",
    iconBg: "#010101",
    iconColor: "#ffffff",
  },
  youtube: {
    accent: "#FF0000",
    tileBg: "rgba(255, 0, 0, 0.08)",
    tileActiveBg: "rgba(255, 0, 0, 0.18)",
    iconBg: "#FF0000",
    iconColor: "#ffffff",
  },
  x: {
    accent: "#ffffff",
    tileBg: "rgba(255, 255, 255, 0.05)",
    tileActiveBg: "rgba(255, 255, 255, 0.12)",
    iconBg: "#000000",
    iconColor: "#ffffff",
  },
  facebook: {
    accent: "#1877F2",
    tileBg: "rgba(24, 119, 242, 0.08)",
    tileActiveBg: "rgba(24, 119, 242, 0.2)",
    iconBg: "#1877F2",
    iconColor: "#ffffff",
  },
  print: {
    accent: "#c9a96e",
    tileBg: "rgba(201, 169, 110, 0.08)",
    tileActiveBg: "rgba(201, 169, 110, 0.18)",
    iconBg: "#3d3428",
    iconColor: "#f5e6c8",
  },
};

const PRESETS_WEB: readonly PresetDef[] = [
  { id: "web-small", icon: "monitor", category: "Monitor", title: "Web Small", width: 1024, height: 768, brand: "web" },
  { id: "web-common", icon: "monitor", category: "Monitor", title: "Web Common", width: 1366, height: 768, brand: "web" },
  { id: "web-large", icon: "monitor", category: "Monitor", title: "Web Large", width: 1920, height: 1080, brand: "web" },
  { id: "ig-post", icon: "square", category: "Cuadrado", title: "Instagram Post", width: 1080, height: 1080, brand: "instagram" },
  { id: "ig-portrait", icon: "portrait", category: "Retrato", title: "Instagram Portrait", width: 1080, height: 1350, brand: "instagram" },
  { id: "ig-reel", icon: "vertical", category: "Vertical", title: "Instagram Reel", width: 1080, height: 1920, brand: "instagram" },
  { id: "tiktok", icon: "vertical", category: "Vertical", title: "TikTok", width: 1080, height: 1920, brand: "tiktok" },
  { id: "yt-thumb", icon: "image", category: "Imagen", title: "YouTube Thumbnail", width: 1280, height: 720, brand: "youtube" },
  { id: "yt-banner", icon: "panoramic", category: "Panorámico", title: "YouTube Banner", width: 2560, height: 1440, brand: "youtube" },
  { id: "twitter", icon: "landscape", category: "Paisaje", title: "Twitter/X Post", width: 1600, height: 900, brand: "x" },
  { id: "fb-post", icon: "landscape", category: "Paisaje", title: "Facebook Post", width: 1200, height: 630, brand: "facebook" },
  { id: "fb-cover", icon: "panoramic", category: "Panorámico", title: "Facebook Cover", width: 1640, height: 624, brand: "facebook" },
] as const;

const PRESETS_ART: readonly PresetDef[] = [
  { id: "a4-v", icon: "portrait", category: "Retrato", title: "A4 Vertical", width: 2480, height: 3508, brand: "print" },
  { id: "a4-h", icon: "landscape", category: "Paisaje", title: "A4 Horizontal", width: 3508, height: 2480, brand: "print" },
  { id: "a3-v", icon: "portrait", category: "Retrato", title: "A3 Vertical", width: 3508, height: 4961, brand: "print" },
  { id: "a3-h", icon: "landscape", category: "Paisaje", title: "A3 Horizontal", width: 4961, height: 3508, brand: "print" },
] as const;

function resolvePresetBrand(p: PresetDef): PresetBrand {
  return p.brand ?? "web";
}

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

function InstagramBrandIcon({ className = "h-5 w-5", ...props }: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5.2" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="2" />
      <circle cx="17.35" cy="6.65" r="1.25" fill="currentColor" />
    </svg>
  );
}

function TikTokBrandIcon({ className = "h-5 w-5", ...props }: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden {...props}>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 1 1-2.88-2.89 2.89 2.89 0 0 1 2.88 2.89V9.4a6.34 6.34 0 0 0-1-.05 6.34 6.34 0 0 0 0 12.68 6.34 6.34 0 0 0 6.34-6.34V8.69a8.19 8.19 0 0 0 4.88 1.58V6.82a4.85 4.85 0 0 1-1-.13z" />
    </svg>
  );
}

function YouTubeBrandIcon({ className = "h-5 w-5", ...props }: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden {...props}>
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

function XBrandIcon({ className = "h-4 w-4", ...props }: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden {...props}>
      <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.67l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23Zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64Z" />
    </svg>
  );
}

function FacebookBrandIcon({ className = "h-5 w-5", ...props }: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden {...props}>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function PresetBrandLogo({ brand, iconKind }: { brand: PresetBrand; iconKind: PresetIconKind }) {
  const meta = PRESET_BRAND_META[brand];
  const iconStyle = meta.iconBg.startsWith("linear-gradient")
    ? { background: meta.iconBg, color: meta.iconColor }
    : { backgroundColor: meta.iconBg, color: meta.iconColor };

  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center border border-white/10"
      style={iconStyle}
      aria-hidden
    >
      {brand === "instagram" ? (
        <InstagramBrandIcon className="h-5 w-5" />
      ) : brand === "tiktok" ? (
        <TikTokBrandIcon className="h-5 w-5" />
      ) : brand === "youtube" ? (
        <YouTubeBrandIcon className="h-5 w-5" />
      ) : brand === "x" ? (
        <XBrandIcon className="h-4 w-4" />
      ) : brand === "facebook" ? (
        <FacebookBrandIcon className="h-5 w-5" />
      ) : (
        <PresetShapeIcon kind={iconKind} onBrandTile />
      )}
    </span>
  );
}

function PresetShapeIcon({
  kind,
  active,
  onBrandTile,
}: {
  kind: PresetIconKind;
  active?: boolean;
  onBrandTile?: boolean;
}) {
  const common = onBrandTile
    ? "text-white/90"
    : active
      ? "text-[#c49de8]"
      : "text-white/40 group-hover:text-white/70 group-data-[active=true]:text-[#c49de8]";
  const size = onBrandTile ? 20 : 28;
  switch (kind) {
    case "monitor":
      return (
        <svg className={common} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
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
        <svg className={common} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="5" y="5" width="14" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case "portrait":
      return (
        <svg className={common} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="7" y="4" width="10" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case "vertical":
      return (
        <svg className={common} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="8" y="3" width="8" height="18" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case "image":
      return (
        <svg className={common} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="4" y="6" width="16" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="9" cy="10.5" r="1.5" fill="currentColor" />
          <path d="M4 16.5 8.5 12l3.5 3L17 10l3 3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "panoramic":
      return (
        <svg className={common} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="3" y="8" width="18" height="8" rx="1.25" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case "landscape":
      return (
        <svg className={common} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="4" y="7" width="16" height="10" rx="1.25" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    default: {
      const _n: never = kind;
      return _n;
    }
  }
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

  useLayoutEffect(() => {
    if (!isResize || !onCanvasPreviewChange || !canCreate) return;
    onCanvasPreviewChange({ width: widthNum, height: heightNum, background });
  }, [isResize, onCanvasPreviewChange, canCreate, widthNum, heightNum, background]);

  const presets = tab === "web" ? PRESETS_WEB : PRESETS_ART;

  const applyPreset = useCallback((p: PresetDef) => {
    setWidthStr(String(p.width));
    setHeightStr(String(p.height));
    setActivePresetId(p.id);
  }, []);

  const applyDimensions = useCallback((w: number, h: number) => {
    setWidthStr(String(w));
    setHeightStr(String(h));
    setActivePresetId(null);
  }, []);

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
      className="fixed inset-0 z-[10100] flex items-center justify-center p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-foldder-photoroom-newdoc
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/72 backdrop-blur-[3px]"
        aria-label="Cerrar fondo"
        onClick={onCancel}
      />
      <div className="relative flex h-[min(92vh,740px)] w-[min(1080px,96vw)] max-w-[1080px] flex-col overflow-hidden border border-white/10 bg-[#0b0f14] shadow-[0_32px_80px_rgba(0,0,0,0.65)]">
        <header className="flex h-10 shrink-0 items-stretch divide-x divide-white/10 border-b border-white/10 bg-white/[0.04]">
          <div className="flex min-w-0 flex-1 items-center gap-2.5 px-4">
            <span className="h-2 w-2 shrink-0 bg-[#71449f]" aria-hidden />
            <div className="min-w-0">
              <h1 id={titleId} className="truncate text-[10px] font-black uppercase tracking-[0.12em] text-white">
                {isResize ? "Tamaño del lienzo" : "Nuevo documento"}
              </h1>
            </div>
          </div>
          <p className="hidden min-w-0 flex-[1.4] items-center px-4 text-[9px] font-medium leading-snug text-white/45 md:flex">
            {isResize
              ? "Presets, medidas en px y fondo del pliego. Aplicar actualiza el lienzo."
              : "Elige un tamaño para el lienzo o define medidas personalizadas."}
          </p>
        </header>

        <div className="flex min-h-0 flex-1 divide-x divide-white/10">
          <div className="flex w-[58%] min-w-0 flex-col">
            <div className="flex h-10 shrink-0 divide-x divide-white/10 border-b border-white/10 bg-white/[0.03]">
              <button
                type="button"
                onClick={() => setTab("web")}
                className={`flex flex-1 items-center justify-center gap-2 px-3 text-[9px] font-black uppercase tracking-[0.1em] transition ${
                  tab === "web"
                    ? "bg-[#71449f]/20 text-white"
                    : "text-white/45 hover:bg-white/[0.04] hover:text-white/75"
                }`}
              >
                <IconWebTab className="shrink-0 opacity-90" />
                Web
              </button>
              <button
                type="button"
                onClick={() => setTab("art")}
                className={`flex flex-1 items-center justify-center gap-2 px-3 text-[9px] font-black uppercase tracking-[0.1em] transition ${
                  tab === "art"
                    ? "bg-[#71449f]/20 text-white"
                    : "text-white/45 hover:bg-white/[0.04] hover:text-white/75"
                }`}
              >
                <IconArtTab className="shrink-0 opacity-90" />
                Arte e ilustración
              </button>
            </div>
            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
              <div className="grid grid-cols-2 gap-px bg-white/10">
                {presets.map((p) => {
                  const active = activePresetId === p.id;
                  const brand = resolvePresetBrand(p);
                  const brandMeta = PRESET_BRAND_META[brand];
                  return (
                    <button
                      key={p.id}
                      type="button"
                      data-active={active}
                      onClick={() => applyPreset(p)}
                      className="group relative flex flex-col items-start gap-2.5 p-3 text-left transition hover:brightness-110"
                      style={{
                        backgroundColor: active ? brandMeta.tileActiveBg : brandMeta.tileBg,
                      }}
                    >
                      {active ? (
                        <span
                          className="absolute inset-y-0 left-0 w-[3px]"
                          style={{ backgroundColor: brandMeta.accent }}
                          aria-hidden
                        />
                      ) : null}
                      <div className="flex w-full items-start gap-2.5">
                        <PresetBrandLogo brand={brand} iconKind={p.icon} />
                        <div className="min-w-0 flex-1">
                          <div
                            className="text-[8px] font-black uppercase tracking-[0.12em]"
                            style={{ color: brandMeta.accent }}
                          >
                            {p.category}
                          </div>
                          <div className="text-[12px] font-semibold text-white">{p.title}</div>
                          <div className="mt-0.5 font-mono text-[10px] tabular-nums text-white/50">
                            {p.width} × {p.height} px
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex w-[42%] min-w-[240px] flex-col">
            <div className="flex h-10 shrink-0 items-center border-b border-white/10 bg-white/[0.03] px-4">
              <span className="text-[9px] font-black uppercase tracking-[0.12em] text-white/50">Medidas</span>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
              <PhotoRoomCanvasMeasuresControls
                width={widthNum}
                height={heightNum}
                background={background}
                onDimensionsChange={applyDimensions}
                onBackgroundChange={setBackground}
                variant="modal"
              />

              <div className="mt-auto border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <div className="text-[8px] font-black uppercase tracking-[0.12em] text-white/35">Vista previa</div>
                <div className="mt-1 truncate text-[11px] font-medium text-white/80">{documentName}</div>
                <div className="mt-0.5 font-mono text-[10px] tabular-nums text-white/45">
                  {widthNum || "—"} × {heightNum || "—"} px
                </div>
              </div>
            </div>
          </div>
        </div>

        <footer className="flex h-10 shrink-0 items-stretch justify-end divide-x divide-white/10 border-t border-white/10 bg-white/[0.04]">
          <button
            type="button"
            onClick={onCancel}
            className="nodrag px-5 text-[9px] font-black uppercase tracking-[0.1em] text-white/55 transition hover:bg-white/[0.06] hover:text-white"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!canCreate}
            onClick={handleConfirm}
            className="nodrag bg-[#71449f] px-6 text-[9px] font-black uppercase tracking-[0.1em] text-white transition hover:bg-[#8055b0] disabled:cursor-not-allowed disabled:opacity-35"
          >
            {isResize ? "Aplicar" : "Crear"}
          </button>
        </footer>
      </div>
    </div>
  );
}
