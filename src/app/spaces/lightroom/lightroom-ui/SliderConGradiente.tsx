"use client";

import React from "react";
import type { LightroomSlider } from "../lightroom-develop-settings";
import {
  bidirectionalFillStyle,
  LIGHTROOM_SLIDER_MAX,
  LIGHTROOM_SLIDER_MIN,
} from "../lightroom-develop-settings";
import { LightroomScrubValue } from "./LightroomScrubValue";

export type SliderConGradienteProps = {
  label: string;
  value: LightroomSlider;
  trackGradient: string;
  disabled?: boolean;
  onChange: (v: LightroomSlider) => void;
  formatValue?: (v: LightroomSlider) => string;
};

export function SliderConGradiente({
  label,
  value,
  trackGradient,
  disabled,
  onChange,
  formatValue,
}: SliderConGradienteProps) {
  const onReset = () => onChange(0);
  const fill = bidirectionalFillStyle(value);

  return (
    <label className="lightroom-develop-controls__row nodrag lr-slider-grad">
      <span className="lightroom-develop-controls__label">{label}</span>
      <div className="lr-slider-grad__track-wrap">
        <div className="lr-slider-grad__track" style={{ background: trackGradient }} />
        <div className="lr-slider-bidir__center lr-slider-grad__center" />
        <div className="lr-slider-bidir__fill lr-slider-grad__fill" style={fill} />
        <input
          type="range"
          min={LIGHTROOM_SLIDER_MIN}
          max={LIGHTROOM_SLIDER_MAX}
          step={0.5}
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
        min={LIGHTROOM_SLIDER_MIN}
        max={LIGHTROOM_SLIDER_MAX}
        disabled={disabled}
        formatDisplay={formatValue ?? ((v) => (v > 0 ? `+${v}` : String(v)))}
        onChange={onChange}
        onReset={onReset}
      />
    </label>
  );
}
