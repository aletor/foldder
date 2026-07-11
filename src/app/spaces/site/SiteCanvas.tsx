"use client";

import React, { useEffect, useMemo } from "react";
import type { SiteAdnContext } from "@/lib/site/site-adn";
import {
  buildSiteSrcDoc,
  SITE_EDITOR_SECTION_SELECT_MESSAGE,
  SITE_EDITOR_TEXT_EDIT_MESSAGE,
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
}: {
  project: SiteProject;
  previewMode: SitePreviewMode;
  previewLocale?: string;
  selectedSectionId: string | null;
  sectionLabels: Record<string, string>;
  adn?: SiteAdnContext | null;
  onSelectSection?: (sectionId: string) => void;
  onInlineTextEdit?: (sectionId: string, blockId: string, value: string) => void;
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
    if (!selectSection && !editText) return undefined;

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
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onInlineTextEdit, onSelectSection]);

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
          <iframe
            className="site-studio__preview-iframe"
            title="Vista previa del sitio"
            srcDoc={srcDoc}
            sandbox="allow-scripts"
            loading="lazy"
          />
        )}
      </div>
    </main>
  );
}
