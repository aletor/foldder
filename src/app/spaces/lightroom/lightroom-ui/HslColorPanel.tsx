"use client";

import React, { useState } from "react";
import type { DevelopSettings, HslColorChannel } from "../lightroom-develop-settings";
import { HSL_COLOR_CHANNELS } from "../lightroom-develop-settings";
import { SliderConGradiente } from "./SliderConGradiente";
import { HSL_SWATCH, hslTrackGradient } from "./hsl-gradients";

export type HslColorPanelProps = {
  hsl: DevelopSettings["hsl"];
  disabled?: boolean;
  onChange: (channel: HslColorChannel, key: "hue" | "saturation" | "luminance", value: number) => void;
};

export function HslColorPanel({ hsl, disabled, onChange }: HslColorPanelProps) {
  const [active, setActive] = useState<HslColorChannel>("red");

  return (
    <div className="lr-hsl-panel nodrag">
      <div className="lr-hsl-panel__swatches">
        {HSL_COLOR_CHANNELS.map((ch) => (
          <button
            key={ch}
            type="button"
            className={`lr-hsl-panel__swatch${active === ch ? " is-active" : ""}`}
            style={{ background: HSL_SWATCH[ch] }}
            title={ch}
            disabled={disabled}
            onClick={() => setActive(ch)}
            aria-label={ch}
          />
        ))}
      </div>
      <p className="lightroom-studio__eyebrow">{active}</p>
      <SliderConGradiente
        label="Tono"
        value={hsl[active].hue}
        trackGradient={hslTrackGradient(active, "hue")}
        disabled={disabled}
        onChange={(v) => onChange(active, "hue", v)}
      />
      <SliderConGradiente
        label="Sat."
        value={hsl[active].saturation}
        trackGradient={hslTrackGradient(active, "saturation")}
        disabled={disabled}
        onChange={(v) => onChange(active, "saturation", v)}
      />
      <SliderConGradiente
        label="Lum."
        value={hsl[active].luminance}
        trackGradient={hslTrackGradient(active, "luminance")}
        disabled={disabled}
        onChange={(v) => onChange(active, "luminance", v)}
      />
    </div>
  );
}
