"use client";

import React, { useRef, useState } from "react";
import {
  Archive,
  Link2,
  MoreHorizontal,
  Palette,
  Settings2,
  Upload,
  X,
} from "lucide-react";
import { resolveFoldderNodeStudioBackground } from "../studio-node/foldder-studio-node-backgrounds";
import type { SitePreviewMode } from "@/lib/site/site-types";
import type { SiteOverlayPanel, SiteEditorChromeMode, SitePreviewZoom } from "./site-editor-ui-types";
import { SiteViewportControls } from "./SiteViewportControls";

export function SiteFloatingTopbar({
  title,
  slug,
  isStale,
  publishError,
  publishing,
  exporting,
  publishLabel,
  canPublish,
  onPublish,
  onExportZip,
  onClose,
  previewMode,
  onPreviewModeChange,
  previewZoom,
  onPreviewZoomChange,
  chromeMode,
  onChromeModeChange,
  activePanel,
  onTogglePanel,
}: {
  title: string;
  slug?: string;
  isStale?: boolean;
  publishError?: string | null;
  publishing?: boolean;
  exporting?: boolean;
  publishLabel: string;
  canPublish: boolean;
  onPublish: () => void;
  onExportZip?: () => void;
  onClose: () => void;
  previewMode: SitePreviewMode;
  onPreviewModeChange: (mode: SitePreviewMode) => void;
  previewZoom: SitePreviewZoom;
  onPreviewZoomChange: (zoom: SitePreviewZoom) => void;
  chromeMode: SiteEditorChromeMode;
  onChromeModeChange: (mode: SiteEditorChromeMode) => void;
  activePanel: SiteOverlayPanel | null;
  onTogglePanel: (panel: SiteOverlayPanel) => void;
}) {
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const iconSrc = resolveFoldderNodeStudioBackground("site");

  return (
    <header className="site-editor-topbar" data-foldder-studio-header>
      <div className="site-editor-topbar__zone site-editor-topbar__zone--left">
        <div className="site-editor-topbar__icon" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={iconSrc} alt="" draggable={false} />
        </div>
        <div className="site-editor-topbar__identity">
          <h1 className="site-editor-topbar__title">{title}</h1>
          <p className="site-editor-topbar__meta">
            {slug?.trim() || "borrador"}
            {isStale ? " · cambios sin publicar" : ""}
          </p>
        </div>
        {publishError ? <span className="site-editor-topbar__error">{publishError}</span> : null}
      </div>

      <div className="site-editor-topbar__zone site-editor-topbar__zone--center">
        <SiteViewportControls
          previewMode={previewMode}
          onPreviewModeChange={onPreviewModeChange}
          previewZoom={previewZoom}
          onPreviewZoomChange={onPreviewZoomChange}
          chromeMode={chromeMode}
          onChromeModeChange={onChromeModeChange}
        />
      </div>

      <div className="site-editor-topbar__zone site-editor-topbar__zone--right">
        <button
          type="button"
          className={`site-editor-topbar__chip${activePanel === "theme" ? " is-active" : ""}`}
          onClick={() => onTogglePanel("theme")}
          title="Tema"
        >
          <Palette size={14} strokeWidth={2} aria-hidden />
          <span>Tema</span>
        </button>
        <button
          type="button"
          className={`site-editor-topbar__chip${activePanel === "sources" ? " is-active" : ""}`}
          onClick={() => onTogglePanel("sources")}
          title="Fuentes"
        >
          <Link2 size={14} strokeWidth={2} aria-hidden />
          <span>Fuentes</span>
        </button>
        <button
          type="button"
          className={`site-editor-topbar__chip${activePanel === "settings" ? " is-active" : ""}`}
          onClick={() => onTogglePanel("settings")}
          title="Ajustes del sitio"
        >
          <Settings2 size={14} strokeWidth={2} aria-hidden />
          <span>Ajustes</span>
        </button>

        {onExportZip ? (
          <div className="site-editor-topbar__menu" ref={exportRef}>
            <button
              type="button"
              className="site-editor-topbar__icon-btn"
              onClick={() => setExportOpen((v) => !v)}
              title="Más acciones"
              aria-expanded={exportOpen}
            >
              <MoreHorizontal size={16} strokeWidth={2} aria-hidden />
            </button>
            {exportOpen ? (
              <div className="site-editor-topbar__dropdown" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="site-editor-topbar__dropdown-item"
                  disabled={!canPublish || exporting || publishing}
                  onClick={() => {
                    setExportOpen(false);
                    onExportZip();
                  }}
                >
                  <Archive size={14} aria-hidden />
                  {exporting ? "Exportando…" : "Exportar ZIP"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <button
          type="button"
          className="site-editor-topbar__publish"
          disabled={!canPublish || publishing || exporting}
          onClick={onPublish}
          title={publishLabel}
        >
          <Upload size={14} strokeWidth={2} aria-hidden />
          <span>{publishing ? "…" : publishLabel}</span>
        </button>

        <button type="button" className="site-editor-topbar__close" onClick={onClose} aria-label="Cerrar">
          <X size={16} strokeWidth={2.25} />
        </button>
      </div>
    </header>
  );
}
