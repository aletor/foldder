"use client";

import React from "react";
import { Expand, Maximize2, Minimize2, Monitor, Smartphone } from "lucide-react";
import type { SitePreviewMode } from "@/lib/site/site-types";
import type { SiteEditorChromeMode, SitePreviewZoom } from "./site-editor-ui-types";

export function SiteViewportControls({
  previewMode,
  onPreviewModeChange,
  previewZoom,
  onPreviewZoomChange,
  chromeMode,
  onChromeModeChange,
  compact,
}: {
  previewMode: SitePreviewMode;
  onPreviewModeChange: (mode: SitePreviewMode) => void;
  previewZoom: SitePreviewZoom;
  onPreviewZoomChange: (zoom: SitePreviewZoom) => void;
  chromeMode: SiteEditorChromeMode;
  onChromeModeChange: (mode: SiteEditorChromeMode) => void;
  compact?: boolean;
}) {
  return (
    <div className="site-editor-viewport" role="group" aria-label="Vista previa">
      <button
        type="button"
        className={`site-editor-viewport__btn${previewMode === "desktop" ? " is-active" : ""}`}
        onClick={() => onPreviewModeChange("desktop")}
        title="Escritorio (1)"
      >
        <Monitor size={14} strokeWidth={2} aria-hidden />
        {!compact ? <span>Desktop</span> : null}
      </button>
      <button
        type="button"
        className={`site-editor-viewport__btn${previewMode === "mobile" ? " is-active" : ""}`}
        onClick={() => onPreviewModeChange("mobile")}
        title="Móvil (2)"
      >
        <Smartphone size={14} strokeWidth={2} aria-hidden />
        {!compact ? <span>Móvil</span> : null}
      </button>
      <span className="site-editor-viewport__sep" aria-hidden />
      <button
        type="button"
        className={`site-editor-viewport__btn${previewZoom === "fit" ? " is-active" : ""}`}
        onClick={() => onPreviewZoomChange("fit")}
        title="Ajustar (F)"
      >
        <Expand size={14} strokeWidth={2} aria-hidden />
        {!compact ? <span>Ajustar</span> : null}
      </button>
      <button
        type="button"
        className={`site-editor-viewport__btn${previewZoom === "100" ? " is-active" : ""}`}
        onClick={() => onPreviewZoomChange("100")}
        title="100 %"
      >
        {!compact ? <span>100%</span> : <Maximize2 size={14} strokeWidth={2} aria-hidden />}
      </button>
      <button
        type="button"
        className={`site-editor-viewport__btn${chromeMode === "clean" ? " is-active" : ""}`}
        onClick={() => onChromeModeChange(chromeMode === "clean" ? "editor" : "clean")}
        title="Preview limpio"
      >
        <Minimize2 size={14} strokeWidth={2} aria-hidden />
        {!compact ? <span>Limpio</span> : null}
      </button>
    </div>
  );
}
