"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import FreehandStudio, {
  type FreehandObject,
  type LayoutGuide,
  type DesignerStudioApi,
} from "../FreehandStudio";
import type { DesignerPageState } from "./DesignerNode";
import {
  DEFAULT_DESIGNER_PAGE_FORMAT,
  type IndesignPageFormatId,
  formatById,
  getPageDimensions,
} from "../indesign/page-formats";
import { createArtboard, type Artboard } from "../freehand/artboard";
import type { VectorPdfExportOptions } from "../freehand/text-outline";
import { computeFittingLayout } from "../indesign/image-frame-layout";
import { layoutPageStories } from "../indesign/text-layout";
import type { Story, StoryNode, TextFrame, Typography } from "../indesign/text-model";
import {
  serializeStoryContent,
  plainTextToStoryNodes,
  htmlToStoryNodes,
  storyNodesToHtml,
  flattenStoryContent,
  sliceStoryContent,
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
import { useDesignerSpaceId } from "@/contexts/DesignerSpaceIdContext";
import { newDesignerAssetId, optimizeImageBlobToOptFormat } from "./designer-image-pipeline";
import { exportDesignerDeFile, importDesignerDeFile } from "./designer-document-file";
import { uploadImportedDesignerBlobUrlsToS3 } from "./designer-de-s3-hydrate";
import {
  buildRichSpansForFrame,
  designerCanvasSessionKey,
  dpgUid,
  duplicateDesignerPageState,
  readImageFilePixelSize,
} from "./designer-studio-pure";
import { DesignerFormatModal, type DesignerFormatModalState } from "./DesignerFormatModal";
import { DesignerPagesRail } from "./DesignerPagesRail";
import { DesignerStudioPageBar } from "./DesignerStudioPageBar";
import { useDesignerImagePipeline } from "./useDesignerImagePipeline";
import { useDesignerTextFrameLayoutSync } from "./useDesignerTextFrameLayoutSync";
import { useBrainNodeTelemetry } from "@/lib/brain/use-brain-node-telemetry";
import type { DesignerEmbedProps } from "../freehand/designer-embed-props";
import { countDesignerImagesInPages } from "./designer-export-image-summary";
import {
  logDesignerExportImagesSummary,
  trackDesignerImageImported,
  trackDesignerImageUsed,
} from "./designer-image-telemetry";

interface DesignerStudioProps {
  initialPages: DesignerPageState[];
  activePageIndex: number;
  onClose: () => void;
  onExport: (dataUrl: string) => void;
  onUpdatePages: (pages: DesignerPageState[], activeIdx?: number) => void;
  /** Id estable del nodo en el canvas (React Flow); el lienzo no se remonta al cambiar de página. */
  designerCanvasInstanceKey: string;
  /** Persistido en el nodo Designer: auto-optimización de imágenes en background. */
  autoImageOptimization?: boolean;
  onAutoImageOptimizationChange?: (enabled: boolean) => void;
  brainConnected?: boolean;
}

export default function DesignerStudio({
  initialPages,
  activePageIndex: initialActiveIdx,
  onClose,
  onExport,
  onUpdatePages,
  designerCanvasInstanceKey,
  autoImageOptimization = true,
  onAutoImageOptimizationChange,
  brainConnected = false,
}: DesignerStudioProps) {
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
  const [formatModal, setFormatModal] = useState<DesignerFormatModalState>(null);
  const [pendingFormat, setPendingFormat] = useState<IndesignPageFormatId>(DEFAULT_DESIGNER_PAGE_FORMAT);

  /** Evita activar la página al soltar tras un drag HTML5 de reordenación. */
  const suppressPageThumbClickRef = useRef(false);

  /** Miniaturas raster del lienzo real (misma pipeline que el preview del nodo). */
  const [pageThumbnails, setPageThumbnails] = useState<Record<string, string>>({});
  /** En el navegador `setTimeout` devuelve `number`; con @types/node a veces choca con `NodeJS.Timeout`. */
  const railThumbTimerRef = useRef<number | undefined>(undefined);
  const scheduleRailThumbRef = useRef<() => void>(() => {});

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
      setDesignerPageEnterDirection(animate ? (nextIdx > cur ? "next" : "prev") : null);
      setActivePageIndex(nextIdx);
      queueMicrotask(() => requestDesignerFitToView());
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

  const studioApiRef = useRef<DesignerStudioApi | null>(null);
  const designerClipboardRef = useRef<FreehandObject[] | null>(null);
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

  const captureRailThumbnailForActivePage = useCallback(async () => {
    const api = studioApiRef.current;
    const idx = activeIdxRef.current;
    const p = pagesRef.current[idx];
    if (!api?.getNodePreviewPngDataUrl || !p) return;
    const pd = getPageDimensions(p);
    const expectedKey = designerCanvasSessionKey(designerCanvasInstanceKey, p.id, pd.width, pd.height);
    if (api.getExportSessionKey?.() !== expectedKey) return;
    try {
      const url = await api.getNodePreviewPngDataUrl({ maxSide: 220 });
      if (!url) return;
      setPageThumbnails((prev) => (prev[p.id] === url ? prev : { ...prev, [p.id]: url }));
    } catch {
      /* ignore */
    }
  }, []);

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

  const activePage = pages[activePageIndex] ?? pages[0];

  const initialArtboards = useMemo((): Artboard[] => {
    if (!activePage) return [];
    const dims = getPageDimensions(activePage);
    return [
      createArtboard({
        name: `Page ${activePageIndex + 1}`,
        x: 0,
        y: 0,
        width: dims.width,
        height: dims.height,
        background: "#ffffff",
      }),
    ];
  }, [activePage, activePageIndex]);

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
    (frameId: string, storyId: string, newText: string, richHtml?: string) => {
      const idx = activeIdxRef.current;
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

        const newNodes = richHtml
          ? normalizeInlineRichNodes(htmlToStoryNodes(richHtml))
          : plainTextToStoryNodes(newText);

        let nextStories: Story[];
        if (story.frames.length <= 1) {
          nextStories = stories.map((s) =>
            s.id === storyId ? { ...s, content: newNodes } : s,
          );
        } else {
          const layouts = layoutPageStories(stories, textFrames);
          const frameLayout = layouts.find((l) => l.frameId === frameId);
          if (frameLayout) {
            const before = sliceStoryContent(story.content, 0, frameLayout.contentRange.start);
            const currentRangeLen = Math.max(0, frameLayout.contentRange.end - frameLayout.contentRange.start);
            const nextRangeLen = flattenStoryContent(newNodes).reduce((sum, run) => sum + run.text.length, 0);
            /**
             * Si el frame se encoge por reflow (p.ej. salto manual de línea), parte del texto que el editor todavía tiene
             * ya puede haberse movido al siguiente frame. Extendemos el corte del "after" para evitar solape/duplicado.
             */
            const overlapCompensatedEnd =
              frameLayout.contentRange.end + Math.max(0, nextRangeLen - currentRangeLen);
            const after = sliceStoryContent(story.content, overlapCompensatedEnd, Number.MAX_SAFE_INTEGER);
            const merged = [...before, ...newNodes, ...after];
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
        for (const fl of newLayouts) {
          if (fl.storyId !== storyId) continue;
          const st = storiesForPatch.find((s) => s.id === fl.storyId);
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

  const addPage = useCallback(() => {
    const newPage: DesignerPageState = {
      id: dpgUid(),
      format: pendingFormat,
      objects: [],
      layoutGuides: [],
      stories: [],
      textFrames: [],
      imageFrames: [],
    };
    commitPages((prev) => {
      const next = [...prev, newPage];
      queueMicrotask(() => {
        setDesignerPageEnterDirection("next");
        setActivePageIndex(next.length - 1);
      });
      return next;
    });
    setFormatModal(null);
  }, [commitPages, pendingFormat]);

  const applyPageFormatPreset = useCallback(() => {
    setPages((prev) => {
      if (formatModal?.kind !== "resize") return prev;
      const idx = formatModal.pageIndex;
      if (idx < 0 || idx >= prev.length) return prev;
      const n = [...prev];
      const p = n[idx];
      if (!p) return prev;
      n[idx] = {
        ...p,
        format: pendingFormat,
        customWidth: undefined,
        customHeight: undefined,
      };
      return n;
    });
    setFormatModal(null);
  }, [formatModal, pendingFormat]);

  const deletePage = useCallback((idx: number) => {
    const removedId = pagesRef.current[idx]?.id;
    if (removedId) {
      setPageThumbnails((th) => {
        if (!th[removedId]) return th;
        const next = { ...th };
        delete next[removedId];
        return next;
      });
    }
    setDesignerPageEnterDirection(null);
    setPages((prev) => {
      if (prev.length <= 1) return prev;
      const filtered = prev.filter((_, i) => i !== idx);
      setActivePageIndex((ai) => {
        if (ai < idx) return ai;
        if (ai > idx) return ai - 1;
        return Math.min(idx, Math.max(0, filtered.length - 1));
      });
      return filtered;
    });
  }, []);

  const duplicatePage = useCallback(
    (idx: number) => {
      const source = pagesRef.current[idx];
      if (!source) return;
      const dup = duplicateDesignerPageState(source);
      commitPages((prev) => {
        const next = [...prev.slice(0, idx + 1), dup, ...prev.slice(idx + 1)];
        queueMicrotask(() => {
          setDesignerPageEnterDirection("next");
          setActivePageIndex(idx + 1);
        });
        return next;
      });
    },
    [commitPages],
  );

  const addPageFromLast = useCallback(() => {
    const lastIdx = Math.max(0, pagesRef.current.length - 1);
    const source = pagesRef.current[lastIdx];
    if (!source) return;
    const dup = duplicateDesignerPageState(source);
    commitPages((prev) => {
      const next = [...prev, dup];
      queueMicrotask(() => {
        setDesignerPageEnterDirection("next");
        setActivePageIndex(next.length - 1);
      });
      return next;
    });
  }, [commitPages]);

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
        return next;
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
        n[idx] = { ...p, customWidth: ch, customHeight: cw };
        return n;
      });
    },
    [commitPages],
  );

  // ── Threading: append frame after overflow ──

  const appendGuardRef = useRef<string | null>(null);

  const handleAppendThreadedFrame = useCallback(
    (sourceFrameId: string) => {
      if (appendGuardRef.current === sourceFrameId) return;
      appendGuardRef.current = sourceFrameId;
      setTimeout(() => { appendGuardRef.current = null; }, 300);

      const api = studioApiRef.current;
      if (!api) return;
      const idx = activeIdxRef.current;
      const p = pagesRef.current[idx];
      if (!p) return;

      const stories = p.stories ?? [];
      const textFrames = p.textFrames ?? [];
      const sourceTf = textFrames.find(tf => tf.id === sourceFrameId);
      if (!sourceTf) return;

      const story = stories.find(s => s.id === sourceTf.storyId);
      if (story) {
        const frameIdx = story.frames.indexOf(sourceFrameId);
        if (frameIdx >= 0 && frameIdx < story.frames.length - 1) return;
      }

      const pageDims = getPageDimensions(p);
      const box = findFollowUpFrameRect(sourceTf, textFrames, pageDims.width, pageDims.height, {
        width: sourceTf.width,
        height: sourceTf.height,
      });

      const result = appendTextFrameAfter(stories, textFrames, sourceFrameId, box);

      const newFrame = result.textFrames.find(tf => !textFrames.some(old => old.id === tf.id));

      setPages((prev) => {
        const n = [...prev];
        n[idx] = { ...prev[idx]!, stories: result.stories, textFrames: result.textFrames };
        return n;
      });

      if (newFrame) {
        const story = result.stories.find(s => s.id === newFrame.storyId);
        const typo = story?.typography ?? DEFAULT_TYPOGRAPHY;

        const newObj = {
          id: newFrame.id,
          type: "text" as const,
          textMode: "area" as const,
          text: "",
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
        } as FreehandObject;

        api.addObject(newObj);
        api.setSelectedIds(new Set([newObj.id]));
      }
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
        const story = updatedStories.find(s => s.id === storyId);
        if (story && story.frames.length > 1) {
          const layouts = layoutPageStories(updatedStories, textFrames);
          for (const fl of layouts) {
            if (fl.storyId !== storyId) continue;
            const st = updatedStories.find(s => s.id === fl.storyId);
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
        for (const fl of layouts) {
          if (fl.storyId !== storyId) continue;
          const st = updatedStories.find(s => s.id === fl.storyId);
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
        const objs = api.getObjects();
        for (const obj of objs) {
          if (!obj.isTextFrame) continue;
          const newTf = result.textFrames.find(tf => tf.id === obj.id);
          if (!newTf) continue;
          const newStory = result.stories.find(s => s.id === newTf.storyId);
          if (!newStory) continue;
          const nfl = newLayouts.find(l => l.frameId === obj.id);
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

  const handleExportMultiPageVectorPdf = useCallback(async (pdfOpts: VectorPdfExportOptions) => {
    if (multiPdfExportingRef.current) return;
    const pageCount = pagesRef.current.length;
    if (pageCount === 0) return;
    multiPdfExportingRef.current = true;
    setMultiPdfBusy(true);
    const savedIdx = activeIdxRef.current;
    const markups: string[] = [];
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
        alert("No se pudo preparar ninguna página para el PDF (el lienzo no estaba listo). Cierra el diálogo de exportación e inténtalo de nuevo.");
        return;
      }
      await downloadMultiPageVectorPdf(markups, `diseno-${Date.now()}.pdf`, {
        optimizeImages: pdfOpts.optimizeImages === true,
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
    } catch (e) {
      console.error("[Designer] PDF multipágina:", e);
      const msg = e instanceof Error ? e.message : String(e);
      alert(`No se pudo generar el PDF: ${msg}`);
    } finally {
      flushSync(() => {
        setDesignerPageEnterDirection(null);
        setActivePageIndex(savedIdx);
      });
      multiPdfExportingRef.current = false;
      setMultiPdfBusy(false);
    }
  }, []);

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

  const handleCloseWithFirstPagePreview = useCallback(async () => {
    await captureFirstPageThumbnail();
    onClose();
  }, [captureFirstPageThumbnail, onClose]);

  const deExportLockRef = useRef(false);
  const handleExportDe = useCallback(async () => {
    if (deExportLockRef.current) return;
    deExportLockRef.current = true;
    setDeExportBusy(true);
    try {
      await exportDesignerDeFile({
        pages: JSON.parse(JSON.stringify(pagesRef.current)) as DesignerPageState[],
        activePageIndex: activeIdxRef.current,
        autoImageOptimization: autoImageOptimization !== false,
        filenameBase: "diseno-foldder",
      });
      const imgSnapDe = countDesignerImagesInPages(pagesRef.current);
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
          finalPages = await uploadImportedDesignerBlobUrlsToS3(result.pages, {
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
        setPages(finalPages);
        setActivePageIndex(result.activePageIndex);
        setPageThumbnails({});
        onAutoImageOptimizationChange?.(result.autoImageOptimization);
        queueMicrotask(() => {
          requestDesignerFitToView();
          void refreshDisplayForAllPages(finalPages, result.autoImageOptimization !== false);
        });
      } catch (e) {
        console.error("[Designer] import .de", e);
        alert(e instanceof Error ? e.message : String(e));
      }
    },
    [
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
      onExport: handleExportMultiPageVectorPdf,
    },
    designerDeDocument: {
      onExport: handleExportDe,
      onImport: () => deImportInputRef.current?.click(),
      busy: deExportBusy || deImportHydrating,
    },
    designerAutoOptimizeSwitch: {
      enabled: autoImageOptimization,
      onChange: (v) => onAutoImageOptimizationChange?.(v),
    },
    designerOptimizeProgress,
    designerFitToViewNonce,
    designerCanvasZenMode,
    onDesignerCanvasZenModeChange: setDesignerCanvasZenMode,
    designerPagesRail: (
      <DesignerPagesRail
        pages={pages}
        activePageIndex={activePageIndex}
        pageThumbnails={pageThumbnails}
        scrollElRef={designerPagesRailScrollElRef}
        onRailScroll={(top) => {
          designerPagesRailScrollTopRef.current = top;
        }}
        suppressPageThumbClickRef={suppressPageThumbClickRef}
        goToDesignerPage={goToDesignerPage}
        movePage={movePage}
        swapOrientation={swapOrientation}
        duplicatePage={duplicatePage}
        deletePage={deletePage}
        onAddPage={addPageFromLast}
        onRequestResizePageModal={(i) => {
          setPendingFormat(pages[i]?.format ?? DEFAULT_DESIGNER_PAGE_FORMAT);
          setFormatModal({ kind: "resize", pageIndex: i });
        }}
      />
    ),
  };

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-[#0b0d10]">
      <FreehandStudio
        key={freehandStudioInstanceKey}
        nodeId={freehandStudioInstanceKey}
        initialObjects={activePage?.objects ?? []}
        initialArtboards={initialArtboards}
        initialLayoutGuides={activePage?.layoutGuides}
        onClose={handleCloseWithFirstPagePreview}
        onExport={onExport}
        onUpdateObjects={handleUpdateObjects}
        onUpdateLayoutGuides={handleUpdateLayoutGuides}
        brainConnected={brainConnected}
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

      <DesignerFormatModal
        formatModal={formatModal}
        pendingFormat={pendingFormat}
        onPendingFormatChange={setPendingFormat}
        onDismiss={() => setFormatModal(null)}
        onConfirmAdd={addPage}
        onConfirmResize={applyPageFormatPreset}
      />
    </div>
  );
}
