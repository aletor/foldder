"use client";

import React from "react";
import type { BrandKitLogoPlinthMode } from "@/lib/brandkit/brand-kit-logo-plinth";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";

const MODES: { id: BrandKitLogoPlinthMode; label: string }[] = [
  { id: "auto", label: brandKitLocaleEs.logoPlinthAuto },
  { id: "light", label: brandKitLocaleEs.logoPlinthLight },
  { id: "dark", label: brandKitLocaleEs.logoPlinthDark },
  { id: "checker", label: brandKitLocaleEs.logoPlinthChecker },
];

export function BrandKitLogoPlinthToggle({
  mode,
  onChange,
}: {
  mode: BrandKitLogoPlinthMode;
  onChange: (mode: BrandKitLogoPlinthMode) => void;
}) {
  return (
    <div className="brandKit-v2-logo-plinth-toggle" role="group" aria-label={brandKitLocaleEs.logoPlinthLabel}>
      {MODES.map((entry) => (
        <button
          key={entry.id}
          type="button"
          className={`brandKit-v2-logo-plinth-toggle__btn${mode === entry.id ? " is-active" : ""}`}
          aria-pressed={mode === entry.id}
          onClick={() => onChange(entry.id)}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}
