"use client";

import React from "react";
import { WB_PRESETS, type WbPresetId } from "./develop-presets";

export type WbControlsProps = {
  activePreset?: WbPresetId;
  eyedropperActive?: boolean;
  compareBefore?: boolean;
  disabled?: boolean;
  onPreset: (presetId: WbPresetId) => void;
  onToggleEyedropper: () => void;
};

export function WbControls({
  activePreset = "auto",
  eyedropperActive,
  compareBefore,
  disabled,
  onPreset,
  onToggleEyedropper,
}: WbControlsProps) {
  return (
    <div className="lr-wb-controls nodrag">
      <label className="lightroom-develop-controls__row">
        <span className="lightroom-develop-controls__label">WB preset</span>
        <select
          className="lightroom-mask-panel__select"
          value={activePreset}
          disabled={disabled}
          onChange={(e) => onPreset(e.target.value as WbPresetId)}
        >
          {WB_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className={`lightroom-studio__btn lightroom-studio__btn--ghost lr-wb-controls__dropper${eyedropperActive ? " is-active" : ""}`}
        disabled={disabled || compareBefore}
        onClick={onToggleEyedropper}
        title={
          compareBefore
            ? "Desactiva la comparación antes/después para usar el cuentagotas"
            : "Cuentagotas: clic en gris neutro de la imagen"
        }
      >
        Cuentagotas WB
      </button>
    </div>
  );
}
