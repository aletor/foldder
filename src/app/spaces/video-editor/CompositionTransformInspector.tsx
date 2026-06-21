"use client";

import React from "react";
import {
  compositionHasAnimation,
  getAggregatedKeyframeTimes,
  getPropertyKeyframeNavigation,
  hasPropertyKeyframeNearTime,
  type CompositionScalarProperty,
} from "./video-editor-composition-math";
import type { CompositionEasing, CompositionTransform, VideoEditorComposition } from "./video-editor-composition-types";
import { CompositionEasingPicker } from "./CompositionEasingPicker";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function KeyframeDiamond({
  active,
  enabled,
  onToggle,
}: {
  active: boolean;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      title={enabled ? "Auto-keyframe activo" : "Activar auto-keyframe"}
      onClick={onToggle}
      className={cx(
        "inline-flex h-4 w-4 shrink-0 items-center justify-center transition",
        enabled ? "opacity-100" : "opacity-35 hover:opacity-70",
      )}
    >
      <span
        className={cx(
          "h-2 w-2 rotate-45 border",
          active ? "border-amber-300 bg-amber-300/80" : "border-white/35 bg-transparent",
        )}
      />
    </button>
  );
}

function PropertyNav({
  onPrev,
  onNext,
  disabled,
}: {
  onPrev?: () => void;
  onNext?: () => void;
  disabled?: boolean;
}) {
  if (!onPrev && !onNext) return null;
  return (
    <span className="inline-flex shrink-0 gap-0.5">
      <button type="button" disabled={disabled || !onPrev} onClick={onPrev} className="px-0.5 text-[10px] text-white/35 hover:text-white/70 disabled:opacity-20">‹</button>
      <button type="button" disabled={disabled || !onNext} onClick={onNext} className="px-0.5 text-[10px] text-white/35 hover:text-white/70 disabled:opacity-20">›</button>
    </span>
  );
}

export function CompositionTransformInspector({
  composition,
  localTime,
  transform,
  transformPx,
  animateMode,
  keyframedProperties,
  onTogglePropertyKeyframe,
  onToggleAllTransformKeyframes,
  onPatchTransform,
  onPatchTransformPx,
  onSeekLocalTime,
  onDeleteKeyframesAtPlayhead,
  onAddKeyframeAtPlayhead,
  onPatchPropertyEasing,
  aspectLock,
  onToggleAspectLock,
  showCropPresets,
  cropPreset,
  onApplyCropPreset,
  formatTime,
}: {
  composition: VideoEditorComposition;
  localTime: number;
  transform: CompositionTransform;
  transformPx?: { x: number; y: number; width: number; height: number };
  animateMode: boolean;
  keyframedProperties: Set<CompositionScalarProperty>;
  onTogglePropertyKeyframe: (property: CompositionScalarProperty) => void;
  onToggleAllTransformKeyframes: () => void;
  onPatchTransform: (patch: Partial<CompositionTransform>) => void;
  onPatchTransformPx: (patch: { x?: number; y?: number; width?: number; height?: number }) => void;
  onSeekLocalTime: (time: number) => void;
  onDeleteKeyframesAtPlayhead: () => void;
  onAddKeyframeAtPlayhead: () => void;
  onPatchPropertyEasing: (property: CompositionScalarProperty, keyframeId: string, easing: CompositionEasing) => void;
  aspectLock: boolean;
  onToggleAspectLock: () => void;
  showCropPresets?: boolean;
  cropPreset?: "fit" | "fill" | "custom";
  onApplyCropPreset?: (preset: "fit" | "fill" | "custom") => void;
  formatTime: (seconds: number) => string;
}) {
  const aggregated = getAggregatedKeyframeTimes(composition);
  const animated = compositionHasAnimation(composition);

  const row = (
    property: CompositionScalarProperty,
    label: string,
    value: number,
    onChange: (value: number) => void,
    opts?: { step?: number; min?: number; max?: number },
  ) => {
    const nav = getPropertyKeyframeNavigation(composition, property, localTime);
    const active = hasPropertyKeyframeNearTime(composition, property, localTime);
    const enabled = keyframedProperties.has(property);
    const track = composition.tracks.find((item) => item.property === property);
    const easingKeyframe = track?.keyframes.find((kf) => Math.abs(kf.time - localTime) < 0.05)
      ?? track?.keyframes.filter((kf) => kf.time <= localTime + 0.001).at(-1);

    return (
      <div key={property} className="grid grid-cols-[16px_1fr_auto] items-center gap-1">
        <KeyframeDiamond
          active={active}
          enabled={enabled || animateMode}
          onToggle={() => onTogglePropertyKeyframe(property)}
        />
        <label className="grid gap-0.5">
          <span className="flex items-center justify-between text-[10px] text-white/40">
            <span>{label}</span>
            <PropertyNav
              onPrev={nav.prev !== undefined ? () => onSeekLocalTime(nav.prev!) : undefined}
              onNext={nav.next !== undefined ? () => onSeekLocalTime(nav.next!) : undefined}
            />
          </span>
          <input
            type="number"
            value={Number.isFinite(value) ? value : 0}
            step={opts?.step ?? 0.01}
            min={opts?.min}
            max={opts?.max}
            onChange={(event) => onChange(Number(event.target.value))}
            className="w-full rounded-none border border-white/10 bg-white/[0.055] px-2 py-1 text-[11px] text-white outline-none"
          />
        </label>
        {easingKeyframe && track && track.keyframes.some((kf) => kf.time > easingKeyframe.time) ? (
          <div className="w-[72px]">
            <CompositionEasingPicker
              value={easingKeyframe.easing}
              onChange={(easing) => onPatchPropertyEasing(property, easingKeyframe.id, easing)}
            />
          </div>
        ) : (
          <span className="w-[72px]" />
        )}
      </div>
    );
  };

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] pb-1">
        <span className="text-[10px] font-black uppercase tracking-[0.12em] text-white/40">Transform</span>
        <button
          type="button"
          title="Auto-keyframe en grupo Transform"
          onClick={onToggleAllTransformKeyframes}
          className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.08em] text-[#3a8f96]/90"
        >
          <span className={cx("h-2 w-2 rotate-45 border", animateMode ? "border-amber-300 bg-amber-300/70" : "border-white/30")} />
          Auto
        </button>
      </div>

      <div className="grid gap-1.5">
        {row("x", "Posición X (px)", transformPx?.x ?? 0, (v) => onPatchTransformPx({ x: v }), { step: 1 })}
        {row("y", "Posición Y (px)", transformPx?.y ?? 0, (v) => onPatchTransformPx({ y: v }), { step: 1 })}
        {row("width", "Zoom X (px)", transformPx?.width ?? 0, (v) => onPatchTransformPx({ width: v }), { step: 1, min: 1 })}
        {row("height", "Zoom Y (px)", transformPx?.height ?? 0, (v) => onPatchTransformPx({ height: v }), { step: 1, min: 1 })}
        <div className="flex justify-end">
          <button type="button" onClick={onToggleAspectLock} className={cx("text-[9px] font-black uppercase", aspectLock ? "text-[#3a8f96]" : "text-white/30")}>
            {aspectLock ? "Proporción bloqueada" : "Proporción libre"}
          </button>
        </div>
        {row("rotation", "Rotación (°)", transform.rotation, (v) => onPatchTransform({ rotation: v }), { step: 1 })}
        {row("anchorX", "Ancla X", transform.anchorX, (v) => onPatchTransform({ anchorX: Math.max(0, Math.min(1, v)) }), { step: 0.01, min: 0, max: 1 })}
        {row("anchorY", "Ancla Y", transform.anchorY, (v) => onPatchTransform({ anchorY: Math.max(0, Math.min(1, v)) }), { step: 0.01, min: 0, max: 1 })}
        {row("opacity", "Opacidad", transform.opacity, (v) => onPatchTransform({ opacity: Math.max(0, Math.min(1, v)) }), { step: 0.05, min: 0, max: 1 })}
      </div>

      <div className="flex flex-wrap gap-1 border-t border-white/[0.06] pt-1.5">
        <button
          type="button"
          onClick={() => onPatchTransform({ flipX: !transform.flipX })}
          className={cx("px-2 py-1 text-[9px] font-black uppercase", transform.flipX ? "bg-[#3a8f96]/20 text-white" : "text-white/45 hover:bg-white/[0.04]")}
        >
          Voltear H
        </button>
        <button
          type="button"
          onClick={() => onPatchTransform({ flipY: !transform.flipY })}
          className={cx("px-2 py-1 text-[9px] font-black uppercase", transform.flipY ? "bg-[#3a8f96]/20 text-white" : "text-white/45 hover:bg-white/[0.04]")}
        >
          Voltear V
        </button>
      </div>

      {showCropPresets && onApplyCropPreset ? (
        <div className="border-t border-white/[0.06] pt-1.5">
          <div className="mb-1 text-[10px] text-white/40">Recorte fuente</div>
          <div className="flex flex-wrap gap-0.5">
            {([
              ["fit", "Ajustar"],
              ["fill", "Rellenar"],
              ["custom", "Personalizado"],
            ] as const).map(([preset, label]) => (
              <button
                key={preset}
                type="button"
                onClick={() => onApplyCropPreset(preset)}
                className={cx(
                  "px-2 py-1 text-[9px] font-black uppercase tracking-[0.06em]",
                  cropPreset === preset ? "bg-[#3a8f96]/20 text-white" : "text-white/45 hover:bg-white/[0.04]",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="border-t border-white/[0.06] pt-1.5">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-[10px] text-white/40">Keyframes · {formatTime(localTime)}</span>
          <span className={cx("text-[9px] font-black uppercase", animateMode ? "text-amber-200/80" : "text-white/30")}>
            {animateMode ? "Auto-key ON" : "Auto-key OFF"}
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          <button type="button" onClick={onAddKeyframeAtPlayhead} className="px-2 py-1 text-[9px] font-black uppercase text-[#3a8f96]/90 hover:bg-white/[0.04]">
            ◆ Añadir
          </button>
          <button type="button" onClick={onDeleteKeyframesAtPlayhead} disabled={!aggregated.some((item) => Math.abs(item.time - localTime) < 0.05)} className="px-2 py-1 text-[9px] font-black uppercase text-rose-200/75 hover:bg-rose-500/10 disabled:opacity-30">
            Borrar
          </button>
        </div>
        {aggregated.length ? (
          <div className="mt-1 max-h-24 space-y-0.5 overflow-auto">
            {aggregated.map((item) => (
              <button
                key={item.time}
                type="button"
                onClick={() => onSeekLocalTime(item.time)}
                className={cx(
                  "flex w-full items-center justify-between px-1 py-0.5 text-left text-[10px] tabular-nums hover:bg-white/[0.04]",
                  Math.abs(item.time - localTime) < 0.05 ? "text-amber-200/90" : "text-white/50",
                )}
              >
                <span>{formatTime(item.time)}</span>
                <span className="truncate text-[9px] text-white/30">{item.properties.slice(0, 4).join(", ")}{item.properties.length > 4 ? "…" : ""}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-[10px] text-white/30">{animated ? "Sin tiempos agregados." : "Sin animación. Activa Auto-key, mueve el playhead y cambia propiedades."}</p>
        )}
      </div>
    </div>
  );
}
