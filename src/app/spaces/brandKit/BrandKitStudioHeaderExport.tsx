"use client";

import React, { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import type { BrandKitStudioMode } from "@/lib/brandkit/studio/brand-kit-studio-mode";
import { resolveStudioDefaultExportMode, studioHeaderExportIsMenu } from "@/lib/brandkit/studio/brand-kit-studio-export";
import {
  BRAND_KIT_STYLE_GUIDE_EXPORT_MODE_LABELS,
  BRAND_KIT_STYLE_GUIDE_EXPORT_MODE_HINTS,
  type BrandKitStyleGuideExportMode,
} from "@/lib/brandkit/projection/style-guide-export-types";

type BrandKitStudioHeaderExportProps = {
  studioMode: BrandKitStudioMode;
  canExport?: boolean;
  exportBlockedReason?: string | null;
  busy?: boolean;
  busyLabel?: string;
  onExportPdf: (mode: BrandKitStyleGuideExportMode) => void;
  onExportTokens?: () => void;
  onExportCompiled?: () => void;
};

export function BrandKitStudioHeaderExport({
  studioMode,
  canExport = false,
  exportBlockedReason,
  busy = false,
  busyLabel,
  onExportPdf,
  onExportTokens,
  onExportCompiled,
}: BrandKitStudioHeaderExportProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isMenu = studioHeaderExportIsMenu(studioMode);
  const defaultMode = resolveStudioDefaultExportMode(studioMode);
  const disabled = !canExport || busy;

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [menuOpen]);

  const primaryLabel = busy
    ? busyLabel ?? brandKitLocaleEs.downloadingPdf
    : isMenu
      ? BRAND_KIT_STYLE_GUIDE_EXPORT_MODE_LABELS[defaultMode]
      : BRAND_KIT_STYLE_GUIDE_EXPORT_MODE_LABELS.cliente;

  if (!isMenu) {
    return (
      <button
        type="button"
        className="brandKit-studio-global-header__export"
        onClick={() => onExportPdf("cliente")}
        disabled={disabled}
        title={exportBlockedReason ?? BRAND_KIT_STYLE_GUIDE_EXPORT_MODE_HINTS.cliente}
      >
        {primaryLabel}
      </button>
    );
  }

  return (
    <div className="brandKit-studio-header-export" ref={menuRef}>
      <button
        type="button"
        className="brandKit-studio-global-header__export brandKit-studio-header-export__primary"
        onClick={() => onExportPdf(defaultMode)}
        disabled={disabled}
        title={exportBlockedReason ?? BRAND_KIT_STYLE_GUIDE_EXPORT_MODE_HINTS[defaultMode]}
      >
        {primaryLabel}
      </button>
      <button
        type="button"
        className="brandKit-studio-header-export__toggle"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-label={brandKitLocaleEs.exportHeaderMenuLabel}
        disabled={!canExport}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <ChevronDown size={14} aria-hidden />
      </button>
      {menuOpen ? (
        <div className="brandKit-studio-header-export__menu" role="menu">
          <p className="brandKit-studio-header-export__menu-kicker">{brandKitLocaleEs.exportHeaderMenuLabel}</p>
          <button
            type="button"
            role="menuitem"
            className="brandKit-studio-header-export__menu-item"
            disabled={busy}
            title={BRAND_KIT_STYLE_GUIDE_EXPORT_MODE_HINTS.operativo}
            onClick={() => {
              onExportPdf("operativo");
              setMenuOpen(false);
            }}
          >
            <span>{BRAND_KIT_STYLE_GUIDE_EXPORT_MODE_LABELS.operativo}</span>
            <span className="brandKit-studio-header-export__menu-hint">{brandKitLocaleEs.exportHeaderDraftHint}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="brandKit-studio-header-export__menu-item"
            disabled={busy}
            title={BRAND_KIT_STYLE_GUIDE_EXPORT_MODE_HINTS.cliente}
            onClick={() => {
              onExportPdf("cliente");
              setMenuOpen(false);
            }}
          >
            <span>{BRAND_KIT_STYLE_GUIDE_EXPORT_MODE_LABELS.cliente}</span>
            <span className="brandKit-studio-header-export__menu-hint">{brandKitLocaleEs.exportHeaderFinalHint}</span>
          </button>
          <div className="brandKit-studio-header-export__menu-divider" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="brandKit-studio-header-export__menu-item"
            disabled={!onExportTokens}
            onClick={() => {
              onExportTokens?.();
              setMenuOpen(false);
            }}
          >
            {brandKitLocaleEs.exportTokensJson}
          </button>
          <button
            type="button"
            role="menuitem"
            className="brandKit-studio-header-export__menu-item"
            disabled={!onExportCompiled}
            onClick={() => {
              onExportCompiled?.();
              setMenuOpen(false);
            }}
          >
            {brandKitLocaleEs.exportCompiledJson}
          </button>
          {!canExport && exportBlockedReason ? (
            <p className="brandKit-studio-header-export__menu-hint brandKit-studio-header-export__menu-hint--warn">
              {exportBlockedReason}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
