"use client";

import React from "react";
import type { LightroomSlider } from "../lightroom-develop-settings";
import {
  bidirectionalFillStyle,
  LIGHTROOM_SLIDER_MAX,
  LIGHTROOM_SLIDER_MIN,
} from "../lightroom-develop-settings";
import { LightroomScrubValue } from "./LightroomScrubValue";

export type SliderBidireccionalProps = {
  label: string;
  value: LightroomSlider;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onChange: (v: LightroomSlider) => void;
  formatValue?: (v: LightroomSlider) => string;
  className?: string;
};

export function SliderBidireccional({
  label,
  value,
  min = LIGHTROOM_SLIDER_MIN,
  max = LIGHTROOM_SLIDER_MAX,
  step = 1,
  disabled,
  onChange,
  formatValue,
  className = "",
}: SliderBidireccionalProps) {
  const onReset = () => onChange(0);
  const fill = bidirectionalFillStyle(value, min, max);
  const rangeStep = step < 1 ? step : 0.5;

  return (
    <label className={`lightroom-develop-controls__row nodrag lr-slider-bidir ${className}`.trim()}>
      <span className="lightroom-develop-controls__label">{label}</span>
      <div className="lr-slider-bidir__track-wrap">
        <div className="lr-slider-bidir__track">
          <div className="lr-slider-bidir__center" />
          <div
            className="lr-slider-bidir__fill"
            style={{
              left: fill.left,
              width: fill.width,
              background: value >= 0 ? "rgba(46,125,154,0.85)" : "rgba(148,163,184,0.75)",
            }}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={rangeStep}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Math.round(Number(e.target.value)))}
          onDoubleClick={onReset}
          className="lr-slider-bidir__input"
          aria-label={label}
        />
      </div>
      <LightroomScrubValue
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        formatDisplay={formatValue ?? ((v) => (v > 0 ? `+${v}` : String(v)))}
        onChange={onChange}
        onReset={onReset}
      />
    </label>
  );
}
