"use client";

import React from "react";
import type { GenomaLogoPlinthMode } from "@/lib/genoma/genoma-logo-plinth";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";

const MODES: { id: GenomaLogoPlinthMode; label: string }[] = [
  { id: "auto", label: genomaLocaleEs.logoPlinthAuto },
  { id: "light", label: genomaLocaleEs.logoPlinthLight },
  { id: "dark", label: genomaLocaleEs.logoPlinthDark },
  { id: "checker", label: genomaLocaleEs.logoPlinthChecker },
];

export function GenomaLogoPlinthToggle({
  mode,
  onChange,
}: {
  mode: GenomaLogoPlinthMode;
  onChange: (mode: GenomaLogoPlinthMode) => void;
}) {
  return (
    <div className="genoma-v2-logo-plinth-toggle" role="group" aria-label={genomaLocaleEs.logoPlinthLabel}>
      {MODES.map((entry) => (
        <button
          key={entry.id}
          type="button"
          className={`genoma-v2-logo-plinth-toggle__btn${mode === entry.id ? " is-active" : ""}`}
          aria-pressed={mode === entry.id}
          onClick={() => onChange(entry.id)}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}
