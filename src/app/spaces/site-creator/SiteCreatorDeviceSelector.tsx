"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  RotateCw,
  Smartphone,
  Tablet,
} from "lucide-react";
import { ScrubNumberInput } from "@/app/spaces/ScrubNumberInput";
import { floatingPressHandlers, isNodeInsideRefs } from "./site-creator-floating-press";
import {
  clampDeviceHeight,
  clampViewportWidth,
  devicePresetsForBand,
  type SiteCreatorDeviceConfig,
  type SiteCreatorDeviceOrientation,
  type SiteCreatorDeviceSizeId,
  type SiteCreatorViewportBand,
} from "./site-creator-viewport";

export interface SiteCreatorDeviceSelectorProps {
  band: "tablet" | "mobile";
  bandLabel: string;
  active: boolean;
  config: SiteCreatorDeviceConfig;
  referenceWidth: number;
  resolvedWidth: number;
  resolvedHeight: number;
  sizeLabel: string;
  onActivate: () => void;
  onConfigChange: (config: SiteCreatorDeviceConfig) => void;
  /** Capa flotante del Studio (por encima del canvas). */
  portalHost?: HTMLElement | null;
  /** Solo cambia de vista, sin abrir el menú de dispositivo. */
  selectOnly?: boolean;
  /** Versión iconográfica para la barra superior del Studio. */
  compact?: boolean;
}

function DeviceSilhouette({ width, height, active }: { width: number; height: number; active?: boolean }) {
  const max = 28;
  const ratio = width / height;
  const w = ratio >= 1 ? max : max * ratio;
  const h = ratio >= 1 ? max / ratio : max;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center border ${
        active ? "border-emerald-400/70 bg-emerald-400/10" : "border-white/20 bg-white/5"
      }`}
      style={{ width: w, height: h }}
      aria-hidden
    />
  );
}

export function SiteCreatorDeviceSelector({
  band,
  bandLabel,
  active,
  config,
  referenceWidth,
  resolvedWidth,
  resolvedHeight,
  sizeLabel,
  onActivate,
  onConfigChange,
  portalHost = null,
  selectOnly = false,
  compact = false,
}: SiteCreatorDeviceSelectorProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ left: number; top: number } | null>(null);
  const presets = devicePresetsForBand(band);
  const DeviceIcon = band === "tablet" ? Tablet : Smartphone;

  useEffect(() => {
    if (!open) return;
    let onDocPointerDown: ((e: PointerEvent) => void) | null = null;
    let onKey: ((e: KeyboardEvent) => void) | null = null;
    const timer = window.setTimeout(() => {
      onDocPointerDown = (e: PointerEvent) => {
        if (isNodeInsideRefs(e.target, [triggerRef, popoverRef])) return;
        setOpen(false);
      };
      onKey = (e: KeyboardEvent) => {
        if (e.key !== "Escape") return;
        e.stopPropagation();
        setOpen(false);
      };
      document.addEventListener("pointerdown", onDocPointerDown);
      window.addEventListener("keydown", onKey, true);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      if (onDocPointerDown) document.removeEventListener("pointerdown", onDocPointerDown);
      if (onKey) window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPopoverPos({
      left: rect.left,
      top: compact ? rect.bottom + 8 : rect.top - 8,
    });
  }, [compact, open]);

  const selectSize = (sizeId: SiteCreatorDeviceSizeId) => {
    onActivate();
    if (sizeId === "custom") {
      onConfigChange({ ...config, sizeId: "custom" });
      return;
    }
    const preset = presets.find((p) => p.id === sizeId);
    if (!preset) return;
    onConfigChange({
      ...config,
      sizeId,
      customWidth: preset.width,
      customHeight: preset.height,
    });
    setOpen(false);
  };

  const popover =
    open && popoverPos ? (
      <div
        ref={popoverRef}
        data-site-creator-floating-ui="true"
        data-testid={`site-creator-device-popover-${band}`}
        className={`site-creator-floating-panel pointer-events-auto fixed z-[100060] w-[240px] border border-white/15 bg-[#101820] shadow-[0_16px_40px_rgba(0,0,0,0.45)] ${
          compact ? "" : "-translate-y-full"
        }`}
        style={{ left: popoverPos.left, top: popoverPos.top }}
      >
        <div className="flex h-11 items-center gap-2.5 border-b border-white/10 px-3">
          <DeviceIcon className="h-4 w-4 shrink-0 text-white/70" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/75">
              {bandLabel}
            </div>
            <div className="truncate text-[10px] tabular-nums text-white/35">
              {sizeLabel} · {resolvedWidth} × {resolvedHeight}
            </div>
          </div>
        </div>
        <ul className="divide-y divide-white/[0.06]">
          {presets.map((preset) => {
            const selected = config.sizeId === preset.id;
            return (
              <li key={preset.id}>
                <button
                  type="button"
                  data-testid={`site-creator-device-option-${band}-${preset.id}`}
                  className={`flex h-11 w-full items-center gap-2.5 border-l-2 px-3 text-left transition ${
                    selected
                      ? "border-[#22d3ee] bg-white/[0.08] text-white"
                      : "border-transparent text-white/65 hover:bg-white/[0.04] hover:text-white"
                  }`}
                  {...floatingPressHandlers(() => selectSize(preset.id))}
                >
                  <DeviceSilhouette width={preset.width} height={preset.height} active={selected} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-semibold">{preset.label}</span>
                    <span className="block text-[10px] text-white/45 tabular-nums">
                      {preset.width} × {preset.height}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              data-testid={`site-creator-device-option-${band}-custom`}
              className={`flex h-11 w-full items-center gap-2.5 border-l-2 px-3 text-left transition ${
                config.sizeId === "custom"
                  ? "border-[#22d3ee] bg-white/[0.08] text-white"
                  : "border-transparent text-white/65 hover:bg-white/[0.04] hover:text-white"
              }`}
              {...floatingPressHandlers(() => selectSize("custom"))}
            >
              <DeviceSilhouette width={config.customWidth} height={config.customHeight} active={config.sizeId === "custom"} />
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold">Personalizado</span>
                <span className="block text-[10px] text-white/45">Ancho y alto manual</span>
              </span>
            </button>
          </li>
        </ul>
        {config.sizeId === "custom" ? (
          <div className="flex flex-col gap-2 border-t border-white/10 bg-black/15 p-3">
            <label className="flex items-center gap-2 text-[10px] text-white/55">
              <span className="w-10 shrink-0">Ancho</span>
              <ScrubNumberInput
                value={config.customWidth}
                step={1}
                roundFn={(v) => clampViewportWidth(v, referenceWidth)}
                onScrubLive={(v) =>
                  onConfigChange({
                    ...config,
                    customWidth: clampViewportWidth(v, referenceWidth),
                  })
                }
                onScrubEnd={() => undefined}
                onKeyboardCommit={(v) =>
                  onConfigChange({
                    ...config,
                    customWidth: clampViewportWidth(v, referenceWidth),
                  })
                }
                data-testid={`site-creator-device-custom-width-${band}`}
                className="h-7 flex-1 border border-white/12 bg-white/5 px-2 text-[11px] font-semibold text-white outline-none focus:border-[#22d3ee]/60"
                min={280}
              />
            </label>
            <label className="flex items-center gap-2 text-[10px] text-white/55">
              <span className="w-10 shrink-0">Alto</span>
              <ScrubNumberInput
                value={config.customHeight}
                step={1}
                roundFn={clampDeviceHeight}
                onScrubLive={(v) => onConfigChange({ ...config, customHeight: clampDeviceHeight(v) })}
                onScrubEnd={() => undefined}
                onKeyboardCommit={(v) => onConfigChange({ ...config, customHeight: clampDeviceHeight(v) })}
                data-testid={`site-creator-device-custom-height-${band}`}
                className="h-7 flex-1 border border-white/12 bg-white/5 px-2 text-[11px] font-semibold text-white outline-none focus:border-[#22d3ee]/60"
                min={320}
              />
            </label>
          </div>
        ) : null}
      </div>
    ) : null;

  const shellClass = `flex max-w-[220px] items-center text-[10px] font-semibold tracking-wide transition ${
    active ? "bg-white/12 text-white" : "text-white/50 hover:bg-white/6 hover:text-white/80"
  } ${compact ? "border-l border-white/[0.06]" : ""}`;
  const label = (
    <span className="truncate">
      {bandLabel} · {sizeLabel}{" "}
      <span className="font-normal text-white/45 tabular-nums">
        {resolvedWidth} × {resolvedHeight}
      </span>
    </span>
  );
  return (
    <>
      {selectOnly ? (
        <button
          ref={(node) => {
            triggerRef.current = node;
          }}
          type="button"
          data-testid={`site-creator-device-trigger-${band}`}
          className={`${shellClass} ${compact ? "h-7 w-11 justify-center p-0" : "gap-1 px-2 py-1"}`}
          aria-label={bandLabel}
          title={`${bandLabel} · ${sizeLabel} · ${resolvedWidth} × ${resolvedHeight}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onActivate()}
        >
          {compact ? <DeviceIcon className="h-3.5 w-3.5" aria-hidden /> : label}
        </button>
      ) : (
        <div
          ref={(node) => {
            triggerRef.current = node;
          }}
          className={`${shellClass} ${compact ? "h-7" : ""}`}
        >
          <button
            type="button"
            data-testid={`site-creator-device-trigger-${band}`}
            className={`flex min-w-0 flex-1 items-center ${
              compact ? "h-7 w-11 justify-center p-0" : "px-2 py-1 text-left"
            }`}
            aria-label={bandLabel}
            title={`${bandLabel} · ${sizeLabel} · ${resolvedWidth} × ${resolvedHeight}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              onActivate();
              setOpen(false);
            }}
          >
            {compact ? <DeviceIcon className="h-3.5 w-3.5" aria-hidden /> : label}
          </button>
          <button
            type="button"
            data-testid={`site-creator-device-menu-${band}`}
            aria-label={`Elegir tamaño de ${bandLabel}`}
            aria-expanded={open}
            aria-haspopup="menu"
            className={`shrink-0 text-white/35 hover:text-white/80 ${
              compact ? "h-7 w-6 p-0" : "px-1.5 py-1"
            }`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              onActivate();
              setOpen((v) => !v);
            }}
          >
            {compact ? (
              <ChevronDown
                className={`h-2.5 w-2.5 transition-transform ${open ? "rotate-180" : ""}`}
                aria-hidden
              />
            ) : (
              <span aria-hidden>▾</span>
            )}
          </button>
        </div>
      )}
      {typeof document !== "undefined" && popover
        ? createPortal(popover, portalHost ?? document.body)
        : null}
    </>
  );
}

export function SiteCreatorOrientationToggle({
  orientation,
  onChange,
  visible,
  compact = false,
}: {
  orientation: SiteCreatorDeviceOrientation;
  visible: boolean;
  compact?: boolean;
  onChange: (orientation: SiteCreatorDeviceOrientation) => void;
}) {
  if (!visible && !compact) return null;
  const next = orientation === "portrait" ? "landscape" : "portrait";
  return (
    <button
      type="button"
      data-testid="site-creator-orientation-toggle"
      disabled={!visible}
      aria-label={
        visible
          ? orientation === "portrait"
            ? "Cambiar a horizontal"
            : "Cambiar a vertical"
          : "Rotación disponible en Tablet y Móvil"
      }
      className={`font-semibold text-white/55 transition hover:bg-white/[0.06] hover:text-white ${
        compact
          ? `flex h-7 w-11 items-center justify-center border-l border-white/10 p-0 ${
              visible ? "" : "cursor-default opacity-20"
            }`
          : "border border-white/12 px-2 py-0.5 text-[10px]"
      }`}
      title={
        visible
          ? orientation === "portrait"
            ? "Cambiar a horizontal"
            : "Cambiar a vertical"
          : "Rotación disponible en Tablet y Móvil"
      }
      onClick={() => onChange(next)}
    >
      {compact ? (
        <RotateCw className="h-3.5 w-3.5" aria-hidden />
      ) : orientation === "portrait" ? (
        "Vertical"
      ) : (
        "Horizontal"
      )}
    </button>
  );
}

export type { SiteCreatorViewportBand };
