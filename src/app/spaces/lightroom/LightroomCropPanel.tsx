"use client";

import React from "react";
import type { CropAspectRatio, LightroomCropSettings } from "./lightroom-crop-types";
import { aspectRatioValue } from "./lightroom-crop-types";
import { SliderBidireccional } from "./lightroom-ui/SliderBidireccional";

const RATIOS: Array<{ id: CropAspectRatio; label: string }> = [
  { id: "free", label: "Libre" },
  { id: "original", label: "Original" },
  { id: "1:1", label: "1:1" },
  { id: "16:9", label: "16:9" },
  { id: "3:2", label: "3:2" },
  { id: "4:3", label: "4:3" },
];

export type LightroomCropPanelProps = {
  crop: LightroomCropSettings;
  imageWidth: number;
  imageHeight: number;
  onChange: (crop: LightroomCropSettings) => void;
};

export function LightroomCropPanel({ crop, imageWidth, imageHeight, onChange }: LightroomCropPanelProps) {
  const applyRatio = (ratio: CropAspectRatio) => {
    const ar = aspectRatioValue(ratio, imageWidth, imageHeight);
    if (!ar) {
      onChange({ ...crop, aspectRatio: ratio });
      return;
    }
    const cx = crop.x + crop.w / 2;
    const cy = crop.y + crop.h / 2;
    let w = crop.w;
    let h = w / ar;
    if (h > 1) {
      h = 0.9;
      w = h * ar;
    }
    onChange({
      ...crop,
      aspectRatio: ratio,
      w,
      h,
      x: Math.max(0, Math.min(1 - w, cx - w / 2)),
      y: Math.max(0, Math.min(1 - h, cy - h / 2)),
    });
  };

  return (
    <div className="lr-crop-panel nodrag">
      <label className="lightroom-develop-controls__row">
        <input
          type="checkbox"
          checked={crop.enabled}
          onChange={(e) => onChange({ ...crop, enabled: e.target.checked })}
        />
        <span>Activar recorte</span>
      </label>
      <p className="lightroom-studio__eyebrow">Ratio</p>
      <div className="lightroom-mask-panel__tools">
        {RATIOS.map((r) => (
          <button
            key={r.id}
            type="button"
            className={`lightroom-mask-panel__tool${crop.aspectRatio === r.id ? " is-active" : ""}`}
            onClick={() => applyRatio(r.id)}
          >
            {r.label}
          </button>
        ))}
      </div>
      <SliderBidireccional
        label="Ángulo"
        value={Math.round(crop.angle)}
        onChange={(v) => onChange({ ...crop, angle: v })}
      />
    </div>
  );
}
