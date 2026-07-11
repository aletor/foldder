"use client";

import React, { useEffect, useMemo } from "react";
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, Trash2 } from "lucide-react";
import type { SiteAdnContext } from "@/lib/site/site-adn";
import {
  buildSiteSrcDoc,
  SITE_EDITOR_SECTION_SELECT_MESSAGE,
  SITE_EDITOR_TEXT_EDIT_MESSAGE,
  SITE_EDITOR_BUTTON_EDIT_MESSAGE,
} from "@/lib/site/site-render";
import { getActiveSitePage } from "@/lib/site/site-project";
import type { SitePreviewMode, SiteProject } from "@/lib/site/site-types";

export function SiteCanvas({
  project,
  previewMode,
  previewLocale,
  selectedSectionId,
  sectionLabels,
  adn,
  onSelectSection,
  onInlineTextEdit,
  onInlineButtonEdit,
  selectedSectionLabel,
  sectionActions,
}: {
  project: SiteProject;
  previewMode: SitePreviewMode;
  previewLocale?: string;
  selectedSectionId: string | null;
  sectionLabels: Record<string, string>;
  adn?: SiteAdnContext | null;
  onSelectSection?: (sectionId: string) => void;
  onInlineTextEdit?: (sectionId: string, blockId: string, value: string) => void;
  onInlineButtonEdit?: (sectionId: string, blockId: string, value: string) => void;
  selectedSectionLabel?: string | null;
  sectionActions?: {
    onDuplicate?: () => void;
    onRemove?: () => void;
    onMoveUp?: () => void;
    onMoveDown?: () => void;
    onToggleNav?: () => void;
    inNav?: boolean;
    canMoveUp?: boolean;
    canMoveDown?: boolean;
  } | null;
}) {
  const activePage = getActiveSitePage(project);
  const srcDoc = useMemo(
    () =>
      buildSiteSrcDoc(project, {
        locale: previewLocale ?? project.locales[0],
        selectedSectionId,
        sectionLabels,
        adn,
        editorMode: true,
      }),
    [adn, previewLocale, project, sectionLabels, selectedSectionId],
  );

  useEffect(() => {
    const selectSection = onSelectSection;
    const editText = onInlineTextEdit;
    const editButton = onInlineButtonEdit;
    if (!selectSection && !editText && !editButton) return undefined;

    function handleMessage(event: MessageEvent) {
      const payload = event.data as {
        type?: string;
        sectionId?: string;
        blockId?: string;
        value?: string;
      } | null;
      if (!payload?.type) return;

      if (payload.type === SITE_EDITOR_SECTION_SELECT_MESSAGE) {
        if (typeof payload.sectionId !== "string" || !payload.sectionId.trim()) return;
        onSelectSection?.(payload.sectionId);
        return;
      }

      if (payload.type === SITE_EDITOR_TEXT_EDIT_MESSAGE) {
        if (
          typeof payload.sectionId !== "string" ||
          typeof payload.blockId !== "string" ||
          typeof payload.value !== "string"
        ) {
          return;
        }
        onInlineTextEdit?.(payload.sectionId, payload.blockId, payload.value);
        return;
      }

      if (payload.type === SITE_EDITOR_BUTTON_EDIT_MESSAGE) {
        if (
          typeof payload.sectionId !== "string" ||
          typeof payload.blockId !== "string" ||
          typeof payload.value !== "string"
        ) {
          return;
        }
        onInlineButtonEdit?.(payload.sectionId, payload.blockId, payload.value);
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onInlineButtonEdit, onInlineTextEdit, onSelectSection]);

  const isEmpty = activePage.sections.length === 0;

  return (
    <main className="site-studio__canvas-wrap" data-foldder-studio-canvas aria-label="Vista previa de página">
      <div className={`site-studio__canvas-frame site-studio__canvas-frame--${previewMode}`}>
        {isEmpty ? (
          <div className="site-studio__canvas-empty">
            <p className="site-studio__canvas-empty-title">Página vacía</p>
            <p className="site-studio__canvas-empty-body">
              Añade secciones desde el rail para ver el HTML semántico renderizado con el tema activo.
            </p>
          </div>
        ) : (
          <>
            {selectedSectionId && sectionActions ? (
              <div className="site-studio__canvas-action-bar" role="toolbar" aria-label="Acciones de sección">
                <span className="site-studio__canvas-action-label">
                  {selectedSectionLabel?.trim() || "Sección"}
                </span>
                <div className="site-studio__canvas-action-group">
                  <button
                    type="button"
                    className="site-studio__canvas-action-btn"
                    title="Subir sección"
                    disabled={!sectionActions.canMoveUp}
                    onClick={sectionActions.onMoveUp}
                  >
                    <ArrowUp size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="site-studio__canvas-action-btn"
                    title="Bajar sección"
                    disabled={!sectionActions.canMoveDown}
                    onClick={sectionActions.onMoveDown}
                  >
                    <ArrowDown size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="site-studio__canvas-action-btn"
                    title={sectionActions.inNav ? "Quitar del nav" : "Añadir al nav"}
                    onClick={sectionActions.onToggleNav}
                  >
                    {sectionActions.inNav ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
                  </button>
                  <button
                    type="button"
                    className="site-studio__canvas-action-btn"
                    title="Duplicar sección"
                    onClick={sectionActions.onDuplicate}
                  >
                    <Copy size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="site-studio__canvas-action-btn site-studio__canvas-action-btn--danger"
                    title="Eliminar sección"
                    onClick={sectionActions.onRemove}
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </div>
              </div>
            ) : null}
            <iframe
              className="site-studio__preview-iframe"
              title="Vista previa del sitio"
              srcDoc={srcDoc}
              sandbox="allow-scripts"
              loading="lazy"
            />
          </>
        )}
      </div>
    </main>
  );
}
