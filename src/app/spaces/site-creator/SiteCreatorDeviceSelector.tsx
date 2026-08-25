"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
}

function DeviceSilhouette({ width, height, active }: { width: number; height: number; active?: boolean }) {
  const max = 28;
  const ratio = width / height;
  const w = ratio >= 1 ? max : max * ratio;
  const h = ratio >= 1 ? max / ratio : max;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-sm border ${
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
}: SiteCreatorDeviceSelectorProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ left: number; top: number } | null>(null);
  const presets = devicePresetsForBand(band);

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
    if (!open || !triggerRef.current) {
      setPopoverPos(null);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    setPopoverPos({ left: rect.left, top: rect.top - 8 });
  }, [open]);

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
        className="site-creator-floating-panel pointer-events-auto fixed z-[100060] w-[220px] -translate-y-full rounded-lg border border-white/12 bg-[#101820] p-2 shadow-xl"
        style={{ left: popoverPos.left, top: popoverPos.top }}
      >
        <ul className="flex flex-col gap-0.5">
          {presets.map((preset) => {
            const selected = config.sizeId === preset.id;
            return (
              <li key={preset.id}>
                <button
                  type="button"
                  data-testid={`site-creator-device-option-${band}-${preset.id}`}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition ${
                    selected ? "bg-white/10 text-white" : "text-white/75 hover:bg-white/6"
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
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition ${
                config.sizeId === "custom" ? "bg-white/10 text-white" : "text-white/75 hover:bg-white/6"
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
          <div className="mt-2 flex flex-col gap-2 border-t border-white/10 pt-2">
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
                className="h-7 flex-1 rounded border border-white/12 bg-white/5 px-2 text-[11px] font-semibold text-white outline-none focus:border-white/30"
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
                className="h-7 flex-1 rounded border border-white/12 bg-white/5 px-2 text-[11px] font-semibold text-white outline-none focus:border-white/30"
                min={320}
              />
            </label>
          </div>
        ) : null}
      </div>
    ) : null;

  const shellClass = `flex max-w-[220px] items-center rounded text-[10px] font-semibold tracking-wide transition ${
    active ? "bg-white/12 text-white" : "text-white/50 hover:bg-white/6 hover:text-white/80"
  }`;
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
          ref={triggerRef}
          type="button"
          data-testid={`site-creator-device-trigger-${band}`}
          className={`${shellClass} gap-1 px-2 py-1`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onActivate()}
        >
          {label}
        </button>
      ) : (
        <div ref={triggerRef} className={shellClass}>
          <button
            type="button"
            data-testid={`site-creator-device-trigger-${band}`}
            className="flex min-w-0 flex-1 items-center px-2 py-1 text-left"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              onActivate();
              setOpen(false);
            }}
          >
            {label}
          </button>
          <button
            type="button"
            data-testid={`site-creator-device-menu-${band}`}
            aria-label={`Elegir tamaño de ${bandLabel}`}
            aria-expanded={open}
            aria-haspopup="menu"
            className="shrink-0 px-1.5 py-1 text-white/35 hover:text-white/80"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              onActivate();
              setOpen((v) => !v);
            }}
          >
            <span aria-hidden>▾</span>
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
}: {
  orientation: SiteCreatorDeviceOrientation;
  visible: boolean;
  onChange: (orientation: SiteCreatorDeviceOrientation) => void;
}) {
  if (!visible) return null;
  const next = orientation === "portrait" ? "landscape" : "portrait";
  return (
    <button
      type="button"
      data-testid="site-creator-orientation-toggle"
      className="rounded border border-white/12 px-2 py-0.5 text-[10px] font-semibold text-white/65 transition hover:border-white/25 hover:text-white"
      title={orientation === "portrait" ? "Cambiar a horizontal" : "Cambiar a vertical"}
      onClick={() => onChange(next)}
    >
      {orientation === "portrait" ? "Vertical" : "Horizontal"}
    </button>
  );
}

export type { SiteCreatorViewportBand };
