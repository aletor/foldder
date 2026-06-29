"use client";

import React, { useRef, useState } from "react";
import { Upload } from "lucide-react";
import type { DevelopSettings } from "../lightroom-develop-settings";
import { listCreativeLuts, registerCreativeCubeFile } from "../lightroom-lut-registry";
import { LightroomScrubValue } from "./LightroomScrubValue";

export type CreativeLutPanelProps = {
  settings: DevelopSettings;
  disabled?: boolean;
  onChange: (patch: Partial<DevelopSettings["creativeLut"]>) => void;
};

export function CreativeLutPanel({ settings, disabled, onChange }: CreativeLutPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [, tick] = useState(0);
  const luts = listCreativeLuts();
  const cl = settings.creativeLut;
  const active = luts.find((l) => l.id === cl.lutId);

  const onPickCube = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const lut = registerCreativeCubeFile(text, file.name);
      onChange({ lutId: lut.id, enabled: true, intensity: cl.intensity || 100 });
      tick((t) => t + 1);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "No se pudo leer el .cube");
    }
  };

  return (
    <div className="lr-creative-lut nodrag">
      <p className="lightroom-studio__eyebrow">Look / LUT creativa</p>
      <p className="lightroom-studio__hint">Acabado post-sRGB (no sustituye al perfil de cámara).</p>
      <button
        type="button"
        className="lightroom-studio__btn lightroom-studio__btn--ghost nodrag"
        disabled={disabled}
        onClick={() => fileRef.current?.click()}
      >
        <Upload size={14} />
        Cargar .cube…
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".cube,.CUBE"
        className="sr-only"
        onChange={(e) => void onPickCube(e.target.files?.[0] ?? null)}
      />

      {luts.length ? (
        <ul className="lr-creative-lut__list">
          {luts.map((lut) => (
            <li key={lut.id}>
              <button
                type="button"
                className={`lr-creative-lut__item${cl.lutId === lut.id ? " is-active" : ""}`}
                disabled={disabled}
                onClick={() => onChange({ lutId: lut.id, enabled: true })}
              >
                {lut.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {active ? (
        <>
          <label className="lightroom-develop-controls__row">
            <input
              type="checkbox"
              checked={cl.enabled}
              disabled={disabled}
              onChange={(e) => onChange({ enabled: e.target.checked })}
            />
            <span>Activar LUT ({active.name})</span>
          </label>
          <label className="lightroom-develop-controls__row nodrag">
            <span className="lightroom-develop-controls__label">Intensidad</span>
            <input
              type="range"
              className="lightroom-develop-controls__slider"
              min={0}
              max={100}
              step={0.5}
              value={cl.intensity}
              disabled={disabled || !cl.enabled}
              onChange={(e) => onChange({ intensity: Math.round(Number(e.target.value)) })}
            />
            <LightroomScrubValue
              value={cl.intensity}
              min={0}
              max={100}
              disabled={disabled || !cl.enabled}
              formatDisplay={(v) => `${v}%`}
              onChange={(v) => onChange({ intensity: v })}
              onReset={() => onChange({ intensity: 100 })}
            />
          </label>
          <button
            type="button"
            className="lightroom-studio__btn lightroom-studio__btn--ghost nodrag"
            disabled={disabled}
            onClick={() => onChange({ enabled: false, lutId: null })}
          >
            Quitar LUT
          </button>
        </>
      ) : (
        <p className="lightroom-studio__hint">Sin LUT cargada. Usa emulaciones film / grades creativos sRGB.</p>
      )}
    </div>
  );
}
