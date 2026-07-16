"use client";

import React, { useState } from "react";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import { BrandKitFoldderButton } from "./board-v2/BrandKitFoldderButton";
import { ChevronDown } from "lucide-react";

type BrandKitSidebarExportFooterProps = {
  canExport?: boolean;
  exportBlockedReason?: string | null;
  onExportTokens?: () => void;
  onExportCompiled?: () => void;
};

export function BrandKitSidebarExportFooter({
  canExport = false,
  exportBlockedReason = null,
  onExportTokens,
  onExportCompiled,
}: BrandKitSidebarExportFooterProps) {
  const [open, setOpen] = useState(false);

  return (
    <footer className="brandKit-sidebar-export brandKit-sidebar-export--technical">
      <button
        type="button"
        className="brandKit-sidebar-export__toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{brandKitLocaleEs.exportMenuLabel}</span>
        <ChevronDown size={14} aria-hidden className={open ? "is-open" : undefined} />
      </button>

      {open ? (
        <div className="brandKit-sidebar-export__panel">
          <p className="brandKit-sidebar-export__meta">{brandKitLocaleEs.exportTechnicalHint}</p>
          <div className="brandKit-sidebar-export__actions brandKit-sidebar-export__actions--technical">
            <BrandKitFoldderButton variant="muted" disabled={!canExport || !onExportTokens} onClick={onExportTokens}>
              {brandKitLocaleEs.exportTokensJson}
            </BrandKitFoldderButton>
            <BrandKitFoldderButton
              variant="muted"
              disabled={!canExport || !onExportCompiled}
              onClick={onExportCompiled}
            >
              {brandKitLocaleEs.exportCompiledJson}
            </BrandKitFoldderButton>
          </div>
          {!canExport && exportBlockedReason ? (
            <p className="brandKit-sidebar-export__hint">{exportBlockedReason}</p>
          ) : null}
        </div>
      ) : null}
    </footer>
  );
}
