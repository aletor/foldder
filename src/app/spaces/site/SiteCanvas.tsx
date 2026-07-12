"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SiteAdnContext } from "@/lib/site/site-adn";
import { hydrateBlobUrlsInSiteHtml } from "@/lib/site/site-media-url";
import {
  buildSiteSrcDoc,
  SITE_EDITOR_BLOCK_SELECT_MESSAGE,
  SITE_EDITOR_SYNC_SELECTION_MESSAGE,
  SITE_EDITOR_TEXT_EDIT_MESSAGE,
  SITE_EDITOR_BUTTON_EDIT_MESSAGE,
} from "@/lib/site/site-render";
import type { SiteSelectionKind } from "@/lib/site/site-selection";
import { getActiveSitePage } from "@/lib/site/site-project";
import type { SitePreviewMode, SiteProject } from "@/lib/site/site-types";
import type { SitePreviewZoom } from "./site-editor-ui-types";

const DESKTOP_WIDTH = 1080;
const MOBILE_WIDTH = 390;

type ScrollSnapshot = { outer: number; inner: number };

function capturePreviewScroll(
  viewportEl: HTMLElement | null,
  iframeEl: HTMLIFrameElement | null,
): ScrollSnapshot {
  const outerEl = viewportEl?.querySelector(".site-editor-preview__scroll") as HTMLElement | null;
  const doc = iframeEl?.contentDocument;
  const inner =
    iframeEl?.contentWindow?.scrollY ??
    doc?.documentElement?.scrollTop ??
    doc?.body?.scrollTop ??
    0;
  return { outer: outerEl?.scrollTop ?? 0, inner };
}

function restorePreviewScroll(
  viewportEl: HTMLElement | null,
  iframeEl: HTMLIFrameElement | null,
  snapshot: ScrollSnapshot,
) {
  const outerEl = viewportEl?.querySelector(".site-editor-preview__scroll") as HTMLElement | null;
  if (outerEl) outerEl.scrollTop = snapshot.outer;
  const win = iframeEl?.contentWindow;
  const doc = iframeEl?.contentDocument;
  if (win) win.scrollTo({ top: snapshot.inner, left: 0, behavior: "instant" as ScrollBehavior });
  if (doc?.documentElement) doc.documentElement.scrollTop = snapshot.inner;
  if (doc?.body) doc.body.scrollTop = snapshot.inner;
}

export function SiteCanvas({
  project,
  previewMode,
  previewLocale,
  selectedSectionId,
  selectedBlockId,
  selectionKind,
  sectionLabels,
  adn,
  onCanvasSelect,
  onInlineTextEdit,
  onInlineButtonEdit,
  editorMode = true,
  previewZoom = "fit",
}: {
  project: SiteProject;
  previewMode: SitePreviewMode;
  previewLocale?: string;
  selectedSectionId: string | null;
  selectedBlockId: string | null;
  selectionKind: SiteSelectionKind;
  sectionLabels: Record<string, string>;
  adn?: SiteAdnContext | null;
  onCanvasSelect?: (payload: { sectionId: string; blockId?: string; target: "section" | "block" }) => void;
  onInlineTextEdit?: (sectionId: string, blockId: string, value: string) => void;
  onInlineButtonEdit?: (sectionId: string, blockId: string, value: string) => void;
  editorMode?: boolean;
  previewZoom?: SitePreviewZoom;
}) {
  const activePage = getActiveSitePage(project);
  const viewportRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const pendingScrollRef = useRef<ScrollSnapshot | null>(null);
  const lastScrollRef = useRef<ScrollSnapshot>({ outer: 0, inner: 0 });
  const skipNextSrcDocReloadRef = useRef(false);
  const iframeScrollCleanupRef = useRef<(() => void) | null>(null);
  const [fitScale, setFitScale] = useState(1);
  const baseWidth = previewMode === "mobile" ? MOBILE_WIDTH : DESKTOP_WIDTH;
  const previewOrigin = typeof window !== "undefined" ? window.location.origin : undefined;

  const recordScroll = useCallback(() => {
    lastScrollRef.current = capturePreviewScroll(viewportRef.current, iframeRef.current);
  }, []);

  // Selection state is synced via postMessage — excluded so clicks don't reload the iframe.
  const rawSrcDoc = useMemo(
    () =>
      buildSiteSrcDoc(project, {
        locale: previewLocale ?? project.locales[0],
        sectionLabels,
        adn,
        editorMode,
        previewOrigin,
      }),
    [adn, editorMode, previewLocale, previewOrigin, project, sectionLabels],
  );
  const [srcDoc, setSrcDoc] = useState(rawSrcDoc);

  const syncSelectionToIframe = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win || !editorMode) return;
    win.postMessage(
      {
        type: SITE_EDITOR_SYNC_SELECTION_MESSAGE,
        sectionId: selectedSectionId,
        blockId: selectionKind === "block" ? selectedBlockId : null,
        selectionKind:
          selectionKind === "block" ? "block" : selectionKind === "section" ? "section" : null,
      },
      "*",
    );
  }, [editorMode, selectedBlockId, selectedSectionId, selectionKind]);

  useEffect(() => {
    syncSelectionToIframe();
  }, [syncSelectionToIframe]);

  useEffect(() => {
    if (skipNextSrcDocReloadRef.current) {
      skipNextSrcDocReloadRef.current = false;
      return;
    }

    pendingScrollRef.current = lastScrollRef.current;
    setSrcDoc(rawSrcDoc);
    let cancelled = false;
    void hydrateBlobUrlsInSiteHtml(rawSrcDoc).then((hydrated) => {
      if (cancelled || hydrated === rawSrcDoc) return;
      pendingScrollRef.current = lastScrollRef.current;
      setSrcDoc(hydrated);
    });
    return () => {
      cancelled = true;
    };
  }, [rawSrcDoc]);

  const attachIframeScrollListener = useCallback(() => {
    iframeScrollCleanupRef.current?.();
    iframeScrollCleanupRef.current = null;
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    const onScroll = () => recordScroll();
    win.addEventListener("scroll", onScroll, { passive: true });
    iframeScrollCleanupRef.current = () => win.removeEventListener("scroll", onScroll);
  }, [recordScroll]);

  useEffect(() => {
    const outerEl = viewportRef.current?.querySelector(".site-editor-preview__scroll") as HTMLElement | null;
    if (!outerEl) return undefined;
    const onScroll = () => recordScroll();
    outerEl.addEventListener("scroll", onScroll, { passive: true });
    return () => outerEl.removeEventListener("scroll", onScroll);
  }, [recordScroll]);

  useEffect(
    () => () => {
      iframeScrollCleanupRef.current?.();
    },
    [],
  );

  const handleIframeLoad = useCallback(() => {
    attachIframeScrollListener();
    recordScroll();

    const pending = pendingScrollRef.current;
    if (pending) {
      requestAnimationFrame(() => {
        restorePreviewScroll(viewportRef.current, iframeRef.current, pending);
        requestAnimationFrame(() => {
          restorePreviewScroll(viewportRef.current, iframeRef.current, pending);
          pendingScrollRef.current = null;
          recordScroll();
        });
      });
    }
    syncSelectionToIframe();
  }, [attachIframeScrollListener, recordScroll, syncSelectionToIframe]);

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
    if (!editorMode) return undefined;

    function handleMessage(event: MessageEvent) {
      const payload = event.data as {
        type?: string;
        sectionId?: string;
        blockId?: string;
        target?: "section" | "block";
        value?: string;
      } | null;
      if (!payload?.type) return;

      if (payload.type === SITE_EDITOR_BLOCK_SELECT_MESSAGE) {
        if (typeof payload.sectionId !== "string" || !payload.sectionId.trim()) return;
        if (payload.target === "section") {
          onCanvasSelect?.({ sectionId: payload.sectionId, target: "section" });
          return;
        }
        if (typeof payload.blockId !== "string" || !payload.blockId.trim()) return;
        onCanvasSelect?.({ sectionId: payload.sectionId, blockId: payload.blockId, target: "block" });
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
        recordScroll();
        skipNextSrcDocReloadRef.current = true;
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
        recordScroll();
        skipNextSrcDocReloadRef.current = true;
        onInlineButtonEdit?.(payload.sectionId, payload.blockId, payload.value);
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [editorMode, onCanvasSelect, onInlineButtonEdit, onInlineTextEdit, recordScroll]);

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
              ref={iframeRef}
              className="site-editor-preview__iframe"
              title="Vista previa del sitio"
              srcDoc={srcDoc}
              sandbox="allow-scripts allow-same-origin"
              loading="lazy"
              onLoad={handleIframeLoad}
            />
          </div>
        </div>
      )}
    </main>
  );
}
