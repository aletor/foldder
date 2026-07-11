"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SiteAdnContext } from "@/lib/site/site-adn";
import { hydrateBlobUrlsInSiteHtml } from "@/lib/site/site-media-url";
import {
  buildSiteSrcDoc,
  SITE_EDITOR_SECTION_SELECT_MESSAGE,
  SITE_EDITOR_TEXT_EDIT_MESSAGE,
  SITE_EDITOR_BUTTON_EDIT_MESSAGE,
} from "@/lib/site/site-render";
import { getActiveSitePage } from "@/lib/site/site-project";
import type { SitePreviewMode, SiteProject } from "@/lib/site/site-types";
import type { SitePreviewZoom } from "./site-editor-ui-types";

const DESKTOP_WIDTH = 1080;
const MOBILE_WIDTH = 390;

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
  editorMode = true,
  previewZoom = "fit",
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
  editorMode?: boolean;
  previewZoom?: SitePreviewZoom;
}) {
  const activePage = getActiveSitePage(project);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(1);
  const baseWidth = previewMode === "mobile" ? MOBILE_WIDTH : DESKTOP_WIDTH;
  const previewOrigin = typeof window !== "undefined" ? window.location.origin : undefined;

  const rawSrcDoc = useMemo(
    () =>
      buildSiteSrcDoc(project, {
        locale: previewLocale ?? project.locales[0],
        selectedSectionId: editorMode ? selectedSectionId : null,
        sectionLabels,
        adn,
        editorMode,
        previewOrigin,
      }),
    [adn, editorMode, previewLocale, previewOrigin, project, sectionLabels, selectedSectionId],
  );
  const [srcDoc, setSrcDoc] = useState(rawSrcDoc);

  useEffect(() => {
    setSrcDoc(rawSrcDoc);
    let cancelled = false;
    void hydrateBlobUrlsInSiteHtml(rawSrcDoc).then((hydrated) => {
      if (!cancelled) setSrcDoc(hydrated);
    });
    return () => {
      cancelled = true;
    };
  }, [rawSrcDoc]);

  const recomputeFit = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const available = el.clientWidth - 24;
    setFitScale(Math.min(1, Math.max(0.2, available / baseWidth)));
  }, [baseWidth]);

  useEffect(() => {
    recomputeFit();
    const el = viewportRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => recomputeFit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [recomputeFit, previewMode, previewZoom]);

  const scale =
    previewZoom === "fit"
      ? fitScale
      : previewZoom === "100"
        ? 1
        : previewZoom === "75"
          ? 0.75
          : 0.5;

  useEffect(() => {
    const selectSection = onSelectSection;
    const editText = onInlineTextEdit;
    const editButton = onInlineButtonEdit;
    if (!editorMode || (!selectSection && !editText && !editButton)) return undefined;

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
  }, [editorMode, onInlineButtonEdit, onInlineTextEdit, onSelectSection]);

  const isEmpty = activePage.sections.length === 0;

  return (
    <main
      className="site-editor-preview"
      data-foldder-studio-canvas
      ref={viewportRef}
      aria-label="Vista previa de página"
    >
      {isEmpty ? (
        <div className="site-editor-preview__empty">
          <p className="site-editor-preview__empty-title">Página vacía</p>
          <p className="site-editor-preview__empty-body">
            Usa el rail izquierdo para añadir secciones y componer tu sitio.
          </p>
        </div>
      ) : (
        <div className="site-editor-preview__scroll">
          <div
            className={`site-editor-preview__frame site-editor-preview__frame--${previewMode}`}
            style={{
              width: baseWidth,
              transform: `scale(${scale})`,
              transformOrigin: "top center",
            }}
          >
            <iframe
              className="site-editor-preview__iframe"
              title="Vista previa del sitio"
              srcDoc={srcDoc}
              sandbox="allow-scripts allow-same-origin"
              loading="lazy"
            />
          </div>
        </div>
      )}
    </main>
  );
}
