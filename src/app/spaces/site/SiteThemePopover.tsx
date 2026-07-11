"use client";

import React from "react";
import { X } from "lucide-react";
import type { SiteAdnContext } from "@/lib/site/site-adn";
import type { ThemeState } from "@/lib/site/site-types";
import { SiteScrubNumberInput } from "./SiteScrubNumberInput";

export function SiteThemePopover({
  theme,
  brandConnected,
  brandName,
  motionDnaSource,
  onClose,
  onFinishPreset,
  onRhythmChange,
  onRadiusChange,
  onPolarityChange,
  onMotionIntensityChange,
  onMotionDnaChange,
  onReducedMotionChange,
  onFillBrandContent,
  onOpenLedger,
}: {
  theme: ThemeState;
  brandConnected: boolean;
  brandName?: string;
  motionDnaSource?: string;
  onClose: () => void;
  onFinishPreset: (preset: ThemeState["finishPreset"]) => void;
  onRhythmChange: (rhythm: ThemeState["dials"]["rhythm"]) => void;
  onRadiusChange: (radius: ThemeState["dials"]["radius"]) => void;
  onPolarityChange: (polarity: ThemeState["dials"]["polarity"]) => void;
  onMotionIntensityChange: (intensity: 0 | 1 | 2) => void;
  onMotionDnaChange: (dna: ThemeState["motionDNA"]) => void;
  onReducedMotionChange: (value: boolean) => void;
  onFillBrandContent?: () => void;
  onOpenLedger?: () => void;
}) {
  const finishPresets: Array<NonNullable<ThemeState["finishPreset"]>> = ["editorial", "impact", "minimal"];
  const rhythms: ThemeState["dials"]["rhythm"][] = ["compact", "normal", "airy"];
  const radii: ThemeState["dials"]["radius"][] = ["none", "soft", "round"];
  const polarities: ThemeState["dials"]["polarity"][] = ["auto", "light", "dark"];
  const motionDnas: ThemeState["motionDNA"][] = ["soft", "expo", "bounce", "linear"];

  return (
    <div className="site-editor-popover site-editor-popover--theme" role="dialog" aria-label="Tema">
      <header className="site-editor-popover__head">
        <h2 className="site-editor-popover__title">Tema</h2>
        <button type="button" className="site-editor-popover__close" onClick={onClose} aria-label="Cerrar">
          <X size={16} />
        </button>
      </header>

      <div className="site-editor-popover__body">
        <section className="site-editor-popover__section">
          <p className="site-editor-popover__label">Marca</p>
          <p className="site-editor-popover__value">
            {brandConnected ? brandName?.trim() || "Genoma conectado" : "Tema neutro Foldder"}
          </p>
          {onFillBrandContent && brandConnected ? (
            <button type="button" className="site-editor-popover__link-btn" onClick={onFillBrandContent}>
              Rellenar contenido desde marca
            </button>
          ) : null}
        </section>

        <section className="site-editor-popover__section">
          <p className="site-editor-popover__label">Acabado</p>
          <div className="site-editor-popover__seg">
            {finishPresets.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`site-editor-popover__seg-btn${theme.finishPreset === preset ? " is-active" : ""}`}
                onClick={() => onFinishPreset(preset)}
              >
                {preset}
              </button>
            ))}
          </div>
        </section>

        <section className="site-editor-popover__section">
          <p className="site-editor-popover__label">Ritmo</p>
          <div className="site-editor-popover__seg">
            {rhythms.map((rhythm) => (
              <button
                key={rhythm}
                type="button"
                className={`site-editor-popover__seg-btn${theme.dials.rhythm === rhythm ? " is-active" : ""}`}
                onClick={() => onRhythmChange(rhythm)}
              >
                {rhythm}
              </button>
            ))}
          </div>
        </section>

        <section className="site-editor-popover__section">
          <p className="site-editor-popover__label">Radio</p>
          <div className="site-editor-popover__seg">
            {radii.map((radius) => (
              <button
                key={radius}
                type="button"
                className={`site-editor-popover__seg-btn${theme.dials.radius === radius ? " is-active" : ""}`}
                onClick={() => onRadiusChange(radius)}
              >
                {radius}
              </button>
            ))}
          </div>
        </section>

        <section className="site-editor-popover__section">
          <p className="site-editor-popover__label">Polaridad</p>
          <div className="site-editor-popover__seg">
            {polarities.map((polarity) => (
              <button
                key={polarity}
                type="button"
                className={`site-editor-popover__seg-btn${theme.dials.polarity === polarity ? " is-active" : ""}`}
                onClick={() => onPolarityChange(polarity)}
              >
                {polarity}
              </button>
            ))}
          </div>
        </section>

        <section className="site-editor-popover__section">
          <p className="site-editor-popover__label">Motion DNA</p>
          <p className="site-editor-popover__hint">{motionDnaSource?.trim() || "Inferido del genoma"}</p>
          <div className="site-editor-popover__seg">
            {motionDnas.map((dna) => (
              <button
                key={dna}
                type="button"
                className={`site-editor-popover__seg-btn${theme.motionDNA === dna ? " is-active" : ""}`}
                onClick={() => onMotionDnaChange(dna)}
              >
                {dna}
              </button>
            ))}
          </div>
          <label className="site-editor-popover__field">
            <span>Intensidad</span>
            <SiteScrubNumberInput
              value={theme.dials.motionIntensity}
              min={0}
              max={2}
              step={1}
              onKeyboardCommit={(n) =>
                onMotionIntensityChange(Math.min(2, Math.max(0, Math.round(n))) as 0 | 1 | 2)
              }
              onScrubLive={(n) =>
                onMotionIntensityChange(Math.min(2, Math.max(0, Math.round(n))) as 0 | 1 | 2)
              }
              onScrubEnd={() => {}}
            />
          </label>
          <label className="site-editor-popover__check">
            <input
              type="checkbox"
              checked={theme.respectReducedMotion}
              onChange={(event) => onReducedMotionChange(event.target.checked)}
            />
            Respetar reduced motion
          </label>
        </section>

        {onOpenLedger ? (
          <button type="button" className="site-editor-popover__link-btn" onClick={onOpenLedger}>
            Abrir theme ledger
          </button>
        ) : null}
      </div>
    </div>
  );
}
