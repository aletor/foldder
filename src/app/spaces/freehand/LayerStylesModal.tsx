"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { ScrubNumberInput } from "../ScrubNumberInput";
import {
  defaultLayerEffects,
  defaultPhotoFilter,
  isSvgPhotoFilterPreset,
  PHOTO_FILTER_PRESETS,
  photoFilterCssString,
  type LayerEffectBlendMode,
  type LayerEffects,
  type OuterGlowTechnique,
  type PhotoFilterPreset,
} from "./layer-effects-types";
import { PhotoFilterSvgFilter } from "./PhotoFilterSvg";

const PROP_PANEL_SCRUB_CLASS =
  "cursor-ew-resize rounded-none border border-white/10 bg-black/30 px-2 py-1 font-mono text-[11px] tabular-nums text-white outline-none focus:border-[#71449f] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
const PROP_PANEL_SCRUB_HINT = "Arrastra horizontalmente · Mayús = ×10";

const BLEND_OPTIONS: { value: LayerEffectBlendMode; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "multiply", label: "Multiplicar" },
  { value: "screen", label: "Trama" },
  { value: "overlay", label: "Superponer" },
  { value: "darken", label: "Oscurecer" },
  { value: "lighten", label: "Aclarar" },
  { value: "color-dodge", label: "Sobreexponer color" },
  { value: "color-burn", label: "Subexponer color" },
  { value: "hard-light", label: "Luz intensa" },
  { value: "soft-light", label: "Luz suave" },
  { value: "difference", label: "Diferencia" },
  { value: "exclusion", label: "Exclusión" },
  { value: "hue", label: "Tono" },
  { value: "saturation", label: "Saturación" },
  { value: "color", label: "Color" },
  { value: "luminosity", label: "Luminosidad" },
  { value: "plus-lighter", label: "Sobreexponer lineal" },
  { value: "plus-darker", label: "Subexponer lineal" },
];

type EffectTab = "colorOverlay" | "gradientOverlay" | "outerGlow" | "photoFilter";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function LayerStylesModal({
  open,
  targetType,
  draft,
  onDraftChange,
  onOk,
  onCancel,
  onReset,
}: {
  open: boolean;
  targetType?: string;
  draft: LayerEffects;
  onDraftChange: (next: LayerEffects) => void;
  onOk: () => void;
  onCancel: () => void;
  onReset: () => void;
}) {
  /**
   * Texto (`<foreignObject>`) y carpetas (grupo de capas) solo soportan de forma fiable el filtro
   * fotográfico (filter CSS); los overlays color/degradado/glow requieren una silueta raster propia.
   */
  const overlaysSupported = targetType !== "text" && targetType !== "groupContainer";
  const [tab, setTab] = useState<EffectTab>(overlaysSupported ? "colorOverlay" : "photoFilter");
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragSessionRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setTab(overlaysSupported ? "colorOverlay" : "photoFilter");
      setDragOffset({ x: 0, y: 0 });
    }
  }, [open, overlaysSupported]);

  const co = draft.colorOverlay!;
  const go = draft.gradientOverlay!;
  const og = draft.outerGlow ?? defaultLayerEffects().outerGlow!;
  const pf = draft.photoFilter ?? defaultPhotoFilter();

  const coEnabled = !!co.enabled;
  const goEnabled = !!go.enabled;
  const ogEnabled = !!og.enabled;
  const pfEnabled = !!pf.enabled;

  /** No usar `<label>` + `<button>` anidados: en varios navegadores el clic no llega a `setTab` y el panel no cambia. */
  const tabItems: {
    id: EffectTab;
    label: string;
    enabled: boolean;
    onToggle: (checked: boolean) => void;
  }[] = [
    ...(overlaysSupported
      ? [
          {
            id: "colorOverlay" as EffectTab,
            label: "Color Overlay",
            enabled: coEnabled,
            onToggle: (c: boolean) => onDraftChange({ ...draft, colorOverlay: { ...co, enabled: c } }),
          },
          {
            id: "gradientOverlay" as EffectTab,
            label: "Gradient Overlay",
            enabled: goEnabled,
            onToggle: (c: boolean) => onDraftChange({ ...draft, gradientOverlay: { ...go, enabled: c } }),
          },
          {
            id: "outerGlow" as EffectTab,
            label: "Outer Glow",
            enabled: ogEnabled,
            onToggle: (c: boolean) => onDraftChange({ ...draft, outerGlow: { ...og, enabled: c } }),
          },
        ]
      : []),
    {
      id: "photoFilter",
      label: "Filtro de foto",
      enabled: pfEnabled,
      onToggle: (c) => onDraftChange({ ...draft, photoFilter: { ...pf, enabled: c } }),
    },
  ];

  const sidebar = (
    <div
      className="flex w-[150px] shrink-0 flex-col border-r border-white/10 bg-white/[0.03]"
      role="tablist"
      aria-label="Efectos de capa"
    >
      <div className="flex h-9 shrink-0 items-center border-b border-white/10 px-3">
        <span className="text-[8px] font-black uppercase tracking-[0.12em] text-white/40">Efectos</span>
      </div>
      <div className="divide-y divide-white/[0.06]">
        {tabItems.map((t) => {
          const active = tab === t.id;
          return (
            <div
              key={t.id}
              id={`fh-layer-style-tab-${t.id}`}
              role="tab"
              tabIndex={0}
              aria-selected={active}
              className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-left outline-none transition focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#71449f]/60 ${
                active ? "bg-[#71449f]/20" : "hover:bg-white/[0.04]"
              }`}
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setTab(t.id);
                }
              }}
            >
              <input
                type="checkbox"
                checked={t.enabled}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => t.onToggle(e.target.checked)}
                className="h-3 w-3 shrink-0 accent-[#71449f]"
                aria-label={`Activar ${t.label}`}
              />
              <span
                className={`min-w-0 flex-1 truncate text-[11px] ${
                  active ? "font-semibold text-white" : "text-white/55"
                }`}
              >
                {t.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );

  if (!open || typeof document === "undefined") return null;

  const onDragHandlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragSessionRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: dragOffset.x,
      origY: dragOffset.y,
    };
  };

  const onDragHandlePointerMove = (e: React.PointerEvent) => {
    const s = dragSessionRef.current;
    if (!s || e.pointerId !== s.pointerId) return;
    setDragOffset({
      x: s.origX + (e.clientX - s.startX),
      y: s.origY + (e.clientY - s.startY),
    });
  };

  const endDrag = (e: React.PointerEvent) => {
    const s = dragSessionRef.current;
    if (!s || e.pointerId !== s.pointerId) return;
    dragSessionRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const panel =
    tab === "colorOverlay" ? (
      <div className="space-y-2.5 p-3">
        <div className="space-y-1">
          <span className="text-[8px] font-black uppercase tracking-[0.12em] text-white/40">Fusión</span>
          <select
            value={co.blendMode}
            onChange={(e) =>
              onDraftChange({
                ...draft,
                colorOverlay: { ...co, blendMode: e.target.value as LayerEffectBlendMode },
              })
            }
            className="w-full rounded-none border border-white/10 bg-black/30 px-2 py-1.5 text-[11px] text-white outline-none"
          >
            {BLEND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[8px] font-black uppercase tracking-[0.12em] text-white/40">Opacidad</span>
            <ScrubNumberInput
              value={Math.round(co.opacity * 100)}
              onKeyboardCommit={(n) =>
                onDraftChange({
                  ...draft,
                  colorOverlay: { ...co, opacity: clamp(Math.round(n), 0, 100) / 100 },
                })
              }
              onScrubLive={(n) =>
                onDraftChange({
                  ...draft,
                  colorOverlay: { ...co, opacity: clamp(Math.round(n), 0, 100) / 100 },
                })
              }
              onScrubEnd={() => {}}
              step={1}
              roundFn={(n) => clamp(Math.round(n), 0, 100)}
              min={0}
              max={100}
              title={`% · ${PROP_PANEL_SCRUB_HINT}`}
              className={`w-14 text-right ${PROP_PANEL_SCRUB_CLASS}`}
            />
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(co.opacity * 100)}
            onChange={(e) =>
              onDraftChange({
                ...draft,
                colorOverlay: { ...co, opacity: Number(e.target.value) / 100 },
              })
            }
            className="w-full accent-[#71449f]"
          />
        </div>
        <div className="space-y-1">
          <span className="text-[8px] font-black uppercase tracking-[0.12em] text-white/40">Color</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={co.color.startsWith("#") && co.color.length >= 7 ? co.color.slice(0, 7) : "#ff0000"}
              onChange={(e) =>
                onDraftChange({
                  ...draft,
                  colorOverlay: { ...co, color: e.target.value },
                })
              }
              className="h-8 w-10 shrink-0 cursor-pointer rounded-none border border-white/10 bg-transparent"
            />
            <input
              type="text"
              value={co.color}
              onChange={(e) =>
                onDraftChange({
                  ...draft,
                  colorOverlay: { ...co, color: e.target.value },
                })
              }
              className="min-w-0 flex-1 rounded-none border border-white/10 bg-black/30 px-2 py-1.5 font-mono text-[11px] text-white outline-none"
            />
          </div>
        </div>
      </div>
    ) : tab === "gradientOverlay" ? (
      <div className="space-y-2.5 p-3">
        <div className="space-y-1">
          <span className="text-[8px] font-black uppercase tracking-[0.12em] text-white/40">Fusión</span>
          <select
            value={go.blendMode}
            onChange={(e) =>
              onDraftChange({
                ...draft,
                gradientOverlay: { ...go, blendMode: e.target.value as LayerEffectBlendMode },
              })
            }
            className="w-full rounded-none border border-white/10 bg-black/30 px-2 py-1.5 text-[11px] text-white outline-none"
          >
            {BLEND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[8px] font-black uppercase tracking-[0.12em] text-white/40">Opacidad</span>
            <ScrubNumberInput
              value={Math.round(go.opacity * 100)}
              onKeyboardCommit={(n) =>
                onDraftChange({
                  ...draft,
                  gradientOverlay: { ...go, opacity: clamp(Math.round(n), 0, 100) / 100 },
                })
              }
              onScrubLive={(n) =>
                onDraftChange({
                  ...draft,
                  gradientOverlay: { ...go, opacity: clamp(Math.round(n), 0, 100) / 100 },
                })
              }
              onScrubEnd={() => {}}
              step={1}
              roundFn={(n) => clamp(Math.round(n), 0, 100)}
              min={0}
              max={100}
              title={`% · ${PROP_PANEL_SCRUB_HINT}`}
              className={`w-14 text-right ${PROP_PANEL_SCRUB_CLASS}`}
            />
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(go.opacity * 100)}
            onChange={(e) =>
              onDraftChange({
                ...draft,
                gradientOverlay: { ...go, opacity: Number(e.target.value) / 100 },
              })
            }
            className="w-full accent-[#71449f]"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <span className="text-[8px] font-black uppercase tracking-[0.12em] text-white/40">Estilo</span>
            <select
              value={go.gradient.type}
              onChange={(e) =>
                onDraftChange({
                  ...draft,
                  gradientOverlay: {
                    ...go,
                    gradient: { ...go.gradient, type: e.target.value as "linear" | "radial" },
                  },
                })
              }
              className="w-full rounded-none border border-white/10 bg-black/30 px-2 py-1.5 text-[11px] text-white outline-none"
            >
              <option value="linear">Lineal</option>
              <option value="radial">Radial</option>
            </select>
          </div>
          <label className="flex items-end gap-2 pb-1.5 text-[11px] text-white/55">
            <input
              type="checkbox"
              className="h-3 w-3 accent-[#71449f]"
              checked={go.gradient.reverse}
              onChange={(e) =>
                onDraftChange({
                  ...draft,
                  gradientOverlay: {
                    ...go,
                    gradient: { ...go.gradient, reverse: e.target.checked },
                  },
                })
              }
            />
            Invertir
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <span className="text-[8px] font-black uppercase tracking-[0.12em] text-white/40">Ángulo</span>
            <ScrubNumberInput
              value={Math.round(go.gradient.angle)}
              onKeyboardCommit={(n) => {
                const v = Number(n);
                if (!Number.isFinite(v)) return;
                onDraftChange({
                  ...draft,
                  gradientOverlay: { ...go, gradient: { ...go.gradient, angle: v } },
                });
              }}
              onScrubLive={(n) => {
                const v = Number(n);
                if (!Number.isFinite(v)) return;
                onDraftChange({
                  ...draft,
                  gradientOverlay: { ...go, gradient: { ...go.gradient, angle: v } },
                });
              }}
              onScrubEnd={() => {}}
              step={1}
              roundFn={(n) => Math.round(n)}
              title={PROP_PANEL_SCRUB_HINT}
              className={`w-full ${PROP_PANEL_SCRUB_CLASS}`}
            />
          </div>
          <div className="space-y-1">
            <span className="text-[8px] font-black uppercase tracking-[0.12em] text-white/40">Escala</span>
            <ScrubNumberInput
              value={go.gradient.scale}
              onKeyboardCommit={(n) => {
                const v = Number(n);
                if (!Number.isFinite(v)) return;
                onDraftChange({
                  ...draft,
                  gradientOverlay: {
                    ...go,
                    gradient: { ...go.gradient, scale: clamp(v, 0.05, 4) },
                  },
                });
              }}
              onScrubLive={(n) => {
                const v = Number(n);
                if (!Number.isFinite(v)) return;
                onDraftChange({
                  ...draft,
                  gradientOverlay: {
                    ...go,
                    gradient: { ...go.gradient, scale: clamp(v, 0.05, 4) },
                  },
                });
              }}
              onScrubEnd={() => {}}
              step={0.05}
              roundFn={(n) => Math.round(n * 100) / 100}
              min={0.05}
              max={4}
              title={PROP_PANEL_SCRUB_HINT}
              className={`w-full ${PROP_PANEL_SCRUB_CLASS}`}
            />
          </div>
        </div>
        <div className="space-y-2 border border-white/10 bg-white/[0.03] p-2">
          <span className="text-[8px] font-black uppercase tracking-[0.12em] text-white/40">Paradas</span>
          {go.gradient.stops.map((s, idx) => (
            <div key={idx} className="flex flex-wrap items-center gap-2">
              <ScrubNumberInput
                value={s.offset}
                onKeyboardCommit={(n) => {
                  const v = Number(n);
                  if (!Number.isFinite(v)) return;
                  const stops = go.gradient.stops.map((st, j) =>
                    j === idx ? { ...st, offset: clamp(v, 0, 1) } : st,
                  );
                  onDraftChange({
                    ...draft,
                    gradientOverlay: { ...go, gradient: { ...go.gradient, stops } },
                  });
                }}
                onScrubLive={(n) => {
                  const v = Number(n);
                  if (!Number.isFinite(v)) return;
                  const stops = go.gradient.stops.map((st, j) =>
                    j === idx ? { ...st, offset: clamp(v, 0, 1) } : st,
                  );
                  onDraftChange({
                    ...draft,
                    gradientOverlay: { ...go, gradient: { ...go.gradient, stops } },
                  });
                }}
                onScrubEnd={() => {}}
                step={0.01}
                roundFn={(x) => Math.round(x * 100) / 100}
                min={0}
                max={1}
                title={`Offset 0–1 · ${PROP_PANEL_SCRUB_HINT}`}
                className={`w-16 ${PROP_PANEL_SCRUB_CLASS}`}
              />
              <input
                type="color"
                value={s.color.startsWith("#") && s.color.length >= 7 ? s.color.slice(0, 7) : "#000000"}
                onChange={(e) => {
                  const stops = go.gradient.stops.map((st, j) =>
                    j === idx ? { ...st, color: e.target.value } : st,
                  );
                  onDraftChange({
                    ...draft,
                    gradientOverlay: { ...go, gradient: { ...go.gradient, stops } },
                  });
                }}
                className="h-7 w-9 shrink-0 cursor-pointer rounded-none border border-white/10 bg-transparent"
              />
              <input
                type="text"
                value={s.color}
                onChange={(e) => {
                  const stops = go.gradient.stops.map((st, j) =>
                    j === idx ? { ...st, color: e.target.value } : st,
                  );
                  onDraftChange({
                    ...draft,
                    gradientOverlay: { ...go, gradient: { ...go.gradient, stops } },
                  });
                }}
                className="min-w-0 flex-1 rounded-none border border-white/10 bg-black/30 px-1.5 py-1 font-mono text-[10px] text-white outline-none"
              />
            </div>
          ))}
        </div>
      </div>
    ) : tab === "outerGlow" ? (
      <div className="space-y-2.5 p-3">
        <div className="space-y-1">
          <span className="text-[8px] font-black uppercase tracking-[0.12em] text-white/40">Fusión</span>
          <select
            value={og.blendMode}
            onChange={(e) =>
              onDraftChange({
                ...draft,
                outerGlow: { ...og, blendMode: e.target.value as LayerEffectBlendMode },
              })
            }
            className="w-full rounded-none border border-white/10 bg-black/30 px-2 py-1.5 text-[11px] text-white outline-none"
          >
            {BLEND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[8px] font-black uppercase tracking-[0.12em] text-white/40">Opacidad</span>
            <ScrubNumberInput
              value={Math.round(og.opacity * 100)}
              onKeyboardCommit={(n) =>
                onDraftChange({
                  ...draft,
                  outerGlow: { ...og, opacity: clamp(Math.round(n), 0, 100) / 100 },
                })
              }
              onScrubLive={(n) =>
                onDraftChange({
                  ...draft,
                  outerGlow: { ...og, opacity: clamp(Math.round(n), 0, 100) / 100 },
                })
              }
              onScrubEnd={() => {}}
              step={1}
              roundFn={(n) => clamp(Math.round(n), 0, 100)}
              min={0}
              max={100}
              title={`% · ${PROP_PANEL_SCRUB_HINT}`}
              className={`w-14 text-right ${PROP_PANEL_SCRUB_CLASS}`}
            />
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(og.opacity * 100)}
            onChange={(e) =>
              onDraftChange({
                ...draft,
                outerGlow: { ...og, opacity: Number(e.target.value) / 100 },
              })
            }
            className="w-full accent-[#71449f]"
          />
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[8px] font-black uppercase tracking-[0.12em] text-white/40">Ruido</span>
            <ScrubNumberInput
              value={Math.round(og.noise)}
              onKeyboardCommit={(n) =>
                onDraftChange({
                  ...draft,
                  outerGlow: { ...og, noise: clamp(Math.round(n), 0, 100) },
                })
              }
              onScrubLive={(n) =>
                onDraftChange({
                  ...draft,
                  outerGlow: { ...og, noise: clamp(Math.round(n), 0, 100) },
                })
              }
              onScrubEnd={() => {}}
              step={1}
              roundFn={(n) => clamp(Math.round(n), 0, 100)}
              min={0}
              max={100}
              title={`% · ${PROP_PANEL_SCRUB_HINT}`}
              className={`w-14 text-right ${PROP_PANEL_SCRUB_CLASS}`}
            />
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(og.noise)}
            onChange={(e) =>
              onDraftChange({
                ...draft,
                outerGlow: { ...og, noise: clamp(Number(e.target.value), 0, 100) },
              })
            }
            className="w-full accent-[#71449f]"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <span className="text-[8px] font-black uppercase tracking-[0.12em] text-white/40">Relleno</span>
            <select
              value={og.fill}
              onChange={(e) =>
                onDraftChange({
                  ...draft,
                  outerGlow: { ...og, fill: e.target.value as "color" | "gradient" },
                })
              }
              className="w-full rounded-none border border-white/10 bg-black/30 px-2 py-1.5 text-[11px] text-white outline-none"
            >
              <option value="color">Color</option>
              <option value="gradient">Degradado</option>
            </select>
          </div>
          <div className="space-y-1">
            <span className="text-[8px] font-black uppercase tracking-[0.12em] text-white/40">Técnica</span>
            <select
              value={og.technique}
              onChange={(e) =>
                onDraftChange({
                  ...draft,
                  outerGlow: { ...og, technique: e.target.value as OuterGlowTechnique },
                })
              }
              className="w-full rounded-none border border-white/10 bg-black/30 px-2 py-1.5 text-[11px] text-white outline-none"
            >
              <option value="softer">Suave</option>
              <option value="precise">Preciso</option>
            </select>
          </div>
        </div>
        {og.fill === "color" ? (
          <div className="space-y-1">
            <span className="text-[8px] font-black uppercase tracking-[0.12em] text-white/40">Color</span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={og.color.startsWith("#") && og.color.length >= 7 ? og.color.slice(0, 7) : "#ffcc00"}
                onChange={(e) =>
                  onDraftChange({
                    ...draft,
                    outerGlow: { ...og, color: e.target.value },
                  })
                }
                className="h-8 w-10 shrink-0 cursor-pointer rounded-none border border-white/10 bg-transparent"
              />
              <input
                type="text"
                value={og.color}
                onChange={(e) =>
                  onDraftChange({
                    ...draft,
                    outerGlow: { ...og, color: e.target.value },
                  })
                }
                className="min-w-0 flex-1 rounded-none border border-white/10 bg-black/30 px-2 py-1.5 font-mono text-[11px] text-white outline-none"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-2 border border-white/10 bg-white/[0.03] p-2">
            <span className="text-[8px] font-black uppercase tracking-[0.12em] text-white/40">Degradado</span>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <span className="text-[8px] font-black uppercase tracking-[0.12em] text-white/40">Estilo</span>
                <select
                  value={og.gradient.type}
                  onChange={(e) =>
                    onDraftChange({
                      ...draft,
                      outerGlow: {
                        ...og,
                        gradient: { ...og.gradient, type: e.target.value as "linear" | "radial" },
                      },
                    })
                  }
                  className="w-full rounded-none border border-white/10 bg-black/30 px-2 py-1.5 text-[11px] text-white outline-none"
                >
                  <option value="linear">Lineal</option>
                  <option value="radial">Radial</option>
                </select>
              </div>
              <label className="flex items-end gap-2 pb-1.5 text-[11px] text-white/55">
                <input
                  type="checkbox"
                  className="h-3 w-3 accent-[#71449f]"
                  checked={og.gradient.reverse}
                  onChange={(e) =>
                    onDraftChange({
                      ...draft,
                      outerGlow: {
                        ...og,
                        gradient: { ...og.gradient, reverse: e.target.checked },
                      },
                    })
                  }
                />
                Invertir
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <span className="text-[8px] font-black uppercase tracking-[0.12em] text-white/40">Ángulo</span>
                <ScrubNumberInput
                  value={Math.round(og.gradient.angle)}
                  onKeyboardCommit={(n) => {
                    const v = Number(n);
                    if (!Number.isFinite(v)) return;
                    onDraftChange({
                      ...draft,
                      outerGlow: { ...og, gradient: { ...og.gradient, angle: v } },
                    });
                  }}
                  onScrubLive={(n) => {
                    const v = Number(n);
                    if (!Number.isFinite(v)) return;
                    onDraftChange({
                      ...draft,
                      outerGlow: { ...og, gradient: { ...og.gradient, angle: v } },
                    });
                  }}
                  onScrubEnd={() => {}}
                  step={1}
                  roundFn={(n) => Math.round(n)}
                  title={PROP_PANEL_SCRUB_HINT}
                  className={`w-full ${PROP_PANEL_SCRUB_CLASS}`}
                />
              </div>
              <div className="space-y-1">
                <span className="text-[8px] font-black uppercase tracking-[0.12em] text-white/40">Escala</span>
                <ScrubNumberInput
                  value={og.gradient.scale}
                  onKeyboardCommit={(n) => {
                    const v = Number(n);
                    if (!Number.isFinite(v)) return;
                    onDraftChange({
                      ...draft,
                      outerGlow: {
                        ...og,
                        gradient: { ...og.gradient, scale: clamp(v, 0.05, 4) },
                      },
                    });
                  }}
                  onScrubLive={(n) => {
                    const v = Number(n);
                    if (!Number.isFinite(v)) return;
                    onDraftChange({
                      ...draft,
                      outerGlow: {
                        ...og,
                        gradient: { ...og.gradient, scale: clamp(v, 0.05, 4) },
                      },
                    });
                  }}
                  onScrubEnd={() => {}}
                  step={0.05}
                  roundFn={(n) => Math.round(n * 100) / 100}
                  min={0.05}
                  max={4}
                  title={PROP_PANEL_SCRUB_HINT}
                  className={`w-full ${PROP_PANEL_SCRUB_CLASS}`}
                />
              </div>
            </div>
            <div className="space-y-2">
              <span className="text-[8px] font-black uppercase tracking-[0.12em] text-white/40">Paradas</span>
              {og.gradient.stops.map((s, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2">
                  <ScrubNumberInput
                    value={s.offset}
                    onKeyboardCommit={(n) => {
                      const v = Number(n);
                      if (!Number.isFinite(v)) return;
                      const stops = og.gradient.stops.map((st, j) =>
                        j === idx ? { ...st, offset: clamp(v, 0, 1) } : st,
                      );
                      onDraftChange({
                        ...draft,
                        outerGlow: { ...og, gradient: { ...og.gradient, stops } },
                      });
                    }}
                    onScrubLive={(n) => {
                      const v = Number(n);
                      if (!Number.isFinite(v)) return;
                      const stops = og.gradient.stops.map((st, j) =>
                        j === idx ? { ...st, offset: clamp(v, 0, 1) } : st,
                      );
                      onDraftChange({
                        ...draft,
                        outerGlow: { ...og, gradient: { ...og.gradient, stops } },
                      });
                    }}
                    onScrubEnd={() => {}}
                    step={0.01}
                    roundFn={(x) => Math.round(x * 100) / 100}
                    min={0}
                    max={1}
                    title={`Offset 0–1 · ${PROP_PANEL_SCRUB_HINT}`}
                    className={`w-16 ${PROP_PANEL_SCRUB_CLASS}`}
                  />
                  <input
                    type="color"
                    value={s.color.startsWith("#") && s.color.length >= 7 ? s.color.slice(0, 7) : "#000000"}
                    onChange={(e) => {
                      const stops = og.gradient.stops.map((st, j) =>
                        j === idx ? { ...st, color: e.target.value } : st,
                      );
                      onDraftChange({
                        ...draft,
                        outerGlow: { ...og, gradient: { ...og.gradient, stops } },
                      });
                    }}
                    className="h-7 w-9 shrink-0 cursor-pointer rounded-none border border-white/10 bg-transparent"
                  />
                  <input
                    type="text"
                    value={s.color}
                    onChange={(e) => {
                      const stops = og.gradient.stops.map((st, j) =>
                        j === idx ? { ...st, color: e.target.value } : st,
                      );
                      onDraftChange({
                        ...draft,
                        outerGlow: { ...og, gradient: { ...og.gradient, stops } },
                      });
                    }}
                    className="min-w-0 flex-1 rounded-none border border-white/10 bg-black/30 px-1.5 py-1 font-mono text-[10px] text-white outline-none"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <span className="text-[8px] font-black uppercase tracking-[0.12em] text-white/40">Expansión</span>
            <ScrubNumberInput
              value={Math.round(og.spread)}
              onKeyboardCommit={(n) =>
                onDraftChange({
                  ...draft,
                  outerGlow: { ...og, spread: clamp(Math.round(n), 0, 100) },
                })
              }
              onScrubLive={(n) =>
                onDraftChange({
                  ...draft,
                  outerGlow: { ...og, spread: clamp(Math.round(n), 0, 100) },
                })
              }
              onScrubEnd={() => {}}
              step={1}
              roundFn={(n) => clamp(Math.round(n), 0, 100)}
              min={0}
              max={100}
              title={`% · ${PROP_PANEL_SCRUB_HINT}`}
              className={`w-full ${PROP_PANEL_SCRUB_CLASS}`}
            />
          </div>
          <div className="space-y-1">
            <span className="text-[8px] font-black uppercase tracking-[0.12em] text-white/40">Tamaño</span>
            <ScrubNumberInput
              value={Math.round(og.size * 10) / 10}
              onKeyboardCommit={(n) => {
                const v = Number(n);
                if (!Number.isFinite(v)) return;
                onDraftChange({
                  ...draft,
                  outerGlow: { ...og, size: clamp(Math.round(v * 10) / 10, 0, 250) },
                });
              }}
              onScrubLive={(n) => {
                const v = Number(n);
                if (!Number.isFinite(v)) return;
                onDraftChange({
                  ...draft,
                  outerGlow: { ...og, size: clamp(Math.round(v * 10) / 10, 0, 250) },
                });
              }}
              onScrubEnd={() => {}}
              step={0.5}
              roundFn={(n) => Math.round(n * 10) / 10}
              min={0}
              max={250}
              title={`px · ${PROP_PANEL_SCRUB_HINT}`}
              className={`w-full ${PROP_PANEL_SCRUB_CLASS}`}
            />
          </div>
          <div className="space-y-1">
            <span className="text-[8px] font-black uppercase tracking-[0.12em] text-white/40">Rango</span>
            <ScrubNumberInput
              value={Math.round(og.range)}
              onKeyboardCommit={(n) =>
                onDraftChange({
                  ...draft,
                  outerGlow: { ...og, range: clamp(Math.round(n), 0, 100) },
                })
              }
              onScrubLive={(n) =>
                onDraftChange({
                  ...draft,
                  outerGlow: { ...og, range: clamp(Math.round(n), 0, 100) },
                })
              }
              onScrubEnd={() => {}}
              step={1}
              roundFn={(n) => clamp(Math.round(n), 0, 100)}
              min={0}
              max={100}
              title={`% · ${PROP_PANEL_SCRUB_HINT}`}
              className={`w-full ${PROP_PANEL_SCRUB_CLASS}`}
            />
          </div>
        </div>
      </div>
    ) : (
      <div className="space-y-3 p-3">
        {/* defs SVG ocultos para el preview de presets de mapeo tonal (duotono/teal&orange/split-tone). */}
        <svg width={0} height={0} aria-hidden style={{ position: "absolute" }}>
          <defs>
            {PHOTO_FILTER_PRESETS.filter((p) => isSvgPhotoFilterPreset(p.id)).map((p) => (
              <PhotoFilterSvgFilter
                key={p.id}
                id={`fh-pf-prev-${p.id}`}
                preset={p.id}
                intensity={1}
              />
            ))}
          </defs>
        </svg>
        <div className="space-y-1.5">
          <span className="text-[8px] font-black uppercase tracking-[0.12em] text-white/40">Preajuste</span>
          <div className="grid grid-cols-3 gap-1.5">
            {PHOTO_FILTER_PRESETS.map((p) => {
              const active = pf.preset === p.id;
              const previewFilter = isSvgPhotoFilterPreset(p.id)
                ? `url(#fh-pf-prev-${p.id})`
                : photoFilterCssString(p.id, 1);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() =>
                    onDraftChange({
                      ...draft,
                      photoFilter: { ...pf, enabled: true, preset: p.id as PhotoFilterPreset },
                    })
                  }
                  className={`flex flex-col items-stretch gap-1 rounded-none border p-1 text-left transition ${
                    active
                      ? "border-[#71449f] bg-[#71449f]/20"
                      : "border-white/10 hover:border-white/25 hover:bg-white/[0.04]"
                  }`}
                  title={p.label}
                >
                  <span
                    className="h-9 w-full"
                    style={{
                      backgroundImage:
                        "linear-gradient(135deg, #6b5b3a 0%, #c98f5a 35%, #e8cba0 60%, #4a6b7a 100%)",
                      filter: previewFilter,
                    }}
                    aria-hidden
                  />
                  <span
                    className={`truncate text-[9px] ${active ? "font-semibold text-white" : "text-white/55"}`}
                  >
                    {p.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[8px] font-black uppercase tracking-[0.12em] text-white/40">Intensidad</span>
            <ScrubNumberInput
              value={Math.round(pf.intensity * 100)}
              onKeyboardCommit={(n) =>
                onDraftChange({ ...draft, photoFilter: { ...pf, intensity: clamp(Math.round(n), 0, 100) / 100 } })
              }
              onScrubLive={(n) =>
                onDraftChange({ ...draft, photoFilter: { ...pf, intensity: clamp(Math.round(n), 0, 100) / 100 } })
              }
              onScrubEnd={() => {}}
              step={1}
              roundFn={(n) => clamp(Math.round(n), 0, 100)}
              min={0}
              max={100}
              title={`% · ${PROP_PANEL_SCRUB_HINT}`}
              className={`w-14 text-right ${PROP_PANEL_SCRUB_CLASS}`}
            />
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(pf.intensity * 100)}
            onChange={(e) =>
              onDraftChange({ ...draft, photoFilter: { ...pf, intensity: Number(e.target.value) / 100 } })
            }
            className="w-full accent-[#71449f]"
          />
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[8px] font-black uppercase tracking-[0.12em] text-white/40">Grano</span>
            <ScrubNumberInput
              value={Math.round(pf.grain * 100)}
              onKeyboardCommit={(n) =>
                onDraftChange({ ...draft, photoFilter: { ...pf, grain: clamp(Math.round(n), 0, 100) / 100 } })
              }
              onScrubLive={(n) =>
                onDraftChange({ ...draft, photoFilter: { ...pf, grain: clamp(Math.round(n), 0, 100) / 100 } })
              }
              onScrubEnd={() => {}}
              step={1}
              roundFn={(n) => clamp(Math.round(n), 0, 100)}
              min={0}
              max={100}
              title={`% · ${PROP_PANEL_SCRUB_HINT}`}
              className={`w-14 text-right ${PROP_PANEL_SCRUB_CLASS}`}
            />
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(pf.grain * 100)}
            onChange={(e) =>
              onDraftChange({ ...draft, photoFilter: { ...pf, grain: Number(e.target.value) / 100 } })
            }
            className="w-full accent-[#71449f]"
          />
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[8px] font-black uppercase tracking-[0.12em] text-white/40">Tamaño grano</span>
            <ScrubNumberInput
              value={Math.round((pf.grainSize ?? 0.5) * 100)}
              onKeyboardCommit={(n) =>
                onDraftChange({ ...draft, photoFilter: { ...pf, grainSize: clamp(Math.round(n), 0, 100) / 100 } })
              }
              onScrubLive={(n) =>
                onDraftChange({ ...draft, photoFilter: { ...pf, grainSize: clamp(Math.round(n), 0, 100) / 100 } })
              }
              onScrubEnd={() => {}}
              step={1}
              roundFn={(n) => clamp(Math.round(n), 0, 100)}
              min={0}
              max={100}
              title={`% · ${PROP_PANEL_SCRUB_HINT}`}
              className={`w-14 text-right ${PROP_PANEL_SCRUB_CLASS}`}
            />
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round((pf.grainSize ?? 0.5) * 100)}
            onChange={(e) =>
              onDraftChange({ ...draft, photoFilter: { ...pf, grainSize: Number(e.target.value) / 100 } })
            }
            className="w-full accent-[#71449f]"
          />
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[8px] font-black uppercase tracking-[0.12em] text-white/40">Viñeta</span>
            <ScrubNumberInput
              value={Math.round(pf.vignette * 100)}
              onKeyboardCommit={(n) =>
                onDraftChange({ ...draft, photoFilter: { ...pf, vignette: clamp(Math.round(n), 0, 100) / 100 } })
              }
              onScrubLive={(n) =>
                onDraftChange({ ...draft, photoFilter: { ...pf, vignette: clamp(Math.round(n), 0, 100) / 100 } })
              }
              onScrubEnd={() => {}}
              step={1}
              roundFn={(n) => clamp(Math.round(n), 0, 100)}
              min={0}
              max={100}
              title={`% · ${PROP_PANEL_SCRUB_HINT}`}
              className={`w-14 text-right ${PROP_PANEL_SCRUB_CLASS}`}
            />
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(pf.vignette * 100)}
            onChange={(e) =>
              onDraftChange({ ...draft, photoFilter: { ...pf, vignette: Number(e.target.value) / 100 } })
            }
            className="w-full accent-[#71449f]"
          />
        </div>
        <p className="text-[9px] leading-relaxed text-white/35">
          El filtro tiñe el contenido de la capa (imagen, forma o texto). El grano y la viñeta se recortan a
          la silueta. Para activarlo, marca la casilla «Filtro de foto».
        </p>
      </div>
    );

  return createPortal(
    <div
      className="fixed inset-0 z-[100200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fh-layer-style-title"
      onClick={onCancel}
    >
      <div
        data-foldder-layer-style-panel
        className="flex max-h-[88vh] w-[min(94vw,520px)] flex-col overflow-hidden rounded-none border border-white/10 bg-[#0b0f14] shadow-[0_24px_70px_rgba(0,0,0,0.55)]"
        style={{ transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex h-10 shrink-0 items-stretch border-b border-white/10 bg-white/[0.04]">
          <div
            className="flex min-w-0 flex-1 cursor-grab touch-none select-none items-center gap-2.5 px-4 active:cursor-grabbing"
            onPointerDown={onDragHandlePointerDown}
            onPointerMove={onDragHandlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <span className="h-2 w-2 shrink-0 bg-[#71449f]" aria-hidden />
            <h2
              id="fh-layer-style-title"
              className="truncate text-[10px] font-black uppercase tracking-[0.12em] text-white"
            >
              Estilo de capa
            </h2>
          </div>
          <button
            type="button"
            className="flex w-10 shrink-0 items-center justify-center border-l border-white/10 text-white/45 transition hover:bg-white/[0.06] hover:text-white"
            aria-label="Cerrar"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onCancel}
          >
            <X size={15} strokeWidth={2} />
          </button>
        </header>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {sidebar}
          <div
            key={tab}
            className="custom-scrollbar min-h-0 flex-1 overflow-y-auto"
            role="tabpanel"
            id={`fh-layer-style-panel-${tab}`}
            aria-labelledby={`fh-layer-style-tab-${tab}`}
          >
            {panel}
          </div>
        </div>
        <footer className="flex h-10 shrink-0 items-stretch justify-end divide-x divide-white/10 border-t border-white/10 bg-white/[0.04]">
          <button
            type="button"
            className="px-4 text-[9px] font-black uppercase tracking-[0.1em] text-white/45 transition hover:bg-white/[0.06] hover:text-white"
            onClick={onReset}
          >
            Reiniciar
          </button>
          <button
            type="button"
            className="px-4 text-[9px] font-black uppercase tracking-[0.1em] text-white/45 transition hover:bg-white/[0.06] hover:text-white"
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="bg-[#71449f] px-6 text-[9px] font-black uppercase tracking-[0.1em] text-white transition hover:bg-[#8055b0]"
            onClick={onOk}
          >
            OK
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
