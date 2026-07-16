"use client";

import React from "react";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";

type BrandKitSidebarViewModeProps = {
  presentationMode: boolean;
  onChange: (presentation: boolean) => void;
  compact?: boolean;
};

export function BrandKitSidebarViewMode({
  presentationMode,
  onChange,
  compact = false,
}: BrandKitSidebarViewModeProps) {
  if (compact) {
    return (
      <button
        type="button"
        className={`brandKit-sidebar-view-rail${presentationMode ? " is-presentation" : ""}`}
        title={brandKitLocaleEs.presentationModeHint}
        onClick={() => onChange(!presentationMode)}
        aria-pressed={presentationMode}
      >
        {presentationMode ? "P" : "E"}
      </button>
    );
  }

  return (
    <section className="brandKit-sidebar-view" aria-label={brandKitLocaleEs.sidebarViewLabel}>
      <p className="brandKit-sidebar-view__label">{brandKitLocaleEs.sidebarViewLabel}</p>
      <div className="brandKit-sidebar-view__toggle" role="group">
        <button
          type="button"
          className={`brandKit-sidebar-view__btn${!presentationMode ? " is-active" : ""}`}
          aria-pressed={!presentationMode}
          onClick={() => onChange(false)}
        >
          {brandKitLocaleEs.sidebarViewEdit}
        </button>
        <button
          type="button"
          className={`brandKit-sidebar-view__btn${presentationMode ? " is-active" : ""}`}
          aria-pressed={presentationMode}
          onClick={() => onChange(true)}
        >
          {brandKitLocaleEs.sidebarViewPresentation}
        </button>
      </div>
    </section>
  );
}
