"use client";

import React from "react";
import { X } from "lucide-react";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import type { BrandKitStudioMode } from "@/lib/brandkit/studio/brand-kit-studio-mode";
import type { BrandKitStyleGuideExportMode } from "@/lib/brandkit/projection/style-guide-export-types";
import { foldderStudioHeaderIconActionClassName } from "../FoldderStudioHeader";
import { BrandKitStudioHeaderExport } from "./BrandKitStudioHeaderExport";

type BrandKitStudioHeaderProps = {
  title: string;
  meta?: string;
  studioMode: BrandKitStudioMode;
  onStudioModeChange: (mode: BrandKitStudioMode) => void;
  canExport?: boolean;
  exportBlockedReason?: string | null;
  exportBusy?: boolean;
  exportBusyLabel?: string;
  onExportPdf?: (mode: BrandKitStyleGuideExportMode) => void;
  onExportTokens?: () => void;
  onExportCompiled?: () => void;
  canSaveToLibrary?: boolean;
  saveToLibraryBusy?: boolean;
  saveToLibraryBlockedReason?: string | null;
  onSaveToMisBrandKits?: () => void;
  onClose?: () => void;
};

export function BrandKitStudioHeader({
  title,
  meta,
  studioMode,
  onStudioModeChange,
  canExport = false,
  exportBlockedReason,
  exportBusy = false,
  exportBusyLabel,
  onExportPdf,
  onExportTokens,
  onExportCompiled,
  canSaveToLibrary = false,
  saveToLibraryBusy = false,
  saveToLibraryBlockedReason,
  onSaveToMisBrandKits,
  onClose,
}: BrandKitStudioHeaderProps) {
  return (
    <header className="brandKit-studio-global-header" data-brandkit-studio-mode={studioMode}>
      <div className="brandKit-studio-global-header__brand">
        <h1 className="brandKit-studio-global-header__title">{title}</h1>
        {meta ? <p className="brandKit-studio-global-header__meta">{meta}</p> : null}
      </div>

      <div className="brandKit-studio-global-header__mode" role="group" aria-label={brandKitLocaleEs.sidebarViewLabel}>
        <button
          type="button"
          className={`brandKit-studio-global-header__mode-btn${studioMode === "presentation" ? " is-active" : ""}`}
          aria-pressed={studioMode === "presentation"}
          onClick={() => onStudioModeChange("presentation")}
        >
          {brandKitLocaleEs.sidebarViewPresentation}
        </button>
        <button
          type="button"
          className={`brandKit-studio-global-header__mode-btn${studioMode === "edit" ? " is-active" : ""}`}
          aria-pressed={studioMode === "edit"}
          onClick={() => onStudioModeChange("edit")}
        >
          {brandKitLocaleEs.sidebarViewEdit}
        </button>
      </div>

      <div className="brandKit-studio-global-header__actions">
        {onSaveToMisBrandKits ? (
          <button
            type="button"
            className="brandKit-studio-global-header__library-save"
            onClick={onSaveToMisBrandKits}
            disabled={!canSaveToLibrary || saveToLibraryBusy}
            title={
              saveToLibraryBlockedReason ??
              brandKitLocaleEs.saveToMisBrandKitsHint
            }
          >
            {saveToLibraryBusy
              ? brandKitLocaleEs.saveToMisBrandKitsBusy
              : brandKitLocaleEs.saveToMisBrandKits}
          </button>
        ) : null}
        {onExportPdf ? (
          <BrandKitStudioHeaderExport
            studioMode={studioMode}
            canExport={canExport}
            exportBlockedReason={exportBlockedReason}
            busy={exportBusy}
            busyLabel={exportBusyLabel}
            onExportPdf={onExportPdf}
            onExportTokens={onExportTokens}
            onExportCompiled={onExportCompiled}
          />
        ) : null}
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className={foldderStudioHeaderIconActionClassName("brandKit-studio-global-header__close")}
            aria-label="Cerrar"
          >
            <X size={16} strokeWidth={2.25} />
          </button>
        ) : null}
      </div>
    </header>
  );
}
