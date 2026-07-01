"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import FreehandStudio, {
  type FreehandObject,
  type LayoutGuide,
  type DesignerStudioApi,
} from "../FreehandStudio";
import type { DesignerPageState } from "./DesignerNode";
import { saveDesignerPagesToInspiration } from "../inspiration/save-designer-template";
import { useProjectAssetsCanvas } from "../project-assets-canvas-context";
import {
  DEFAULT_DESIGNER_PAGE_FORMAT,
  formatById,
  getPageDimensions,
} from "../indesign/page-formats";
import { createArtboard, type Artboard } from "../freehand/artboard";
import type { VectorPdfExportOptions } from "../freehand/text-outline";
import { StudioCanvasPresetPanel } from "../studio-node/StudioCanvasPresetPanel";
import { findStudioCanvasPresetIdForSize } from "../studio-node/studio-canvas-presets";
import {
  artboardCssToDocumentBackground,
  newDocumentBackgroundToCss,
  type NewDocumentConfig,
} from "../studio-node/studio-canvas-document-model";
import { StudioCanvasSideControls } from "../studio-node/StudioCanvasSideControls";
import { computeFittingLayout } from "../indesign/image-frame-layout";
import { layoutPageStories } from "../indesign/text-layout";
import type { Story, StoryNode, TextFrame, Typography } from "../indesign/text-model";
import {
  flattenStoryContent,
  serializeStoryContent,
  plainTextToStoryNodes,
  htmlToStoryNodes,
  storyNodesToHtml,
  sliceStoryContent,
  replaceStoryContentRangePreservingParagraphs,
  DEFAULT_TYPOGRAPHY,
} from "../indesign/text-model";
import {
  patchStoryContentPlain,
  appendTextFrameAfter,
  findFollowUpFrameRect,
  unlinkFrameAt,
  updateStoryTypography,
} from "../indesign/text-threading";
import { readResponseJson } from "@/lib/read-response-json";
import {
  registerLiveDesignerMultipagePdfExport,
  unregisterLiveDesignerMultipagePdfExport,
} from "../studio-live-documents";
import { useDesignerSpaceId } from "@/contexts/DesignerSpaceIdContext";
import { newDesignerAssetId, optimizeImageBlobToOptFormat } from "./designer-image-pipeline";
import { exportDesignerDeFile, importDesignerDeFile } from "./designer-document-file";
import { hydrateImportedDesignerPagesMedia } from "./designer-de-s3-hydrate";
import {
  buildRichSpansForFrame,
  designerCanvasSessionKey,
  designerPageThumbContentKey,
  designerPagesNeedingRailThumbnails,
  dpgUid,
  duplicateDesignerPageState,
  readImageFilePixelSize,
  designerPagesSnapshotForDeExport,
} from "./designer-studio-pure";
import {
  applyDatasetRowToDesignerPage,
  applyDatasetToAllPages,
  collectDatasetLoopListId,
  datasetListRowCount,
  datasetMaxRowCount,
  nextDatasetRowIndex,
  patchLiveCanvasFromDatasetPageObjects,
  reconcileDatasetLoopPages,
  resolveDesignerPageDatasetRowIndex,
  stripDatasetLoopMarkers,
} from "./designer-dataset-page";
import { DesignerPagesRail } from "./DesignerPagesRail";
import { DesignerGenerativeFillPanel } from "./generative-fill/DesignerGenerativeFillPanel";
import { useDesignerGenerativeFill } from "./generative-fill/useDesignerGenerativeFill";
import { DesignerStudioPageBar } from "./DesignerStudioPageBar";
import { DesignerDeletePagesModal } from "./DesignerDeletePagesModal";
import { useDesignerImagePipeline } from "./useDesignerImagePipeline";
import { useDesignerTextFrameLayoutSync } from "./useDesignerTextFrameLayoutSync";
import { useBrainNodeTelemetry } from "@/lib/brain/use-brain-node-telemetry";
import type { DesignerEmbedProps } from "../freehand/designer-embed-props";
import type { FoldderExportCreatedDetail } from "../foldder-export-events";
import { countDesignerImagesInPages } from "./designer-export-image-summary";

function clampCanvasDim(n: number): number {
  return Math.max(64, Math.min(8192, Math.round(n)));
}

import {
  logDesignerExportImagesSummary,
  trackDesignerImageImported,
  trackDesignerImageUsed,
} from "./designer-image-telemetry";

export type HeadlessPdfExportRequest = {
  requestId: number;
  filenameBase?: string;
  onDone: () => void;
  onError: (err: Error) => void;
};

/**
 * Exporta PNG a resolución completa por página (montaje headless). `targetPageIds` limita las
 * páginas a renderizar (null = todas). Reporta cada página vía `onPage` y termina con `onDone`.
 */
export type HeadlessImageExportRequest = {
  requestId: number;
  targetPageIds?: string[] | null;
  maxSide?: number;
  fullResolution?: boolean;
  onPage: (pageId: string, dataUrl: string) => void;
  onDone: () => void;
  onError: (err: Error) => void;
};

interface DesignerStudioProps {
  initialPages: DesignerPageState[];
  activePageIndex: number;
  /** Miniaturas ya persistidas en el nodo (evita regenerar al abrir). */
  initialPageThumbnails?: Record<string, string>;
  onClose: () => void;
  onExport: (dataUrl: string) => void;
  onFinalExport?: (detail: Omit<FoldderExportCreatedDetail, "sourceNodeId">) => void;
  onUpdatePages: (pages: DesignerPageState[], activeIdx?: number) => void;
  /** Raster en vivo por página (pageId → dataURL) para la salida media_list / Export Multimedia. */
  onUpdatePageThumbnails?: (thumbnails: Record<string, string>) => void;
  /** Id estable del nodo en el canvas (React Flow); el lienzo no se remonta al cambiar de página. */
  designerCanvasInstanceKey: string;
  /** Persistido en el nodo Designer: auto-optimización de imágenes en background. */
  autoImageOptimization?: boolean;
  onAutoImageOptimizationChange?: (enabled: boolean) => void;
  brainConnected?: boolean;
  datasetConnected?: boolean;
  designerConnectedDataset?: import("@/app/spaces/dataset/dataset-types").Dataset | null;
  designerConnectedDatasetLoading?: boolean;
  headlessPdfExport?: HeadlessPdfExportRequest | null;
  headlessImageExport?: HeadlessImageExportRequest | null;
}

export function safeDesignerExportFilenameBase(raw: string | undefined): string {
  const base = (raw || "diseno")
    .trim()
    .replace(/\.(design|pdf|png|jpg|jpeg|svg)$/i, "")
    .replace(/[^a-z0-9-_]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return base || "diseno";
}

function flatStoryText(nodes: StoryNode[]): string {
  return flattenStoryContent(nodes).map((run) => run.text).join("");
}

export default function DesignerStudio({
  initialPages,
  activePageIndex: initialActiveIdx,
  initialPageThumbnails = {},
  onClose,
  onExport,
  onFinalExport,
  onUpdatePages,
  onUpdatePageThumbnails,
  designerCanvasInstanceKey,
  autoImageOptimization = true,
  onAutoImageOptimizationChange,
  brainConnected = false,
  datasetConnected = false,
  designerConnectedDataset = null,
  designerConnectedDatasetLoading = false,
  headlessPdfExport = null,
  headlessImageExport = null,
}: DesignerStudioProps) {
  /**
   * El editor inline puede inyectar estilos métricos (font-size/family/letter-spacing) en spans.
   * En marcos encadenados, esos overrides desalinean el layout (saltos de caja tempranos).
   * Conservamos estilos semánticos (bold/italic/underline/strike/link/color) y limpiamos métricas.
   */
  const normalizeInlineRichNodes = useCallback((nodes: StoryNode[]): StoryNode[] => {
    return nodes.map((node) => ({
      ...node,
      spans: node.spans.map((sp) => {
        if (!sp.style) return sp;
        const nextStyle = { ...sp.style };
        delete nextStyle.fontSize;
        delete nextStyle.fontFamily;
        delete nextStyle.letterSpacing;
        const hasAny = Object.keys(nextStyle).length > 0;
        return hasAny ? { ...sp, style: nextStyle } : { ...sp, style: undefined };
      }),
    }));
  }, []);

  const designerSpaceId = useDesignerSpaceId();
  const projectAssetsCtx = useProjectAssetsCanvas();
  const inspirationProjectId = projectAssetsCtx?.projectScopeId ?? null;
  const brainTelemetry = useBrainNodeTelemetry({
    canvasNodeId: designerCanvasInstanceKey,
    nodeType: "DESIGNER",
  });
  const brainTelemetryRef = useRef(brainTelemetry);
  brainTelemetryRef.current = brainTelemetry;
  const [pages, setPages] = useState<DesignerPageState[]>(() =>
    initialPages.length > 0
      ? initialPages
      : [
          {
            id: dpgUid(),
            format: DEFAULT_DESIGNER_PAGE_FORMAT,
            objects: [],
            layoutGuides: [],
            stories: [],
            textFrames: [],
            imageFrames: [],
          },
        ],
  );

  const [activePageIndex, setActivePageIndex] = useState(() =>
    Math.min(initialActiveIdx, Math.max(0, pages.length - 1)),
  );

  /** null | nueva página | cambiar tamaño de una página existente */
  const [canvasPresetModalOpen, setCanvasPresetModalOpen] = useState(false);
  const [canvasPresetModalKey, setCanvasPresetModalKey] = useState(0);
  const [canvasPresetPageIndex, setCanvasPresetPageIndex] = useState(0);
  const [canvasResizePreview, setCanvasResizePreview] = useState<{
    width: number;
    height: number;
    background: NewDocumentConfig["background"];
  } | null>(null);

  /** Índices de páginas pendientes de eliminar (modal de confirmación). */
  const [deletePagesPending, setDeletePagesPending] = useState<number[] | null>(null);

  /** Evita activar la página al soltar tras un drag HTML5 de reordenación. */
  const suppressPageThumbClickRef = useRef(false);

  /** Miniaturas raster del lienzo real (misma pipeline que el preview del nodo). */
  const [pageThumbnails, setPageThumbnails] = useState<Record<string, string>>(
    () => initialPageThumbnails,
  );
  /** Huella del contenido al capturar cada miniatura; evita mostrar rasters obsoletos en el rail. */
  const [pageThumbnailContentKeys, setPageThumbnailContentKeys] = useState<Record<string, string>>(() => {
    const list =
      initialPages.length > 0
        ? initialPages
        : [
            {
              id: "",
              format: DEFAULT_DESIGNER_PAGE_FORMAT,
              objects: [],
              layoutGuides: [],
              stories: [],
              textFrames: [],
              imageFrames: [],
            },
          ];
    const keys: Record<string, string> = {};
    for (const p of list) {
      if (p.id && initialPageThumbnails[p.id]) {
        keys[p.id] = designerPageThumbContentKey(p);
      }
    }
    return keys;
  });
  /** Oculta el lienzo mientras se itera páginas para capturar PNG (rail / export). */
  const [designerPageCaptureBusy, setDesignerPageCaptureBusy] = useState(false);
  const [designerPageCaptureProgress, setDesignerPageCaptureProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  /** En el navegador `setTimeout` devuelve `number`; con @types/node a veces choca con `NodeJS.Timeout`. */
  const railThumbTimerRef = useRef<number | undefined>(undefined);
  const scheduleRailThumbRef = useRef<() => void>(() => {});
  const captureRailThumbnailForPageIndexRef = useRef<(pageIndex: number) => Promise<boolean>>(async () => false);
  const refreshRailThumbnailsForPagesRef = useRef<
    (pageIds: string[], opts?: { delayMs?: number }) => Promise<void>
  >(async () => {});
  const railThumbBatchGenRef = useRef(0);

  const [designerFitToViewNonce, setDesignerFitToViewNonce] = useState(0);
  const requestDesignerFitToView = useCallback(() => {
    setDesignerFitToViewNonce((n) => n + 1);
  }, []);

  /** Dirección de la animación horizontal al cambiar de página (clases `designer-page-slide-in-*` en globals.css). */
  const [designerPageEnterDirection, setDesignerPageEnterDirection] = useState<"next" | "prev" | null>(null);

  const goToDesignerPage = useCallback(
    (nextIdx: number, opts?: { animate?: boolean }) => {
      const cur = activeIdxRef.current;
      const n = pagesRef.current.length;
      if (nextIdx < 0 || nextIdx >= n || nextIdx === cur) return;
      const animate = opts?.animate !== false;
      const finishSwitch = () => {
        setDesignerPageEnterDirection(animate ? (nextIdx > cur ? "next" : "prev") : null);
        setActivePageIndex(nextIdx);
        queueMicrotask(() => requestDesignerFitToView());
      };

      window.clearTimeout(railThumbTimerRef.current);
      void (async () => {
        await Promise.race([
          captureRailThumbnailForPageIndexRef.current(cur),
          new Promise<void>((resolve) => window.setTimeout(resolve, 700)),
        ]);
        finishSwitch();
      })();
    },
    [requestDesignerFitToView],
  );

  /** Ctrl/Cmd + ← / → en el lienzo: página anterior / siguiente. */
  const handleDesignerNavigatePage = useCallback(
    (delta: -1 | 1) => {
      const i = activeIdxRef.current;
      const n = pagesRef.current.length;
      if (n <= 1) return;
      const next = Math.max(0, Math.min(n - 1, i + delta));
      goToDesignerPage(next);
    },
    [goToDesignerPage],
  );

  useEffect(() => {
    requestDesignerFitToView();
  }, [requestDesignerFitToView]);

  const imageFrameInputRef = useRef<HTMLInputElement>(null);
  const imageFrameTargetIdRef = useRef<string | null>(null);
  const deImportInputRef = useRef<HTMLInputElement>(null);
  const [deExportBusy, setDeExportBusy] = useState(false);
  const [deImportHydrating, setDeImportHydrating] = useState(false);
  const [designerPageHydrateNonce, setDesignerPageHydrateNonce] = useState(0);

  const studioApiRef = useRef<DesignerStudioApi | null>(null);
  const designerClipboardRef = useRef<FreehandObject[] | null>(null);
  const threadedTextEditRangeRef = useRef<Map<string, { storyId: string; start: number; end: number }>>(new Map());
  /** Página donde se hizo la última copia (⌘C) al portapapeles Designer; sirve para pegar sin desplazar entre páginas. */
  const designerClipboardSourcePageIdRef = useRef<string | null>(null);

  const designerHistoryBridge = useMemo(
    () => ({
      capture: (canvasObjects: FreehandObject[]) => {
        const idx = activeIdxRef.current;
        return pagesRef.current.map((page, i) => {
          const clone = JSON.parse(JSON.stringify(page)) as DesignerPageState;
          if (i === idx) {
            clone.objects = JSON.parse(JSON.stringify(canvasObjects)) as FreehandObject[];
          }
          return clone;
        });
      },
      restore: (snap: unknown) => {
        if (!Array.isArray(snap)) return;
        setPages(snap as DesignerPageState[]);
      },
    }),
    [normalizeInlineRichNodes],
  );

  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const activeIdxRef = useRef(activePageIndex);
  activeIdxRef.current = activePageIndex;
  const pageThumbnailsRef = useRef(pageThumbnails);
  pageThumbnailsRef.current = pageThumbnails;
  const pageThumbnailContentKeysRef = useRef(pageThumbnailContentKeys);
  pageThumbnailContentKeysRef.current = pageThumbnailContentKeys;

  /** Clave `datasetId:version` ya sincronizada; evita re-aplicar bindings de forma redundante. */
  const lastDatasetSyncVersionRef = useRef<string | null>(null);

  /** Clave estable: un solo FreehandStudio para todo el documento; el cambio de página hidrata objetos sin remount. */
  const freehandStudioInstanceKey = useMemo(
    () => `designer-fh-${designerCanvasInstanceKey}`,
    [designerCanvasInstanceKey],
  );

  /** Persiste el scroll del listado de páginas: FreehandStudio se remonta con `key={freehandStudioInstanceKey}` y sin esto el rail vuelve arriba. */
  const designerPagesRailScrollTopRef = useRef(0);
  const designerPagesRailScrollElRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = designerPagesRailScrollElRef.current;
    if (!el || pages.length === 0) return;
    el.scrollTop = designerPagesRailScrollTopRef.current;
    const row = el.querySelector(`[data-designer-rail-index="${activePageIndex}"]`);
    (row as HTMLElement | null)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    designerPagesRailScrollTopRef.current = el.scrollTop;
    return () => {
      const cur = designerPagesRailScrollElRef.current;
      if (cur) {
        designerPagesRailScrollTopRef.current = cur.scrollTop;
      }
    };
  }, [freehandStudioInstanceKey, activePageIndex, pages.length]);

  const captureRailThumbnailForPageIndex = useCallback(
    async (pageIndex: number): Promise<boolean> => {
      if (activeIdxRef.current !== pageIndex) return false;
      const api = studioApiRef.current;
      const p = pagesRef.current[pageIndex];
      if (!api?.getNodePreviewPngDataUrl || !p) return false;
      const pd = getPageDimensions(p);
      const expectedKey = designerCanvasSessionKey(designerCanvasInstanceKey, p.id, pd.width, pd.height);

      let ready = false;
      for (let t = 0; t < 150; t++) {
        if (api.getExportSessionKey?.() === expectedKey) {
          ready = true;
          break;
        }
        await new Promise((r) => window.setTimeout(r, 16));
      }
      if (!ready) return false;

      try {
        const url = await api.getNodePreviewPngDataUrl({ maxSide: 320 });
        if (!url) return false;
        const contentKey = designerPageThumbContentKey(p);
        setPageThumbnails((prev) => (prev[p.id] === url ? prev : { ...prev, [p.id]: url }));
        setPageThumbnailContentKeys((prev) =>
          prev[p.id] === contentKey ? prev : { ...prev, [p.id]: contentKey },
        );
        return true;
      } catch {
        return false;
      }
    },
    [designerCanvasInstanceKey],
  );

  const captureRailThumbnailForActivePage = useCallback(async () => {
    await captureRailThumbnailForPageIndex(activeIdxRef.current);
  }, [captureRailThumbnailForPageIndex]);

  captureRailThumbnailForPageIndexRef.current = captureRailThumbnailForPageIndex;

  const scheduleRailThumbnail = useCallback(() => {
    if (typeof window === "undefined") return;
    window.clearTimeout(railThumbTimerRef.current);
    railThumbTimerRef.current = window.setTimeout(() => {
      void captureRailThumbnailForActivePage();
    }, 450);
  }, [captureRailThumbnailForActivePage]);

  scheduleRailThumbRef.current = scheduleRailThumbnail;

  useEffect(() => {
    const t = window.setTimeout(() => {
      scheduleRailThumbnail();
    }, 380);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(railThumbTimerRef.current);
    };
  }, [freehandStudioInstanceKey, scheduleRailThumbnail]);

  /** Tras cambiar de página, esperar hidratación del lienzo y capturar la miniatura activa. */
  useEffect(() => {
    const t = window.setTimeout(() => {
      scheduleRailThumbnail();
    }, 520);
    return () => window.clearTimeout(t);
  }, [activePageIndex, scheduleRailThumbnail]);

  const commitPages = useCallback(
    (fn: (prev: DesignerPageState[]) => DesignerPageState[]) => {
      setPages((prev) => fn(prev));
    },
    [],
  );

  const { designerOptimizeProgress, refreshDisplayForAllPages } = useDesignerImagePipeline({
    studioApiRef,
    pagesRef,
    activeIdxRef,
    setPages,
    designerSpaceId,
    autoImageOptimization,
  });

  /** Modo P (lienzo a pantalla completa): estado en el padre para que sobreviva al remount de FreehandStudio al cambiar de página. */
  const [designerCanvasZenMode, setDesignerCanvasZenMode] = useState(false);

  useEffect(() => {
    onUpdatePages(pages, activePageIndex);
  }, [pages, activePageIndex, onUpdatePages]);

  // Publica el raster por página (media_list / Export Multimedia) en vivo.
  useEffect(() => {
    onUpdatePageThumbnails?.(pageThumbnails);
  }, [pageThumbnails, onUpdatePageThumbnails]);

  const activePage = pages[activePageIndex] ?? pages[0];

  const { panelProps: generativeFillPanelProps, generativeFillBridge } = useDesignerGenerativeFill({
    activePage,
    activePageIndex,
    studioApiRef,
    setPages,
    activeIdxRef,
  });

  const liveCanvas = useMemo(() => {
    if (!activePage) {
      return { width: 1920, height: 1080, background: "#ffffff" as const };
    }
    const dims = getPageDimensions(activePage);
    const backgroundCss = newDocumentBackgroundToCss(activePage.pageBackground ?? "white");
    if (canvasResizePreview && canvasPresetModalOpen) {
      return {
        width: clampCanvasDim(canvasResizePreview.width),
        height: clampCanvasDim(canvasResizePreview.height),
        background: newDocumentBackgroundToCss(canvasResizePreview.background),
      };
    }
    return { width: dims.width, height: dims.height, background: backgroundCss };
  }, [activePage, canvasResizePreview, canvasPresetModalOpen]);

  const canvasDimFitSkipRef = useRef(true);
  useEffect(() => {
    if (canvasDimFitSkipRef.current) {
      canvasDimFitSkipRef.current = false;
      return;
    }
    requestDesignerFitToView();
  }, [liveCanvas.width, liveCanvas.height, requestDesignerFitToView]);

  const initialArtboards = useMemo((): Artboard[] => {
    if (!activePage) return [];
    return [
      createArtboard({
        name: `Page ${activePageIndex + 1}`,
        x: 0,
        y: 0,
        width: liveCanvas.width,
        height: liveCanvas.height,
        background: liveCanvas.background,
      }),
    ];
  }, [activePage, activePageIndex, liveCanvas.width, liveCanvas.height, liveCanvas.background]);

  const { syncTextFrameLayoutsRef } = useDesignerTextFrameLayoutSync({
    studioApiRef,
    pagesRef,
    activeIdxRef,
    pages,
    activePageIndex,
  });

  // ── Object sync (FreehandStudio → pages state) ──

  const handleUpdateObjects = useCallback(
    (objects: FreehandObject[]) => {
      const idx = activeIdxRef.current;
      const api = studioApiRef.current;

      setPages((prev) => {
        const n = [...prev];
        const p = n[idx];
        if (!p) return prev;

        let textFrames = p.textFrames ?? [];
        let tfChanged = false;
        for (const obj of objects) {
          if (obj.isTextFrame) {
            textFrames = textFrames.map(tf => {
              if (tf.id !== obj.id) return tf;
              if (tf.x === obj.x && tf.y === obj.y && tf.width === obj.width && tf.height === obj.height) return tf;
              tfChanged = true;
              return { ...tf, x: obj.x, y: obj.y, width: obj.width, height: obj.height };
            });
          }
        }

        // Typography sync: propagate text frame property changes to Story.typography
        let stories = p.stories ?? [];
        let storiesChanged = false;
        for (const obj of objects) {
          if (!obj.isTextFrame) continue;
          const storyId = (obj as any).storyId as string | undefined;
          if (!storyId) continue;
          const story = stories.find(s => s.id === storyId);
          if (!story) continue;
          const typo = story.typography;
          const to = obj as any;
          const patch: Record<string, unknown> = {};
          if (to.fontFamily != null && to.fontFamily !== typo.fontFamily) patch.fontFamily = to.fontFamily;
          if (to.fontSize != null && String(to.fontSize) !== String(typo.fontSize)) patch.fontSize = to.fontSize;
          if (to.lineHeight != null && to.lineHeight !== typo.lineHeight) patch.lineHeight = to.lineHeight;
          if (to.letterSpacing != null && to.letterSpacing !== typo.letterSpacing) patch.letterSpacing = to.letterSpacing;
          if (to.textAlign != null && to.textAlign !== typo.align) patch.align = to.textAlign;
          if (to.fontKerning != null && to.fontKerning !== typo.fontKerning) patch.fontKerning = to.fontKerning;
          if (to.paragraphIndent != null && to.paragraphIndent !== typo.paragraphIndent) patch.paragraphIndent = to.paragraphIndent;
          if (to.fontVariantCaps != null && to.fontVariantCaps !== typo.fontVariantCaps) patch.fontVariantCaps = to.fontVariantCaps;
          if (to.textUnderline != null && to.textUnderline !== typo.textUnderline) patch.textUnderline = to.textUnderline;
          if (to.textStrikethrough != null && to.textStrikethrough !== typo.textStrikethrough) patch.textStrikethrough = to.textStrikethrough;
          if (to.fontFeatureSettings != null && to.fontFeatureSettings !== typo.fontFeatureSettings) patch.fontFeatureSettings = to.fontFeatureSettings;
          const fillStr = typeof to.fill === "string" ? to.fill : to.fill?.type === "solid" ? to.fill.color : null;
          if (fillStr && fillStr !== "none" && fillStr !== typo.color) patch.color = fillStr;
          if (Object.keys(patch).length > 0) {
            stories = updateStoryTypography(stories, storyId, patch as any);
            storiesChanged = true;
          }
        }

        // Auto-fit: recompute image content layout when frame dimensions change
        const prevObjs = p.objects;
        for (const obj of objects) {
          if (!obj.isImageFrame || !obj.imageFrameContent?.src) continue;
          if ((obj as any).imageFrameAutoFit === false) continue;
          const old = prevObjs.find(o => o.id === obj.id);
          if (old && (old.width !== obj.width || old.height !== obj.height)) {
            const ifc = obj.imageFrameContent;
            const lay = computeFittingLayout(obj.width, obj.height, ifc.originalWidth, ifc.originalHeight, ifc.fittingMode as any);
            const updated = { ...ifc, ...lay };
            if (api) api.patchObject(obj.id, { imageFrameContent: updated });
          }
        }

        n[idx] = { ...p, objects, ...(tfChanged ? { textFrames } : {}), ...(storiesChanged ? { stories } : {}) };
        return n;
      });
      queueMicrotask(() => scheduleRailThumbRef.current());
    },
    [],
  );

  const handleUpdateLayoutGuides = useCallback(
    (layoutGuides: LayoutGuide[]) => {
      const idx = activeIdxRef.current;
      setPages((prev) => {
        const n = [...prev];
        const p = n[idx];
        if (!p) return prev;
        n[idx] = { ...p, layoutGuides };
        return n;
      });
      queueMicrotask(() => scheduleRailThumbRef.current());
    },
    [],
  );

  // ── Text frame creation ──

  const handleDesignerTextFrameCreate = useCallback(
    (frameObj: FreehandObject) => {
      const storyId = (frameObj as any).storyId ?? frameObj.id;
      const frameId = frameObj.id;

      const idx = activeIdxRef.current;
      setPages((prev) => {
        const n = [...prev];
        const p = n[idx];
        if (!p) return prev;

        const fo = frameObj as FreehandObject & {
          fontFamily?: string;
          fontSize?: number;
          lineHeight?: number;
          letterSpacing?: number;
          textAlign?: string;
          fontWeight?: number | string;
          fontStyle?: string;
          paragraphIndent?: number;
          fontKerning?: string;
          fontVariantCaps?: string;
          fontFeatureSettings?: string;
          fill?: unknown;
        };
        const ta = fo.textAlign;
        const align: Typography["align"] =
          ta === "left" || ta === "center" || ta === "right" || ta === "justify" ? ta : DEFAULT_TYPOGRAPHY.align;
        const fillStr =
          typeof fo.fill === "string"
            ? fo.fill
            : (fo.fill as { type?: string; color?: string } | undefined)?.type === "solid"
              ? (fo.fill as { color?: string }).color
              : null;
        const story: Story = {
          id: storyId,
          content: plainTextToStoryNodes(""),
          frames: [frameId],
          typography: {
            ...DEFAULT_TYPOGRAPHY,
            fontFamily: fo.fontFamily ?? DEFAULT_TYPOGRAPHY.fontFamily,
            fontSize: typeof fo.fontSize === "number" ? fo.fontSize : DEFAULT_TYPOGRAPHY.fontSize,
            lineHeight: typeof fo.lineHeight === "number" ? fo.lineHeight : DEFAULT_TYPOGRAPHY.lineHeight,
            letterSpacing: typeof fo.letterSpacing === "number" ? fo.letterSpacing : DEFAULT_TYPOGRAPHY.letterSpacing,
            align,
            color: fillStr && fillStr !== "none" ? fillStr : DEFAULT_TYPOGRAPHY.color,
            fontWeight: fo.fontWeight != null ? String(fo.fontWeight) : DEFAULT_TYPOGRAPHY.fontWeight,
            fontStyle: fo.fontStyle ?? DEFAULT_TYPOGRAPHY.fontStyle,
            paragraphIndent: typeof fo.paragraphIndent === "number" ? fo.paragraphIndent : DEFAULT_TYPOGRAPHY.paragraphIndent,
            fontKerning:
              fo.fontKerning === "none" || fo.fontKerning === "auto" ? fo.fontKerning : DEFAULT_TYPOGRAPHY.fontKerning,
            fontVariantCaps:
              fo.fontVariantCaps === "normal" || fo.fontVariantCaps === "small-caps"
                ? fo.fontVariantCaps
                : DEFAULT_TYPOGRAPHY.fontVariantCaps,
            fontFeatureSettings: fo.fontFeatureSettings ?? DEFAULT_TYPOGRAPHY.fontFeatureSettings,
          },
        };

        const frame: TextFrame = {
          id: frameId,
          storyId,
          x: frameObj.x,
          y: frameObj.y,
          width: frameObj.width,
          height: frameObj.height,
          padding: 4,
        };

        n[idx] = {
          ...p,
          stories: [...(p.stories ?? []), story],
          textFrames: [...(p.textFrames ?? []), frame],
        };
        return n;
      });
    },
    [],
  );

  // ── Text frame editing end ──

  const handleDesignerTextFrameEdit = useCallback(
    (frameId: string, storyId: string, newText: string, richHtml?: string, phase: "input" | "commit" = "input") => {
      const idx = activeIdxRef.current;
      const editRangeAtCall = threadedTextEditRangeRef.current.get(frameId);
      let updatedStories: Story[] | null = null;
      let textFramesForPatch: TextFrame[] = [];
      setPages((prev) => {
        const n = [...prev];
        const p = n[idx];
        if (!p) return prev;

        const stories = p.stories ?? [];
        const textFrames = p.textFrames ?? [];
        const story = stories.find((s) => s.id === storyId);
        if (!story) return prev;
        const normalizedStoryContent = normalizeInlineRichNodes(story.content);

        const newNodes = richHtml
          ? normalizeInlineRichNodes(htmlToStoryNodes(richHtml))
          : plainTextToStoryNodes(newText);
        const replacementFlatText = flatStoryText(newNodes);
        const replacementFlatLength = replacementFlatText.length;

        let nextStories: Story[];
        if (story.frames.length <= 1) {
          nextStories = stories.map((s) =>
            s.id === storyId ? { ...s, content: newNodes } : s,
          );
          if (phase !== "commit") {
            threadedTextEditRangeRef.current.set(frameId, {
              storyId,
              start: 0,
              end: replacementFlatLength,
            });
          }
        } else {
          const layouts = layoutPageStories(stories, textFrames);
          const frameLayout = layouts.find((l) => l.frameId === frameId);
          if (frameLayout) {
            const activeRange = editRangeAtCall;
            const storyFlat = flatStoryText(normalizedStoryContent);
            const totalLen = storyFlat.length;
            const rangeStart =
              activeRange?.storyId === storyId && activeRange.start === frameLayout.contentRange.start
                ? Math.max(0, Math.min(activeRange.start, totalLen))
                : frameLayout.contentRange.start;
            let rangeEnd =
              activeRange?.storyId === storyId && activeRange.start === frameLayout.contentRange.start
                ? Math.max(rangeStart, Math.min(activeRange.end, totalLen))
                : frameLayout.contentRange.end;

            if (
              replacementFlatLength > 0 &&
              storyFlat.slice(rangeStart, rangeStart + replacementFlatLength) === replacementFlatText
            ) {
              rangeEnd = Math.max(rangeEnd, Math.min(rangeStart + replacementFlatLength, totalLen));
            }

            const merged = normalizeInlineRichNodes(
              replaceStoryContentRangePreservingParagraphs(
                normalizedStoryContent,
                rangeStart,
                rangeEnd,
                newNodes,
              ),
            );
            if (phase !== "commit") {
              threadedTextEditRangeRef.current.set(frameId, {
                storyId,
                start: rangeStart,
                end: rangeStart + replacementFlatLength,
              });
            }
            nextStories = stories.map((s) =>
              s.id === storyId ? { ...s, content: merged } : s,
            );
          } else {
            nextStories = stories.map((s) =>
              s.id === storyId ? { ...s, content: newNodes } : s,
            );
          }
        }

        updatedStories = nextStories;
        textFramesForPatch = textFrames;
        n[idx] = { ...p, stories: nextStories };
        return n;
      });

      const storiesForPatch = (updatedStories ?? []) as Story[];
      if (storiesForPatch.length === 0) return;
      const api = studioApiRef.current;
      if (api) {
        const newLayouts = layoutPageStories(storiesForPatch, textFramesForPatch);
        const storyById = new Map(storiesForPatch.map((story) => [story.id, story]));
        for (const fl of newLayouts) {
          if (fl.storyId !== storyId) continue;
          const st = storyById.get(fl.storyId);
          if (!st) continue;
          const frameContent = sliceStoryContent(st.content, fl.contentRange.start, fl.contentRange.end);
          const ft = serializeStoryContent(frameContent);
          const richSpans = buildRichSpansForFrame(frameContent);
          api.patchObject(fl.frameId, {
            text: ft,
            _designerOverflow: fl.hasOverflow,
            _designerRichSpans: richSpans,
          });
        }
      }
      if (phase === "commit") {
        threadedTextEditRangeRef.current.delete(frameId);
      }
    },
    [normalizeInlineRichNodes],
  );

  // ── Image frame placement ──

  const handleDesignerImageFramePlace = useCallback(
    (frameId: string) => {
      imageFrameTargetIdRef.current = frameId;
      imageFrameInputRef.current?.click();
    },
    [],
  );

  const handleImageFileSelected = useCallback(
    async (file: File) => {
      const frameId = imageFrameTargetIdRef.current;
      if (!frameId) return;
      const api = studioApiRef.current;
      const frameObj = api?.getObjects().find((o) => o.id === frameId);

      const assetId = newDesignerAssetId();

      let optBlob: Blob;
      let optExt: string;
      try {
        const optimized = await optimizeImageBlobToOptFormat(file, file.type || "image/jpeg");
        optBlob = optimized.blob;
        optExt = optimized.ext;
      } catch (e) {
        console.error("[Designer] optimize:", e);
        alert("No se pudo optimizar la imagen. Prueba con otro archivo.");
        return;
      }

      const formData = new FormData();
      formData.append(
        "file",
        new File([optBlob], `optimized.${optExt}`, { type: optBlob.type || "application/octet-stream" }),
      );
      formData.append("assetId", assetId);
      formData.append("variant", "OPT");
      if (designerSpaceId) formData.append("spaceId", designerSpaceId);
      formData.append("ext", optExt);

      let uploadRes: Response;
      try {
        uploadRes = await fetch("/api/spaces/designer-asset-upload", { method: "POST", body: formData });
      } catch (e) {
        console.error("[Designer] image upload:", e);
        alert("No se pudo subir la imagen (red). Vuelve a intentarlo.");
        return;
      }
      const json = await readResponseJson<{ url?: string; s3Key?: string; error?: string }>(
        uploadRes,
        "POST /api/spaces/designer-asset-upload",
      );
      if (!uploadRes.ok || !json?.url || !json?.s3Key) {
        const detail =
          json?.error ||
          (!uploadRes.ok ? `HTTP ${uploadRes.status}` : null) ||
          "El servidor no devolvió URL.";
        console.error("[Designer] upload failed:", detail, json);
        alert(`No se pudo guardar la imagen: ${detail}`);
        return;
      }

      const persistedUrl = json.url;
      const optKey = json.s3Key;
      let iw = 100;
      let ih = 100;
      try {
        const bmp = await createImageBitmap(optBlob);
        iw = bmp.width;
        ih = bmp.height;
        bmp.close();
      } catch {
        try {
          const dim = await readImageFilePixelSize(file);
          iw = dim.w;
          ih = dim.h;
        } catch {
          const img = new window.Image();
          img.crossOrigin = "anonymous";
          img.src = persistedUrl;
          await new Promise<void>((res) => {
            img.onload = () => res();
            img.onerror = () => res();
          });
          iw = img.naturalWidth || 100;
          ih = img.naturalHeight || 100;
        }
      }

      const fw = frameObj?.width ?? 200;
      const fh = frameObj?.height ?? 200;
      const layout = computeFittingLayout(fw, fh, iw, ih, "fill-proportional");

      const content = {
        src: persistedUrl,
        s3Key: optKey,
        s3KeyOpt: optKey,
        designerAssetId: assetId,
        originalWidth: iw,
        originalHeight: ih,
        ...layout,
        fittingMode: "fill-proportional" as const,
      };

      api?.patchObject(frameId, { imageFrameContent: content });

      const pageId = pagesRef.current[activeIdxRef.current]?.id;
      const tr = brainTelemetryRef.current.track;
      trackDesignerImageImported(tr, {
        source: "USER_UPLOAD",
        pageId,
        frameId,
        assetId,
        assetRef: persistedUrl,
        fileName: file.name?.trim(),
        mimeType: file.type?.trim() || optBlob.type || "image/*",
        imageWidth: iw,
        imageHeight: ih,
      });
      trackDesignerImageUsed(tr, {
        source: "USER_UPLOAD",
        pageId,
        frameId,
        assetId,
        assetRef: persistedUrl,
        fileName: file.name?.trim(),
        mimeType: file.type?.trim() || optBlob.type || "image/*",
        imageWidth: iw,
        imageHeight: ih,
      });

      const idx = activeIdxRef.current;
      setPages((prev) => {
        const n = [...prev];
        const p = n[idx];
        if (!p) return prev;
        n[idx] = {
          ...p,
          objects: p.objects.map((o) =>
            o.id === frameId ? { ...o, imageFrameContent: content } : o,
          ),
        };
        queueMicrotask(() => void refreshDisplayForAllPages(n, autoImageOptimization));
        return n;
      });
    },
    [designerSpaceId, refreshDisplayForAllPages, autoImageOptimization],
  );

  // ── Page management ──

  const patchPageCanvas = useCallback(
    (
      pageIndex: number,
      patch: {
        width?: number;
        height?: number;
        background?: NewDocumentConfig["background"];
        presetId?: string | null;
      },
    ) => {
      setPages((prev) => {
        const n = [...prev];
        const p = n[pageIndex];
        if (!p) return prev;
        n[pageIndex] = {
          ...p,
          ...(patch.width != null ? { customWidth: clampCanvasDim(patch.width) } : {}),
          ...(patch.height != null ? { customHeight: clampCanvasDim(patch.height) } : {}),
          ...(patch.background != null ? { pageBackground: patch.background } : {}),
          ...(patch.presetId !== undefined ? { canvasPresetId: patch.presetId } : {}),
        };
        return n;
      });
    },
    [],
  );

  const applyActivePageDimensions = useCallback(
    (w: number, h: number) => {
      patchPageCanvas(activeIdxRef.current, {
        width: w,
        height: h,
        presetId: findStudioCanvasPresetIdForSize(w, h),
      });
      requestDesignerFitToView();
    },
    [patchPageCanvas, requestDesignerFitToView],
  );

  const applyActivePageBackground = useCallback(
    (background: NewDocumentConfig["background"]) => {
      patchPageCanvas(activeIdxRef.current, { background });
    },
    [patchPageCanvas],
  );

  const openCanvasPresetModal = useCallback((pageIndex: number) => {
    const p = pagesRef.current[pageIndex];
    if (!p) return;
    const dims = getPageDimensions(p);
    setCanvasPresetPageIndex(pageIndex);
    setCanvasPresetModalKey((k) => k + 1);
    setCanvasResizePreview({
      width: dims.width,
      height: dims.height,
      background: p.pageBackground ?? "white",
    });
    setCanvasPresetModalOpen(true);
  }, []);

  const handleCanvasPreviewFromModal = useCallback(
    (partial: { width: number; height: number; background: NewDocumentConfig["background"] }) => {
      setCanvasResizePreview(partial);
    },
    [],
  );

  const handleCanvasPresetConfirm = useCallback(
    (config: NewDocumentConfig) => {
      const idx = canvasPresetPageIndex;
      flushSync(() => {
        patchPageCanvas(idx, {
          width: config.width,
          height: config.height,
          background: config.background,
          presetId: config.presetId ?? findStudioCanvasPresetIdForSize(config.width, config.height),
        });
      });
      setCanvasPresetModalOpen(false);
      setTimeout(() => {
        setCanvasResizePreview(null);
        requestDesignerFitToView();
      }, 0);
    },
    [canvasPresetPageIndex, patchPageCanvas, requestDesignerFitToView],
  );

  const handleCanvasPresetCancel = useCallback(() => {
    setCanvasResizePreview(null);
    setCanvasPresetModalOpen(false);
  }, []);

  const requestDeletePages = useCallback((indices: number[]) => {
    const unique = [...new Set(indices)].filter((i) => i >= 0 && i < pagesRef.current.length);
    if (unique.length === 0 || pagesRef.current.length <= 1) return;
    setDeletePagesPending(unique);
  }, []);

  const confirmDeletePages = useCallback(() => {
    if (!deletePagesPending?.length) return;
    const removeSet = new Set(deletePagesPending);
    if (removeSet.size >= pagesRef.current.length) return;

    for (const idx of deletePagesPending) {
      const removedId = pagesRef.current[idx]?.id;
      if (!removedId) continue;
      setPageThumbnails((th) => {
        if (!th[removedId]) return th;
        const next = { ...th };
        delete next[removedId];
        return next;
      });
      setPageThumbnailContentKeys((keys) => {
        if (!keys[removedId]) return keys;
        const next = { ...keys };
        delete next[removedId];
        return next;
      });
    }

    const currentActive = activeIdxRef.current;
    let deletedBeforeActive = 0;
    let activeRemoved = false;
    for (const i of removeSet) {
      if (i < currentActive) deletedBeforeActive += 1;
      if (i === currentActive) activeRemoved = true;
    }
    const newLen = pagesRef.current.length - removeSet.size;
    let newActive = currentActive - deletedBeforeActive;
    if (activeRemoved) newActive = Math.min(currentActive, Math.max(0, newLen - 1));

    setDesignerPageEnterDirection(null);
    setPages((prev) => {
      if (prev.length <= 1) return prev;
      return stripDatasetLoopMarkers(prev.filter((_, i) => !removeSet.has(i)));
    });
    setActivePageIndex(Math.max(0, Math.min(newActive, newLen - 1)));
    setDeletePagesPending(null);
  }, [deletePagesPending]);

  const duplicatePage = useCallback(
    (idx: number) => {
      const source = pagesRef.current[idx];
      if (!source) return;
      const nextRow = nextDatasetRowIndex(pagesRef.current, designerConnectedDataset);
      let dup = duplicateDesignerPageState(source);
      if (designerConnectedDataset) {
        dup = applyDatasetRowToDesignerPage(dup, designerConnectedDataset, nextRow);
      } else {
        dup = { ...dup, datasetRowIndex: undefined };
      }
    commitPages((prev) => {
      const next = stripDatasetLoopMarkers([...prev.slice(0, idx + 1), dup, ...prev.slice(idx + 1)]);
      queueMicrotask(() => {
        setDesignerPageEnterDirection("next");
        setActivePageIndex(idx + 1);
      });
      return next;
    });
  },
  [commitPages, designerConnectedDataset],
);

  const addBlankPageAfterActive = useCallback(() => {
    const idx = activeIdxRef.current;
    const source = pagesRef.current[idx] ?? pagesRef.current[0];
    if (!source) return;
    const nextRow = nextDatasetRowIndex(pagesRef.current, designerConnectedDataset);
    const blank: DesignerPageState = {
      id: dpgUid(),
      format: source.format,
      ...(source.customWidth != null ? { customWidth: source.customWidth } : {}),
      ...(source.customHeight != null ? { customHeight: source.customHeight } : {}),
      ...(source.canvasPresetId != null ? { canvasPresetId: source.canvasPresetId } : {}),
      pageBackground: source.pageBackground ?? "white",
      objects: [],
      layoutGuides: [],
      stories: [],
      textFrames: [],
      imageFrames: [],
      ...(designerConnectedDataset ? { datasetRowIndex: nextRow } : {}),
    };
    commitPages((prev) => {
      const next = stripDatasetLoopMarkers([...prev.slice(0, idx + 1), blank, ...prev.slice(idx + 1)]);
      queueMicrotask(() => {
        setDesignerPageEnterDirection("next");
        setActivePageIndex(idx + 1);
      });
      return next;
    });
    queueMicrotask(() => scheduleRailThumbRef.current());
  }, [commitPages, designerConnectedDataset]);

  /**
   * "+ Bucle": genera una página por cada fila del listado elegido, usando la página activa
   * como plantilla. Cada página recibe su `datasetRowIndex` explícito (0..N-1) y se rellenan
   * los objetos enlazados. Reemplaza el deck actual por el conjunto generado.
   */
  const generateDatasetLoopPages = useCallback(
    (listId: string) => {
      if (!designerConnectedDataset) return;
      const list = designerConnectedDataset.lists.find((row) => row.id === listId);
      const rowCount = datasetListRowCount(designerConnectedDataset, listId);
      if (!list || rowCount <= 0) return;
      const template = pagesRef.current[activeIdxRef.current] ?? pagesRef.current[0];
      if (!template) return;

      const generated: DesignerPageState[] = [];
      for (let row = 0; row < rowCount; row++) {
        const dup = duplicateDesignerPageState(template);
        const applied = applyDatasetRowToDesignerPage(dup, designerConnectedDataset, row);
        generated.push({
          ...applied,
          datasetLoopListId: listId,
          datasetLoopCardId: list.cards[row]?.id,
        });
      }
      lastDatasetSyncVersionRef.current = `${designerConnectedDataset.id}:${designerConnectedDataset.version}`;

      const pageIds = generated.map((p) => p.id);
      railThumbBatchGenRef.current += 1;
      setPageThumbnails({});
      setPageThumbnailContentKeys({});

      commitPages(() => {
        queueMicrotask(() => {
          setDesignerPageEnterDirection(null);
          setActivePageIndex(0);
          void refreshRailThumbnailsForPagesRef.current(pageIds, { delayMs: 320 });
        });
        return generated;
      });
    },
    [commitPages, designerConnectedDataset],
  );

  /**
   * Fija la fila del Dataset de la página activa. Re-aplica los datos enlazados a esa página
   * y parchea el lienzo vivo con cambios mínimos (sin re-hidratar). Salir de modo bucle no aplica:
   * cambiar la fila a mano es una edición estructural, así que se quitan los marcadores de bucle.
   */
  const setActivePageRowIndex = useCallback(
    (rowIndex: number) => {
      const ds = designerConnectedDataset;
      if (!ds) return;
      const idx = activeIdxRef.current;
      const page = pagesRef.current[idx];
      if (!page) return;
      const rowCount = datasetMaxRowCount(ds);
      const clamped = rowCount > 0 ? Math.max(0, Math.min(rowIndex, rowCount - 1)) : Math.max(0, rowIndex);
      if (clamped === resolveDesignerPageDatasetRowIndex(page)) return;

      const applied = applyDatasetRowToDesignerPage(page, ds, clamped);
      const withRow =
        applied === page ? { ...page, datasetRowIndex: clamped } : applied;

      commitPages((prev) => {
        const next = [...prev];
        next[idx] = withRow;
        return stripDatasetLoopMarkers(next);
      });

      const api = studioApiRef.current;
      if (api) {
        queueMicrotask(() => {
          patchLiveCanvasFromDatasetPageObjects(api, withRow.objects ?? []);
          scheduleRailThumbRef.current();
        });
      }
    },
    [commitPages, designerConnectedDataset],
  );

  /**
   * Sincronización Dataset → slides. Se dispara SOLO cuando cambia el contenido del Dataset
   * (`version`), nunca por cambios en `pages`, así que no puede entrar en bucle.
   *
   * - Deck en modo bucle: reconcilia altas/bajas/reordenado de filas (por `cardId`) y re-aplica datos.
   * - Resto: re-aplica los valores enlazados a todas las páginas con bindings.
   *
   * La página activa se actualiza en el lienzo vivo con parches mínimos (`patchObject`), sin
   * re-hidratar (no resetea viewport/historial). Si la página activa desaparece, el clamp de índice
   * provoca la re-hidratación natural por cambio de página.
   */
  useEffect(() => {
    const ds = designerConnectedDataset;
    if (!ds) {
      lastDatasetSyncVersionRef.current = null;
      return;
    }
    const syncKey = `${ds.id}:${ds.version}`;
    if (lastDatasetSyncVersionRef.current === syncKey) return;
    lastDatasetSyncVersionRef.current = syncKey;

    const current = pagesRef.current;
    const loopListId = collectDatasetLoopListId(current);
    const loopActive = !!loopListId && ds.lists.some((list) => list.id === loopListId);

    const next = loopActive
      ? reconcileDatasetLoopPages(current, ds, loopListId!, activeIdxRef.current, duplicateDesignerPageState)
      : applyDatasetToAllPages(current, ds);

    if (next === current) return;

    const activeId = current[activeIdxRef.current]?.id;
    setPages(next);

    const newActiveIdx = activeId != null ? next.findIndex((p) => p.id === activeId) : -1;
    if (newActiveIdx < 0) {
      setDesignerPageEnterDirection(null);
      setActivePageIndex((idx) => Math.min(idx, Math.max(0, next.length - 1)));
    } else {
      if (newActiveIdx !== activeIdxRef.current) setActivePageIndex(newActiveIdx);
      const target = next[newActiveIdx];
      const api = studioApiRef.current;
      if (target && api) {
        queueMicrotask(() => {
          patchLiveCanvasFromDatasetPageObjects(api, target.objects ?? []);
        });
      }
    }
    queueMicrotask(() => {
      if (loopActive) {
        const needIds = designerPagesNeedingRailThumbnails(
          next,
          pageThumbnailsRef.current,
          pageThumbnailContentKeysRef.current,
          next.map((p) => p.id),
        );
        if (needIds.length > 0) {
          void refreshRailThumbnailsForPagesRef.current(needIds, { delayMs: 320 });
        }
      } else {
        scheduleRailThumbRef.current();
      }
    });
  }, [designerConnectedDataset]);

  const movePage = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      if (fromIndex < 0 || toIndex < 0) return;
      const len = pagesRef.current.length;
      if (fromIndex >= len || toIndex >= len) return;
      setDesignerPageEnterDirection(null);
      commitPages((prev) => {
        const next = [...prev];
        const [item] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, item!);
        return stripDatasetLoopMarkers(next);
      });
      setActivePageIndex((active) => {
        if (active === fromIndex) return toIndex;
        if (fromIndex < toIndex) {
          if (active > fromIndex && active <= toIndex) return active - 1;
          return active;
        }
        if (active >= toIndex && active < fromIndex) return active + 1;
        return active;
      });
    },
    [commitPages],
  );

  const swapOrientation = useCallback(
    (idx: number) => {
      commitPages((prev) => {
        const n = [...prev];
        const p = n[idx];
        if (!p) return prev;
        const f = formatById(p.format);
        const cw = p.customWidth ?? f.width;
        const ch = p.customHeight ?? f.height;
        n[idx] = {
          ...p,
          customWidth: ch,
          customHeight: cw,
          canvasPresetId: findStudioCanvasPresetIdForSize(ch, cw),
        };
        return n;
      });
    },
    [commitPages],
  );

  /** Renombra una slide (cosmético: no afecta a la estructura ni al modo bucle). */
  const renameSlide = useCallback(
    (idx: number, name: string) => {
      commitPages((prev) => {
        const n = [...prev];
        const p = n[idx];
        if (!p) return prev;
        const trimmed = name.trimStart();
        if ((p.slideName ?? "") === trimmed) return prev;
        n[idx] = { ...p, slideName: trimmed };
        return n;
      });
    },
    [commitPages],
  );

  // ── Threading: append frame after overflow ──

  const appendGuardRef = useRef<string | null>(null);

  const handleAppendThreadedFrame = useCallback(
    (sourceFrameId: string, pendingEdit?: { plain: string; richHtml: string }) => {
      if (appendGuardRef.current === sourceFrameId) return;
      appendGuardRef.current = sourceFrameId;
      setTimeout(() => { appendGuardRef.current = null; }, 300);

      const api = studioApiRef.current;
      if (!api) return;
      const idx = activeIdxRef.current;
      const p = pagesRef.current[idx];
      if (!p) return;

      let stories = p.stories ?? [];
      const textFrames = p.textFrames ?? [];
      const sourceTf = textFrames.find(tf => tf.id === sourceFrameId);
      if (!sourceTf) return;

      const story = stories.find(s => s.id === sourceTf.storyId);
      if (story) {
        const frameIdx = story.frames.indexOf(sourceFrameId);
        if (frameIdx >= 0 && frameIdx < story.frames.length - 1) return;
      }

      if (pendingEdit && story) {
        const newNodes = normalizeInlineRichNodes(htmlToStoryNodes(pendingEdit.richHtml));
        const replacementFlatText = flatStoryText(newNodes);
        const replacementFlatLength = replacementFlatText.length;
        if (story.frames.length <= 1) {
          stories = stories.map((s) =>
            s.id === story.id ? { ...s, content: newNodes } : s,
          );
          threadedTextEditRangeRef.current.set(sourceFrameId, {
            storyId: story.id,
            start: 0,
            end: replacementFlatLength,
          });
        } else {
          const layouts = layoutPageStories(stories, textFrames);
          const frameLayout = layouts.find((l) => l.frameId === sourceFrameId);
          if (frameLayout) {
            const normalizedStoryContent = normalizeInlineRichNodes(story.content);
            const activeRange = threadedTextEditRangeRef.current.get(sourceFrameId);
            const storyFlat = flatStoryText(normalizedStoryContent);
            const totalLen = storyFlat.length;
            const rangeStart =
              activeRange?.storyId === story.id && activeRange.start === frameLayout.contentRange.start
                ? Math.max(0, Math.min(activeRange.start, totalLen))
                : frameLayout.contentRange.start;
            let rangeEnd =
              activeRange?.storyId === story.id && activeRange.start === frameLayout.contentRange.start
                ? Math.max(rangeStart, Math.min(activeRange.end, totalLen))
                : frameLayout.contentRange.end;

            if (
              replacementFlatLength > 0 &&
              storyFlat.slice(rangeStart, rangeStart + replacementFlatLength) === replacementFlatText
            ) {
              rangeEnd = Math.max(rangeEnd, Math.min(rangeStart + replacementFlatLength, totalLen));
            }

            const merged = normalizeInlineRichNodes(
              replaceStoryContentRangePreservingParagraphs(
                normalizedStoryContent,
                rangeStart,
                rangeEnd,
                newNodes,
              ),
            );
            threadedTextEditRangeRef.current.set(sourceFrameId, {
              storyId: story.id,
              start: rangeStart,
              end: rangeStart + replacementFlatLength,
            });
            stories = stories.map((s) =>
              s.id === story.id ? { ...s, content: merged } : s,
            );
          }
        }
      }

      const pageDims = getPageDimensions(p);
      const box = findFollowUpFrameRect(sourceTf, textFrames, pageDims.width, pageDims.height, {
        width: sourceTf.width,
        height: sourceTf.height,
      });

      const result = appendTextFrameAfter(stories, textFrames, sourceFrameId, box);

      const newFrame = result.textFrames.find(tf => !textFrames.some(old => old.id === tf.id));
      const newLayouts = layoutPageStories(result.stories, result.textFrames);
      const storyById = new Map(result.stories.map((s) => [s.id, s]));
      const layoutByFrameId = new Map(newLayouts.map((layout) => [layout.frameId, layout]));

      setPages((prev) => {
        const n = [...prev];
        n[idx] = { ...prev[idx]!, stories: result.stories, textFrames: result.textFrames };
        return n;
      });

      if (newFrame) {
        const story = result.stories.find(s => s.id === newFrame.storyId);
        const typo = story?.typography ?? DEFAULT_TYPOGRAPHY;
        const newFrameLayout = layoutByFrameId.get(newFrame.id);
        const newFrameContent = story && newFrameLayout
          ? sliceStoryContent(story.content, newFrameLayout.contentRange.start, newFrameLayout.contentRange.end)
          : [];
        const newFrameText = newFrameContent.length > 0 ? serializeStoryContent(newFrameContent) : "";
        const newFrameRichSpans = newFrameContent.length > 0 ? buildRichSpansForFrame(newFrameContent) : undefined;
        const newFrameIndex = story ? story.frames.indexOf(newFrame.id) : -1;

        const newObj = {
          id: newFrame.id,
          type: "text" as const,
          textMode: "area" as const,
          text: newFrameText,
          x: newFrame.x,
          y: newFrame.y,
          width: newFrame.width,
          height: newFrame.height,
          fontFamily: typo.fontFamily,
          fontSize: typo.fontSize,
          fontWeight: 400,
          lineHeight: typo.lineHeight,
          letterSpacing: typo.letterSpacing,
          fontKerning: typo.fontKerning as "auto" | "none",
          fontFeatureSettings: typo.fontFeatureSettings,
          fontVariantLigatures: "common-ligatures",
          paragraphIndent: typo.paragraphIndent,
          textAlign: typo.align as "left" | "center" | "right" | "justify",
          fill: { type: "solid" as const, color: typo.color },
          stroke: "none",
          strokeWidth: 0,
          strokeLinecap: "butt" as const,
          strokeLinejoin: "miter" as const,
          strokeDasharray: "",
          strokePosition: "over",
          scaleX: 1,
          scaleY: 1,
          opacity: 1,
          rotation: 0,
          visible: true,
          locked: false,
          name: `Text Frame`,
          isTextFrame: true,
          storyId: newFrame.storyId,
          _designerOverflow: newFrameLayout?.hasOverflow ?? false,
          _designerThreadInfo: story && story.frames.length > 1
            ? { index: Math.max(0, newFrameIndex), total: story.frames.length }
            : undefined,
          _designerRichSpans: newFrameRichSpans,
        } as FreehandObject;

        api.addObject(newObj);
        for (const fl of newLayouts) {
          if (fl.storyId !== newFrame.storyId) continue;
          const st = storyById.get(fl.storyId);
          if (!st) continue;
          const frameContent = sliceStoryContent(st.content, fl.contentRange.start, fl.contentRange.end);
          const frameIdx = st.frames.indexOf(fl.frameId);
          api.patchObject(fl.frameId, {
            text: serializeStoryContent(frameContent),
            storyId: fl.storyId,
            _designerOverflow: fl.hasOverflow,
            _designerThreadInfo: st.frames.length > 1
              ? { index: Math.max(0, frameIdx), total: st.frames.length }
              : undefined,
            _designerRichSpans: buildRichSpansForFrame(frameContent),
          });
        }
        api.setSelectedIds(new Set([newObj.id]));
      }
      threadedTextEditRangeRef.current.delete(sourceFrameId);
    },
    [],
  );

  // ── Story map for panel display ──

  const designerStoryMap = useMemo(() => {
    const map = new Map<string, string>();
    const stories = activePage?.stories ?? [];
    for (const s of stories) {
      map.set(s.id, serializeStoryContent(s.content));
    }
    return map;
  }, [activePage?.stories]);

  const designerStoryHtmlMap = useMemo(() => {
    const map = new Map<string, string>();
    const stories = activePage?.stories ?? [];
    for (const s of stories) {
      map.set(s.id, storyNodesToHtml(s.content, s.typography));
    }
    return map;
  }, [activePage?.stories]);

  // ── Story text change from panel textarea ──

  const handleDesignerStoryTextChange = useCallback(
    (storyId: string, newText: string) => {
      const idx = activeIdxRef.current;
      const api = studioApiRef.current;
      const p = pagesRef.current[idx];
      if (!p) return;

      const updatedStories = patchStoryContentPlain(p.stories ?? [], storyId, newText);
      const textFrames = p.textFrames ?? [];

      setPages((prev) => {
        const n = [...prev];
        n[idx] = { ...prev[idx]!, stories: updatedStories };
        return n;
      });

      if (api) {
        const storyById = new Map(updatedStories.map((s) => [s.id, s]));
        const story = storyById.get(storyId);
        if (story && story.frames.length > 1) {
          const layouts = layoutPageStories(updatedStories, textFrames);
          for (const fl of layouts) {
            if (fl.storyId !== storyId) continue;
            const st = storyById.get(fl.storyId);
            if (!st) continue;
            const frameContent = sliceStoryContent(st.content, fl.contentRange.start, fl.contentRange.end);
            const frameTxt = serializeStoryContent(frameContent);
            const richSpans = buildRichSpansForFrame(frameContent);
            api.patchObject(fl.frameId, {
              text: frameTxt,
              _designerOverflow: fl.hasOverflow,
              _designerThreadInfo: { index: Math.max(0, st.frames.indexOf(fl.frameId)), total: st.frames.length },
              _designerRichSpans: richSpans,
            });
          }
        } else if (story && story.frames.length === 1) {
          const layouts = layoutPageStories(updatedStories, textFrames);
          const fl = layouts.find(l => l.storyId === storyId);
          api.patchObject(story.frames[0]!, {
            text: newText,
            _designerOverflow: fl?.hasOverflow ?? false,
          });
        }
      }
    },
    [],
  );

  // ── Story rich text change from panel contentEditable ──

  const handleDesignerStoryRichChange = useCallback(
    (storyId: string, richHtml: string) => {
      const idx = activeIdxRef.current;
      const api = studioApiRef.current;
      const p = pagesRef.current[idx];
      if (!p) return;

      const stories = p.stories ?? [];
      const textFrames = p.textFrames ?? [];

      const newNodes = normalizeInlineRichNodes(htmlToStoryNodes(richHtml));
      const updatedStories = stories.map(s =>
        s.id === storyId ? { ...s, content: newNodes } : s,
      );

      setPages((prev) => {
        const n = [...prev];
        n[idx] = { ...prev[idx]!, stories: updatedStories };
        return n;
      });

      if (api) {
        const layouts = layoutPageStories(updatedStories, textFrames);
        const storyById = new Map(updatedStories.map((s) => [s.id, s]));
        for (const fl of layouts) {
          if (fl.storyId !== storyId) continue;
          const st = storyById.get(fl.storyId);
          if (!st) continue;
          const frameContent = sliceStoryContent(st.content, fl.contentRange.start, fl.contentRange.end);
          const ft = serializeStoryContent(frameContent);
          const richSpans = buildRichSpansForFrame(frameContent);
          api.patchObject(fl.frameId, {
            text: ft,
            _designerOverflow: fl.hasOverflow,
            _designerThreadInfo: { index: Math.max(0, st.frames.indexOf(fl.frameId)), total: st.frames.length },
            _designerRichSpans: richSpans,
          });
        }
      }
    },
    [normalizeInlineRichNodes],
  );

  // ── Unlink text frame ──

  const handleDesignerUnlinkTextFrame = useCallback(
    (frameId: string) => {
      const idx = activeIdxRef.current;
      const p = pagesRef.current[idx];
      if (!p) return;

      const stories = p.stories ?? [];
      const textFrames = p.textFrames ?? [];
      const fr = textFrames.find(f => f.id === frameId);
      const story = stories.find(s => s.id === fr?.storyId);
      if (!fr || !story) return;

      const layouts = layoutPageStories(stories, textFrames);
      const fl = layouts.find(l => l.frameId === frameId);
      const splitIndex = fl?.contentRange.start ?? 0;

      const result = unlinkFrameAt(stories, textFrames, frameId, splitIndex);

      setPages((prev) => {
        const n = [...prev];
        n[idx] = { ...prev[idx]!, stories: result.stories, textFrames: result.textFrames };
        return n;
      });

      const api = studioApiRef.current;
      if (api) {
        const newLayouts = layoutPageStories(result.stories, result.textFrames);
        const textFrameById = new Map(result.textFrames.map((tf) => [tf.id, tf]));
        const storyById = new Map(result.stories.map((s) => [s.id, s]));
        const layoutByFrameId = new Map(newLayouts.map((layout) => [layout.frameId, layout]));
        const objs = api.getObjects();
        for (const obj of objs) {
          if (!obj.isTextFrame) continue;
          const newTf = textFrameById.get(obj.id);
          if (!newTf) continue;
          const newStory = storyById.get(newTf.storyId);
          if (!newStory) continue;
          const nfl = layoutByFrameId.get(obj.id);
          if (!nfl) continue;
          const ftxt = serializeStoryContent(newStory.content).slice(nfl.contentRange.start, nfl.contentRange.end);
          const frameIdx = newStory.frames.indexOf(obj.id);
          api.patchObject(obj.id, {
            text: ftxt,
            storyId: newTf.storyId,
            _designerOverflow: nfl.hasOverflow,
            _designerThreadInfo: newStory.frames.length > 1
              ? { index: Math.max(0, frameIdx), total: newStory.frames.length }
              : undefined,
          });
        }
      }
    },
    [],
  );

  // ── Typography sync (FreehandObject → Story.typography) ──

  const handleDesignerTypographyChange = useCallback(
    (storyId: string, patch: Record<string, unknown>) => {
      const idx = activeIdxRef.current;
      setPages((prev) => {
        const n = [...prev];
        const p = n[idx];
        if (!p) return prev;
        const updatedStories = updateStoryTypography(p.stories ?? [], storyId, patch as any);
        n[idx] = { ...p, stories: updatedStories };
        return n;
      });
    },
    [],
  );

  const [multiPdfBusy, setMultiPdfBusy] = useState(false);
  /** Evita doble ejecución. Si `multiPdfBusy` es false, el guard no debería quedar en true (recuperación tras fallos). */
  const multiPdfExportingRef = useRef(false);
  useEffect(() => {
    if (!multiPdfBusy) {
      multiPdfExportingRef.current = false;
    }
  }, [multiPdfBusy]);

  const handleExportMultiPageVectorPdf = useCallback(async (pdfOpts: VectorPdfExportOptions = {}): Promise<boolean> => {
    if (multiPdfExportingRef.current) return false;
    const pageCount = pagesRef.current.length;
    if (pageCount === 0) return false;
    multiPdfExportingRef.current = true;
    setMultiPdfBusy(true);
    const savedIdx = activeIdxRef.current;
    const markups: string[] = [];
    const isHeadless = Boolean(headlessPdfExport);
    try {
      const { downloadMultiPageVectorPdf } = await import("../freehand/download-vector-pdf");
      for (let i = 0; i < pageCount; i++) {
        const pg = pagesRef.current[i];
        if (!pg) continue;
        const pd = getPageDimensions(pg);
        const expectedKey = designerCanvasSessionKey(designerCanvasInstanceKey, pg.id, pd.width, pd.height);
        flushSync(() => {
          setDesignerPageEnterDirection(null);
          setActivePageIndex(i);
        });
        // Tras `flushSync`, dar tiempo a que el lienzo (re)monte y el `useEffect` asigne `studioApiRef`.
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve());
          });
        });
        // Reparto texto encadenado (1/N, 2/N…) y `_designerRichSpans` por marco: sin esto el SVG/PDF puede quedar vacío o inválido
        // porque el efecto `syncTextFrameLayouts` solo corre ~60 ms después del cambio de página.
        syncTextFrameLayoutsRef.current();
        await new Promise<void>((r) => setTimeout(r, 120));
        let api: DesignerStudioApi | null = null;
        for (let t = 0; t < 200; t++) {
          api = studioApiRef.current;
          const sessionOk = api?.getExportSessionKey?.() === expectedKey;
          if (api?.getVectorPdfMarkupForCurrentPage && sessionOk) {
            break;
          }
          await new Promise((r) => setTimeout(r, 12));
        }
        if (!api?.getVectorPdfMarkupForCurrentPage || api.getExportSessionKey?.() !== expectedKey) {
          continue;
        }
        let m = "";
        for (let r = 0; r < 12; r++) {
          try {
            m = await api.getVectorPdfMarkupForCurrentPage(pdfOpts);
          } catch (e) {
            console.warn("[Designer] PDF multipágina: error generando SVG de la página", i + 1, e);
            m = "";
          }
          if (m.length > 0) break;
          syncTextFrameLayoutsRef.current();
          await new Promise((res) => setTimeout(res, 60));
        }
        if (m) markups.push(m);
      }
      if (markups.length < pageCount) {
        console.warn(
          "[Designer] PDF multipágina: faltan páginas respecto al documento (posible timeout de lienzo o SVG inválido).",
          { esperadas: pageCount, obtenidas: markups.length },
        );
      }
      if (markups.length === 0) {
        const msg = "No se pudo preparar ninguna página para el PDF (el lienzo no estaba listo).";
        if (!isHeadless) {
          alert(`${msg} Cierra el diálogo de exportación e inténtalo de nuevo.`);
        }
        return false;
      }
      const filenameBase = headlessPdfExport?.filenameBase ?? safeDesignerExportFilenameBase(undefined);
      const pdfName = `${filenameBase}.pdf`;
      await downloadMultiPageVectorPdf(markups, pdfName, {
        optimizeImages: pdfOpts.optimizeImages === true,
      });
      onFinalExport?.({
        name: pdfName,
        extension: ".pdf",
        mimeType: "application/pdf",
        exportedFrom: "designer",
        exportFormat: "pdf",
        metadata: { pageCount, exportFormat: "vector_pdf" },
      });
      const imgSnap = countDesignerImagesInPages(pagesRef.current);
      logDesignerExportImagesSummary({
        exportFormat: "vector_pdf",
        pages: pageCount,
        ...imgSnap,
      });
      brainTelemetryRef.current.track({
        kind: "CONTENT_EXPORTED",
        exportFormat: "vector_pdf",
        designer: {
          pageExported: true,
          exportImagesSummary: {
            imageFramesWithContent: imgSnap.imageFramesWithContent,
            looseImageObjects: imgSnap.looseImageObjects,
          },
        },
      });
      void brainTelemetryRef.current.flushTelemetry("export");
      return true;
    } catch (e) {
      console.error("[Designer] PDF multipágina:", e);
      const msg = e instanceof Error ? e.message : String(e);
      if (!isHeadless) {
        alert(`No se pudo generar el PDF: ${msg}`);
      } else {
        throw e instanceof Error ? e : new Error(msg);
      }
      return false;
    } finally {
      flushSync(() => {
        setDesignerPageEnterDirection(null);
        setActivePageIndex(savedIdx);
      });
      multiPdfExportingRef.current = false;
      setMultiPdfBusy(false);
    }
  }, [headlessPdfExport, onFinalExport]);

  useEffect(() => {
    registerLiveDesignerMultipagePdfExport(designerCanvasInstanceKey, handleExportMultiPageVectorPdf);
    return () => unregisterLiveDesignerMultipagePdfExport(designerCanvasInstanceKey);
  }, [designerCanvasInstanceKey, handleExportMultiPageVectorPdf]);

  useEffect(() => {
    if (!headlessPdfExport) return;
    let cancelled = false;
    const { onDone, onError } = headlessPdfExport;
    void (async () => {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 500));
      if (cancelled) return;
      try {
        const ok = await handleExportMultiPageVectorPdf({});
        if (cancelled) return;
        if (ok) onDone();
        else onError(new Error("No se pudo generar el PDF multipágina."));
      } catch (e) {
        if (!cancelled) onError(e instanceof Error ? e : new Error(String(e)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [headlessPdfExport?.requestId, handleExportMultiPageVectorPdf]);

  /** Miniatura del nodo en el grafo: siempre la 1.ª página (con imágenes vía raster SVG). */
  const captureFirstPageThumbnail = useCallback(async () => {
    const list = pagesRef.current;
    if (list.length === 0) return;
    const pg0 = list[0];
    if (!pg0) return;
    const pd = getPageDimensions(pg0);
    const expectedKey = designerCanvasSessionKey(designerCanvasInstanceKey, pg0.id, pd.width, pd.height);

    flushSync(() => {
      setDesignerPageEnterDirection(null);
      setActivePageIndex(0);
    });

    let ready = false;
    for (let t = 0; t < 200; t++) {
      const api = studioApiRef.current;
      if (api?.getExportSessionKey?.() === expectedKey && typeof api.getNodePreviewPngDataUrl === "function") {
        ready = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 12));
    }
    if (!ready) {
      console.warn("[Designer] Preview: lienzo de página 1 no listo a tiempo");
      return;
    }
    const api = studioApiRef.current;
    if (!api?.getNodePreviewPngDataUrl) return;
    const url = await api.getNodePreviewPngDataUrl();
    if (url) onExport(url);
  }, [onExport, designerCanvasInstanceKey]);

  /**
   * Renderiza cada página (o `targetPageIds`) y devuelve su PNG. `maxSide` controla la resolución:
   * sin él (o `fullResolution`) usa el tamaño real del documento. Itera cambiando de página activa
   * con `flushSync` (mismo patrón que el PDF multipágina) esperando a que el lienzo monte.
   */
  const renderPagesToPng = useCallback(
    async (
      opts: {
        targetPageIds?: string[] | null;
        maxSide?: number;
        fullResolution?: boolean;
        onPage?: (pageId: string, dataUrl: string) => void;
      } = {},
    ): Promise<Record<string, string>> => {
      const list = pagesRef.current;
      const out: Record<string, string> = {};
      if (list.length === 0) return out;
      const savedIdx = activeIdxRef.current;
      const targetSet = opts.targetPageIds && opts.targetPageIds.length > 0 ? new Set(opts.targetPageIds) : null;
      const captureTotal =
        targetSet != null
          ? list.filter((p) => p && targetSet.has(p.id)).length
          : list.length;
      if (captureTotal === 0) return out;
      let captureDone = 0;
      flushSync(() => {
        setDesignerPageCaptureBusy(true);
        setDesignerPageCaptureProgress({ done: 0, total: captureTotal });
      });
      try {
        for (let i = 0; i < list.length; i++) {
          const pg = list[i];
          if (!pg) continue;
          if (targetSet && !targetSet.has(pg.id)) continue;
          const pd = getPageDimensions(pg);
          const expectedKey = designerCanvasSessionKey(designerCanvasInstanceKey, pg.id, pd.width, pd.height);
          flushSync(() => {
            setDesignerPageEnterDirection(null);
            setActivePageIndex(i);
          });
          syncTextFrameLayoutsRef.current();
          let api: DesignerStudioApi | null = null;
          let ready = false;
          for (let t = 0; t < 220; t++) {
            api = studioApiRef.current;
            if (api?.getExportSessionKey?.() === expectedKey && typeof api.getNodePreviewPngDataUrl === "function") {
              ready = true;
              break;
            }
            await new Promise((r) => setTimeout(r, 12));
          }
          if (!ready || !api?.getNodePreviewPngDataUrl) continue;
          try {
            const url = await api.getNodePreviewPngDataUrl(
              opts.fullResolution
                ? { fullResolution: true }
                : { maxSide: opts.maxSide ?? 320 },
            );
            if (url) {
              out[pg.id] = url;
              opts.onPage?.(pg.id, url);
              const contentKey = designerPageThumbContentKey(pg);
              setPageThumbnailContentKeys((prev) =>
                prev[pg.id] === contentKey ? prev : { ...prev, [pg.id]: contentKey },
              );
            }
          } catch (e) {
            console.warn("[Designer] renderPagesToPng: página", i + 1, e);
          }
          captureDone += 1;
          setDesignerPageCaptureProgress({ done: captureDone, total: captureTotal });
        }
      } finally {
        flushSync(() => {
          setDesignerPageEnterDirection(null);
          setActivePageIndex(savedIdx);
          setDesignerPageCaptureBusy(false);
          setDesignerPageCaptureProgress(null);
        });
      }
      return out;
    },
    [designerCanvasInstanceKey, syncTextFrameLayoutsRef],
  );

  const refreshRailThumbnailsForPages = useCallback(
    async (pageIds: string[], opts?: { delayMs?: number }) => {
      const needIds = designerPagesNeedingRailThumbnails(
        pagesRef.current,
        pageThumbnailsRef.current,
        pageThumbnailContentKeysRef.current,
        pageIds,
      );
      if (needIds.length === 0) return;
      const gen = ++railThumbBatchGenRef.current;
      if (opts?.delayMs && opts.delayMs > 0) {
        await new Promise((r) => window.setTimeout(r, opts.delayMs));
      }
      if (gen !== railThumbBatchGenRef.current) return;
      await renderPagesToPng({
        targetPageIds: needIds,
        maxSide: 320,
        onPage: (pageId, dataUrl) => {
          if (gen !== railThumbBatchGenRef.current) return;
          setPageThumbnails((prev) => (prev[pageId] === dataUrl ? prev : { ...prev, [pageId]: dataUrl }));
        },
      });
    },
    [renderPagesToPng],
  );

  refreshRailThumbnailsForPagesRef.current = refreshRailThumbnailsForPages;

  // --- Guardar en Inspiración (plantilla Designer) desde el modal Export ---
  const [saveInspirationState, setSaveInspirationState] = useState<
    "idle" | "busy" | "done" | "error"
  >("idle");

  const handleSaveToInspiration = useCallback(async () => {
    if (saveInspirationState === "busy") return;
    const realPages = pagesRef.current;
    const hasContent = realPages.some((p) => (p.objects?.length ?? 0) > 0);
    if (!hasContent) {
      window.alert("Diseña algo antes de guardarlo en Inspiración.");
      return;
    }
    const firstId = realPages[0]?.id ?? null;
    const defaultTitle = safeDesignerExportFilenameBase(undefined) || "Plantilla";
    const title = window.prompt("Nombre de la plantilla para Inspiración", defaultTitle);
    if (title === null) return; // cancelado

    setSaveInspirationState("busy");
    try {
      const rendered = await renderPagesToPng({
        targetPageIds: firstId ? [firstId] : null,
        maxSide: 640,
      });
      const thumbDataUrl = (firstId ? rendered[firstId] : undefined) ?? Object.values(rendered)[0];
      if (!thumbDataUrl) throw new Error("No se pudo rasterizar la miniatura.");
      await saveDesignerPagesToInspiration({
        pages: realPages,
        thumbDataUrl,
        title: title.trim() || defaultTitle,
        projectId: inspirationProjectId,
      });
      setSaveInspirationState("done");
      window.setTimeout(() => setSaveInspirationState("idle"), 2200);
    } catch (error) {
      console.error("[Designer] guardar en Inspiración (modal Export)", error);
      window.alert(
        error instanceof Error
          ? `No se pudo guardar en Inspiración: ${error.message}`
          : "No se pudo guardar en Inspiración.",
      );
      setSaveInspirationState("error");
      window.setTimeout(() => setSaveInspirationState("idle"), 2200);
    }
  }, [inspirationProjectId, renderPagesToPng, saveInspirationState]);

  const handleCloseWithFirstPagePreview = useCallback(async () => {
    // Solo renderiza las páginas que aún no tienen raster (las visitadas/editadas ya lo capturaron en vivo).
    try {
      const have = pageThumbnailsRef.current;
      const missing = designerPagesNeedingRailThumbnails(
        pagesRef.current,
        have,
        pageThumbnailContentKeysRef.current,
      );
      let merged = have;
      if (missing.length > 0) {
        const rendered = await renderPagesToPng({ targetPageIds: missing, maxSide: 320 });
        if (Object.keys(rendered).length > 0) {
          merged = { ...have, ...rendered };
          setPageThumbnails(merged);
        }
      }
      // Publica el raster final de forma síncrona para que el commit del patch live lo persista.
      onUpdatePageThumbnails?.(merged);
      // Miniatura del nodo en el grafo = 1.ª página.
      const first = pagesRef.current[0];
      const firstThumb = first ? merged[first.id] : undefined;
      if (firstThumb) onExport(firstThumb);
      else await captureFirstPageThumbnail();
    } catch {
      await captureFirstPageThumbnail();
    }
    onClose();
  }, [captureFirstPageThumbnail, onClose, onExport, onUpdatePageThumbnails, renderPagesToPng]);

  /** Export headless de PNG full-res por página (Export Multimedia). */
  useEffect(() => {
    if (!headlessImageExport) return;
    let cancelled = false;
    const { requestId: _rid, targetPageIds, maxSide, fullResolution, onPage, onDone, onError } =
      headlessImageExport;
    void (async () => {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 400));
      if (cancelled) return;
      try {
        await renderPagesToPng({
          targetPageIds: targetPageIds ?? null,
          fullResolution: fullResolution ?? !maxSide,
          maxSide,
          onPage: (pageId, dataUrl) => {
            if (!cancelled) onPage(pageId, dataUrl);
          },
        });
        if (!cancelled) onDone();
      } catch (e) {
        if (!cancelled) onError(e instanceof Error ? e : new Error(String(e)));
      }
    })();
    return () => {
      cancelled = true;
    };
    // Solo re-disparar al cambiar el requestId (evita re-ejecuciones por identidad del objeto inline).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headlessImageExport?.requestId, renderPagesToPng]);

  const deExportLockRef = useRef(false);
  const handleExportDe = useCallback(async () => {
    if (deExportLockRef.current) return;
    deExportLockRef.current = true;
    setDeExportBusy(true);
    try {
      const pagesForExport = designerPagesSnapshotForDeExport(
        pagesRef.current,
        activeIdxRef.current,
        studioApiRef.current?.getObjects(),
      );
      await exportDesignerDeFile({
        pages: pagesForExport,
        activePageIndex: activeIdxRef.current,
        autoImageOptimization: autoImageOptimization !== false,
        filenameBase: "diseno-foldder",
      });
      const imgSnapDe = countDesignerImagesInPages(pagesForExport);
      logDesignerExportImagesSummary({
        exportFormat: "de",
        pages: pagesRef.current.length,
        ...imgSnapDe,
      });
      brainTelemetryRef.current.track({
        kind: "CONTENT_EXPORTED",
        exportFormat: "de",
        designer: {
          pageExported: true,
          exportImagesSummary: {
            imageFramesWithContent: imgSnapDe.imageFramesWithContent,
            looseImageObjects: imgSnapDe.looseImageObjects,
          },
        },
      });
      void brainTelemetryRef.current.flushTelemetry("export");
    } catch (e) {
      console.error("[Designer] export .de", e);
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      deExportLockRef.current = false;
      setDeExportBusy(false);
    }
  }, [autoImageOptimization]);

  const handleImportDeFile = useCallback(
    async (file: File) => {
      try {
        const result = await importDesignerDeFile(file);
        setDeImportHydrating(true);
        let finalPages = result.pages;
        try {
          finalPages = await hydrateImportedDesignerPagesMedia(result.pages, {
            designerSpaceId: designerSpaceId ?? null,
          });
        } catch (upErr) {
          console.error("[Designer] import .de → S3", upErr);
          alert(
            upErr instanceof Error
              ? `Las imágenes no se pudieron subir a la nube: ${upErr.message}`
              : String(upErr),
          );
          return;
        } finally {
          setDeImportHydrating(false);
        }
        // El .de ya trae el diseño resuelto (píxeles + bindings). No re-aplicar Dataset aquí:
        // en producción podría sobrescribir imágenes importadas con URLs rotas del catálogo.
        const pagesToSet = finalPages;
        setPages(pagesToSet);
        setActivePageIndex(result.activePageIndex);
        setDesignerPageHydrateNonce((n) => n + 1);
        setPageThumbnails({});
        setPageThumbnailContentKeys({});
        onAutoImageOptimizationChange?.(result.autoImageOptimization);
        queueMicrotask(() => {
          requestDesignerFitToView();
          void refreshDisplayForAllPages(pagesToSet, result.autoImageOptimization !== false);
          if (designerConnectedDataset) {
            const target = pagesToSet[result.activePageIndex];
            const api = studioApiRef.current;
            if (target && api) {
              patchLiveCanvasFromDatasetPageObjects(api, target.objects ?? []);
            }
          }
        });
      } catch (e) {
        console.error("[Designer] import .de", e);
        alert(e instanceof Error ? e.message : String(e));
      }
    },
    [
      designerConnectedDataset,
      designerSpaceId,
      onAutoImageOptimizationChange,
      requestDesignerFitToView,
      refreshDisplayForAllPages,
    ],
  );

  const designerFreehandProps: DesignerEmbedProps = {
    designerMode: true,
    designerSkipAutoNodeExportOnClose: true,
    designerBrainTelemetry: brainTelemetry,
    designerConnectedDataset: datasetConnected ? designerConnectedDataset : null,
    designerConnectedDatasetLoading: datasetConnected ? designerConnectedDatasetLoading : false,
    designerActivePageDatasetRowIndex: resolveDesignerPageDatasetRowIndex(activePage),
    onDesignerSetActivePageRowIndex: setActivePageRowIndex,
    designerPageEnterDirection,
    onDesignerTextFrameCreate: handleDesignerTextFrameCreate,
    onDesignerImageFramePlace: handleDesignerImageFramePlace,
    onDesignerImageFrameImportFile: (frameId, file) => {
      imageFrameTargetIdRef.current = frameId;
      void handleImageFileSelected(file);
    },
    studioApiRef,
    onDesignerTextFrameEdit: handleDesignerTextFrameEdit,
    onDesignerAppendThreadedFrame: handleAppendThreadedFrame,
    designerStoryMap,
    designerStoryHtmlMap,
    onDesignerStoryTextChange: handleDesignerStoryTextChange,
    onDesignerStoryRichChange: handleDesignerStoryRichChange,
    onDesignerUnlinkTextFrame: handleDesignerUnlinkTextFrame,
    onDesignerTypographyChange: handleDesignerTypographyChange,
    designerHistoryBridge,
    designerClipboardRef,
    designerActivePageId: activePage?.id ?? null,
    designerClipboardSourcePageIdRef,
    onDesignerNavigatePage: handleDesignerNavigatePage,
    designerMultipageVectorPdfExport: {
      pageCount: pages.length,
      busy: multiPdfBusy,
      onExport: (opts) => {
        void handleExportMultiPageVectorPdf(opts);
      },
    },
    designerDeDocument: {
      onExport: handleExportDe,
      onImport: () => deImportInputRef.current?.click(),
      busy: deExportBusy || deImportHydrating,
    },
    designerSaveToInspiration: {
      state: saveInspirationState,
      onSave: handleSaveToInspiration,
    },
    designerAutoOptimizeSwitch: {
      enabled: autoImageOptimization,
      onChange: (v) => onAutoImageOptimizationChange?.(v),
    },
    designerOptimizeProgress,
    designerFitToViewNonce,
    designerPageHydrateNonce,
    designerCanvasZenMode,
    onDesignerCanvasZenModeChange: setDesignerCanvasZenMode,
    designerCanvasFormatLabel: {
      width: liveCanvas.width,
      height: liveCanvas.height,
      presetId: activePage?.canvasPresetId ?? null,
    },
    designerPageCaptureBusy,
    designerPageCaptureProgress,
    designerGenerativeFill: generativeFillBridge,
    designerPagesRail: (
      <DesignerPagesRail
        pages={pages}
        activePageIndex={activePageIndex}
        pageThumbnails={pageThumbnails}
        pageThumbnailContentKeys={pageThumbnailContentKeys}
        scrollElRef={designerPagesRailScrollElRef}
        onRailScroll={(top) => {
          designerPagesRailScrollTopRef.current = top;
        }}
        suppressPageThumbClickRef={suppressPageThumbClickRef}
        goToDesignerPage={goToDesignerPage}
        movePage={movePage}
        swapOrientation={swapOrientation}
        duplicatePage={duplicatePage}
        onRequestDeletePages={requestDeletePages}
        onAddPage={addBlankPageAfterActive}
        onRenameSlide={renameSlide}
        datasetLoopLists={
          datasetConnected && designerConnectedDataset
            ? designerConnectedDataset.lists.map((list) => ({
                id: list.id,
                name: list.name,
                cardCount: list.cards.length,
              }))
            : []
        }
        onGenerateLoop={generateDatasetLoopPages}
        loopActive={!!collectDatasetLoopListId(pages)}
        onRequestResizePageModal={(i) => {
          goToDesignerPage(i);
          openCanvasPresetModal(i);
        }}
      />
    ),
  };

  return (
    <div
      className={
        headlessPdfExport || headlessImageExport
          ? "pointer-events-none fixed left-[-10000px] top-0 h-[900px] w-[1400px] overflow-hidden opacity-0"
          : "fixed inset-0 z-[100090] flex flex-col bg-[#0b0d10]"
      }
    >
      <FreehandStudio
        key={freehandStudioInstanceKey}
        nodeId={freehandStudioInstanceKey}
        initialObjects={activePage?.objects ?? []}
        initialArtboards={initialArtboards}
        initialLayoutGuides={activePage?.layoutGuides}
        onClose={handleCloseWithFirstPagePreview}
        onExport={onExport}
        onFinalExport={onFinalExport}
        onUpdateObjects={handleUpdateObjects}
        onUpdateLayoutGuides={handleUpdateLayoutGuides}
        brainConnected={brainConnected}
        studioCanvasPanel={
          <StudioCanvasSideControls
            width={liveCanvas.width}
            height={liveCanvas.height}
            background={artboardCssToDocumentBackground(liveCanvas.background)}
            onDimensionsChange={applyActivePageDimensions}
            onBackgroundChange={applyActivePageBackground}
            onOpenPresetModal={() => openCanvasPresetModal(activePageIndex)}
          />
        }
        studioGenerativeFillPanel={<DesignerGenerativeFillPanel {...generativeFillPanelProps} />}
        {...designerFreehandProps}
      />

      {/* Hidden file input for image frame placement */}
      <input
        ref={imageFrameInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-hidden
        onChange={async (ev) => {
          const f = ev.target.files?.[0];
          ev.target.value = "";
          if (f) await handleImageFileSelected(f);
        }}
      />
      <input
        ref={deImportInputRef}
        type="file"
        accept=".de,application/zip,application/x-zip-compressed"
        className="hidden"
        aria-hidden
        onChange={(ev) => {
          const f = ev.target.files?.[0];
          ev.target.value = "";
          if (f) void handleImportDeFile(f);
        }}
      />

      <DesignerStudioPageBar pages={pages} activePageIndex={activePageIndex} onGoToPage={goToDesignerPage} />

      {canvasPresetModalOpen ? (
        <StudioCanvasPresetPanel
          key={canvasPresetModalKey}
          mode="resize"
          initialWidth={liveCanvas.width}
          initialHeight={liveCanvas.height}
          initialBackground={artboardCssToDocumentBackground(liveCanvas.background)}
          onCanvasPreviewChange={handleCanvasPreviewFromModal}
          onConfirm={handleCanvasPresetConfirm}
          onCancel={handleCanvasPresetCancel}
        />
      ) : null}

      {deletePagesPending ? (
        <DesignerDeletePagesModal
          pageNumbers={deletePagesPending.map((i) => i + 1)}
          totalPages={pages.length}
          onCancel={() => setDeletePagesPending(null)}
          onConfirm={confirmDeletePages}
        />
      ) : null}
    </div>
  );
}
