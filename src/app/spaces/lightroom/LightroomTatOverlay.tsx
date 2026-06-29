"use client";

import React, { useCallback, useRef } from "react";
import type { DevelopSettings, HslColorChannel } from "./lightroom-develop-settings";
import { patchDevelopSettings, LIGHTROOM_SLIDER_MAX, LIGHTROOM_SLIDER_MIN } from "./lightroom-develop-settings";
import { nearestHslChannel, tatDeltaToSlider } from "./lightroom-hsl-tat";
import { sampleColorAt } from "./lightroom-mask-alpha";

export type LightroomTatOverlayProps = {
  active: boolean;
  mode: "saturation" | "hue" | "luminance";
  settings: DevelopSettings;
  sourcePixels: Uint8ClampedArray | null;
  width: number;
  height: number;
  onChange: (settings: DevelopSettings) => void;
};

export function LightroomTatOverlay({
  active,
  mode,
  settings,
  sourcePixels,
  width,
  height,
  onChange,
}: LightroomTatOverlayProps) {
  const dragRef = useRef<{ channel: HslColorChannel; startY: number; base: number } | null>(null);

  const sampleChannel = useCallback(
    (nx: number, ny: number): HslColorChannel | null => {
      if (!sourcePixels || width <= 0 || height <= 0) return null;
      const px = Math.floor(nx * (width - 1));
      const py = Math.floor(ny * (height - 1));
      const c = sampleColorAt(sourcePixels, width, px, py);
      return nearestHslChannel(c.r, c.g, c.b);
    },
    [sourcePixels, width, height],
  );

  const field = mode === "hue" ? "hue" : mode === "luminance" ? "luminance" : "saturation";

  const onPointerDown = (e: React.PointerEvent) => {
    if (!active) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const nx = (e.clientX - rect.left) / Math.max(rect.width, 1);
    const ny = (e.clientY - rect.top) / Math.max(rect.height, 1);
    const ch = sampleChannel(nx, ny);
    if (!ch) return;
    dragRef.current = { channel: ch, startY: e.clientY, base: settings.hsl[ch][field] };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || !active) return;
    const delta = tatDeltaToSlider(e.clientY - d.startY);
    onChange(
      patchDevelopSettings(settings, {
        hsl: { [d.channel]: { [field]: Math.max(LIGHTROOM_SLIDER_MIN, Math.min(LIGHTROOM_SLIDER_MAX, d.base + delta)) } },
      }),
    );
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  if (!active) return null;

  return (
    <div
      className="lightroom-mask-overlay lightroom-mask-overlay--dropper nodrag"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="lightroom-mask-overlay__dropper-hint">
        TAT HSL — arrastra verticalmente sobre un color ({mode})
      </div>
    </div>
  );
}
