"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  Plus,
  Trash2,
  Layers,
  ArrowLeftRight,
  Maximize2,
} from "lucide-react";
import FreehandStudio, {
  type FreehandObject,
  type LayoutGuide,
  type DesignerStudioApi,
} from "./FreehandStudio";
import type { DesignerPageState } from "./DesignerNode";
import {
  DEFAULT_DESIGNER_PAGE_FORMAT,
  INDESIGN_PAGE_FORMATS,
  type IndesignPageFormatId,
  formatById,
  getPageDimensions,
} from "./indesign/page-formats";
import { DesignerPagePreview } from "./DesignerPagePreview";
import { createArtboard, type Artboard } from "./freehand/artboard";
import { computeFittingLayout } from "./indesign/image-frame-layout";
import { layoutPageStories } from "./indesign/text-layout";
import type { Story, TextFrame, SpanStyle, Typography } from "./indesign/text-model";
import {
  serializeStoryContent,
  plainTextToStoryNodes,
  htmlToStoryNodes,
  storyNodesToHtml,
  sliceStoryContent,
  flattenStoryContent,
  DEFAULT_TYPOGRAPHY,
} from "./indesign/text-model";
import {
  patchStoryContentPlain,
  appendTextFrameAfter,
  findFollowUpFrameRect,
  unlinkFrameAt,
  updateStoryTypography,
} from "./indesign/text-threading";
import { deleteSupersededS3Key } from "@/lib/s3-delete-client";
import { readResponseJson } from "@/lib/read-response-json";

/** Dimensiones intrínsecas del archivo local (evita diferencias S3/CORS/EXIF vs `<Image>` remota). */
async function readImageFilePixelSize(file: File): Promise<{ w: number; h: number }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file);
      const w = bmp.width;
      const h = bmp.height;
      bmp.close();
      if (w > 0 && h > 0) return { w, h };
    } catch {
      /* fallback */
    }
  }
  const url = URL.createObjectURL(file);
  const img = new window.Image();
  img.decoding = "async";
  img.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image-decode"));
    });
    const w = img.naturalWidth || 100;
    const h = img.naturalHeight || 100;
    return { w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface DesignerStudioProps {
  initialPages: DesignerPageState[];
  activePageIndex: number;
  onClose: () => void;
  onExport: (dataUrl: string) => void;
  onUpdatePages: (pages: DesignerPageState[], activeIdx?: number) => void;
}

let _dpgSeq = 0;
function dpgUid(): string {
  return `dpg_${Date.now()}_${++_dpgSeq}`;
}

export default function DesignerStudio({
  initialPages,
  activePageIndex: initialActiveIdx,
  onClose,
  onExport,
  onUpdatePages,
}: DesignerStudioProps) {
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
  const [formatModal, setFormatModal] = useState<
    null | { kind: "add" } | { kind: "resize"; pageIndex: number }
  >(null);
  const [pendingFormat, setPendingFormat] = useState<IndesignPageFormatId>(DEFAULT_DESIGNER_PAGE_FORMAT);

  const dragPageIndexRef = useRef<number | null>(null);
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

  useEffect(() => {
    requestDesignerFitToView();
  }, [requestDesignerFitToView]);

  const imageFrameInputRef = useRef<HTMLInputElement>(null);
  const imageFrameTargetIdRef = useRef<string | null>(null);

  const studioApiRef = useRef<DesignerStudioApi | null>(null);
  const designerClipboardRef = useRef<FreehandObject[] | null>(null);

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
    [],
  );

  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const activeIdxRef = useRef(activePageIndex);
  activeIdxRef.current = activePageIndex;

  const studioKey = useMemo(() => {
    const ap = pages[activePageIndex] ?? pages[0];
    const d = ap ? getPageDimensions(ap) : { width: 0, height: 0 };
    return `${ap?.id ?? "none"}_${activePageIndex}_${Math.round(d.width)}_${Math.round(d.height)}`;
  }, [pages, activePageIndex]);

  const captureRailThumbnailForActivePage = useCallback(async () => {
    const api = studioApiRef.current;
    const idx = activeIdxRef.current;
    const p = pagesRef.current[idx];
    if (!api?.getNodePreviewPngDataUrl || !p) return;
    const pd = getPageDimensions(p);
    const expectedKey = `${p.id}_${idx}_${Math.round(pd.width)}_${Math.round(pd.height)}`;
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
  }, [studioKey, scheduleRailThumbnail]);

  const commitPages = useCallback(
    (fn: (prev: DesignerPageState[]) => DesignerPageState[]) => {
      setPages((prev) => fn(prev));
    },
    [],
  );

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

  // ── Helper: build rich span array for a frame's content slice ──

  function buildRichSpansForFrame(contentNodes: import("./indesign/text-model").StoryNode[]): Array<{ text: string; style?: SpanStyle }> {
    const runs = flattenStoryContent(contentNodes);
    const spans: Array<{ text: string; style?: SpanStyle }> = [];
    for (const run of runs) {
      const hasStyle = run.style && Object.keys(run.style).length > 0;
      spans.push({ text: run.text, ...(hasStyle ? { style: run.style } : {}) });
    }
    return spans;
  }

  // ── Sync text frame layouts (overflow detection + multi-frame text distribution) ──

  const layoutSyncTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const syncTextFrameLayouts = useCallback(() => {
    const api = studioApiRef.current;
    if (!api) return;
    const ap = pagesRef.current[activeIdxRef.current];
    if (!ap) return;

    const stories = ap.stories ?? [];
    const textFrames = ap.textFrames ?? [];
    if (stories.length === 0) return;

    const editingId = api.getTextEditingId();

    const currentObjs = api.getObjects();

    /** El layout debe usar el mismo ancho/alto que el `TextObject` en el lienzo; si no, maxLines queda corto y el texto salta de marco con huecos. */
    const textFramesForLayout = textFrames.map((tf) => {
      const o = currentObjs.find((c) => c.id === tf.id && (c as { isTextFrame?: boolean }).isTextFrame);
      if (!o) return tf;
      return {
        ...tf,
        x: o.x,
        y: o.y,
        width: o.width,
        height: o.height,
      };
    });

    /** Si algún marco difiere de Story (p. ej. antes de sincronizar), el reparto vertical debe seguir el lienzo. */
    const typographyForLayout = (s: Story): Typography => {
      const typo = s.typography;
      for (const fid of s.frames) {
        const o = currentObjs.find((c) => c.id === fid && (c as { isTextFrame?: boolean }).isTextFrame);
        if (!o) continue;
        const ox = o as FreehandObject & {
          fontFamily?: string;
          fontSize?: number;
          lineHeight?: number;
          letterSpacing?: number;
          textAlign?: string;
          paragraphIndent?: number;
          fontKerning?: string;
          fontVariantCaps?: string;
          fontWeight?: number | string;
          fontStyle?: string;
          fontFeatureSettings?: string;
          fill?: unknown;
        };
        if (
          ox.fontSize !== typo.fontSize ||
          ox.fontFamily !== typo.fontFamily ||
          ox.lineHeight !== typo.lineHeight ||
          ox.letterSpacing !== typo.letterSpacing
        ) {
          const ta = ox.textAlign;
          const align: Typography["align"] =
            ta === "left" || ta === "center" || ta === "right" || ta === "justify" ? ta : typo.align;
          const fillStr =
            typeof ox.fill === "string"
              ? ox.fill
              : (ox.fill as { type?: string; color?: string } | undefined)?.type === "solid"
                ? (ox.fill as { color?: string }).color
                : null;
          const color = fillStr && fillStr !== "none" ? fillStr : typo.color;
          return {
            ...typo,
            fontFamily: ox.fontFamily ?? typo.fontFamily,
            fontSize: typeof ox.fontSize === "number" ? ox.fontSize : typo.fontSize,
            lineHeight: typeof ox.lineHeight === "number" ? ox.lineHeight : typo.lineHeight,
            letterSpacing: typeof ox.letterSpacing === "number" ? ox.letterSpacing : typo.letterSpacing,
            align,
            color,
            fontWeight: ox.fontWeight != null ? String(ox.fontWeight) : typo.fontWeight,
            fontStyle: ox.fontStyle ?? typo.fontStyle,
            paragraphIndent: typeof ox.paragraphIndent === "number" ? ox.paragraphIndent : typo.paragraphIndent,
            fontKerning: (ox.fontKerning === "none" || ox.fontKerning === "auto" ? ox.fontKerning : null) ?? typo.fontKerning,
            fontVariantCaps:
              ox.fontVariantCaps === "normal" || ox.fontVariantCaps === "small-caps" ? ox.fontVariantCaps : typo.fontVariantCaps,
            fontFeatureSettings: ox.fontFeatureSettings ?? typo.fontFeatureSettings,
          };
        }
      }
      return typo;
    };

    const storiesForLayout = stories.map((s) => ({ ...s, typography: typographyForLayout(s) }));
    const layouts = layoutPageStories(storiesForLayout, textFramesForLayout);

    // Determine the "source of truth" frame for typography: the selected frame
    // (user may have just changed its properties, before handleUpdateObjects syncs to Story)
    const selectedFrameId = (() => {
      for (const o of currentObjs) {
        if (!o.isTextFrame) continue;
        // Can't access selectedIds from FreehandStudio, so use a heuristic:
        // find a frame whose typography differs from Story's — that's the one being edited
        const sid = (o as any).storyId as string | undefined;
        if (!sid) continue;
        const s = stories.find(st => st.id === sid);
        if (!s) continue;
        const typo = s.typography;
        const a = o as any;
        if (a.fontSize !== typo.fontSize || a.fontFamily !== typo.fontFamily ||
            a.lineHeight !== typo.lineHeight || a.letterSpacing !== typo.letterSpacing) {
          return o.id;
        }
      }
      return null;
    })();

    // If a frame has been edited (typo differs from Story), use ITS values as source
    let liveTypoSource: Record<string, unknown> | null = null;
    let liveTypoStoryId: string | null = null;
    if (selectedFrameId) {
      const obj = currentObjs.find(o => o.id === selectedFrameId) as any;
      if (obj) {
        liveTypoStoryId = obj.storyId ?? null;
        const fillStr = typeof obj.fill === "string" ? obj.fill : obj.fill?.type === "solid" ? obj.fill.color : null;
        liveTypoSource = {
          fontFamily: obj.fontFamily,
          fontSize: obj.fontSize,
          lineHeight: obj.lineHeight,
          letterSpacing: obj.letterSpacing,
          textAlign: obj.textAlign,
          fontKerning: obj.fontKerning,
          paragraphIndent: obj.paragraphIndent,
          fontVariantCaps: obj.fontVariantCaps,
          fontFeatureSettings: obj.fontFeatureSettings,
          ...(fillStr && fillStr !== "none" ? { fill: fillStr } : {}),
        };
      }
    }

    for (const fl of layouts) {
      const story = stories.find(s => s.id === fl.storyId);
      const total = story?.frames.length ?? 1;
      const index = story ? story.frames.indexOf(fl.frameId) : 0;
      const threadInfo = total > 1 ? { index: Math.max(0, index), total } : undefined;

      // Propagate typography to sibling frames (not the source frame itself)
      const typoPatch: Record<string, unknown> = {};
      if (story && story.frames.length > 1 && fl.frameId !== selectedFrameId) {
        const src = (liveTypoStoryId === story.id && liveTypoSource) ? liveTypoSource : null;
        if (src) {
          const obj = currentObjs.find(o => o.id === fl.frameId) as any;
          if (obj) {
            if (src.fontFamily != null && obj.fontFamily !== src.fontFamily) typoPatch.fontFamily = src.fontFamily;
            if (src.fontSize != null && obj.fontSize !== src.fontSize) typoPatch.fontSize = src.fontSize;
            if (src.lineHeight != null && obj.lineHeight !== src.lineHeight) typoPatch.lineHeight = src.lineHeight;
            if (src.letterSpacing != null && obj.letterSpacing !== src.letterSpacing) typoPatch.letterSpacing = src.letterSpacing;
            if (src.textAlign != null && obj.textAlign !== src.textAlign) typoPatch.textAlign = src.textAlign;
            if (src.fontKerning != null && obj.fontKerning !== src.fontKerning) typoPatch.fontKerning = src.fontKerning;
            if (src.paragraphIndent != null && obj.paragraphIndent !== src.paragraphIndent) typoPatch.paragraphIndent = src.paragraphIndent;
            if (src.fontVariantCaps != null && obj.fontVariantCaps !== src.fontVariantCaps) typoPatch.fontVariantCaps = src.fontVariantCaps;
            if (src.fontFeatureSettings != null && obj.fontFeatureSettings !== src.fontFeatureSettings) typoPatch.fontFeatureSettings = src.fontFeatureSettings;
            if (src.fill != null) {
              const objFill = typeof obj.fill === "string" ? obj.fill : obj.fill?.type === "solid" ? obj.fill.color : null;
              if (objFill !== src.fill) typoPatch.fill = { type: "solid", color: src.fill };
            }
          }
        }
      }

      if (fl.frameId === editingId) {
        api.patchObject(fl.frameId, { _designerOverflow: fl.hasOverflow, _designerThreadInfo: threadInfo });
        continue;
      }
      if (story) {
        const frameContent = sliceStoryContent(story.content, fl.contentRange.start, fl.contentRange.end);
        const frameText = serializeStoryContent(frameContent);
        const richSpans = buildRichSpansForFrame(frameContent);
        api.patchObject(fl.frameId, {
          text: frameText,
          _designerOverflow: fl.hasOverflow,
          _designerThreadInfo: threadInfo,
          _designerRichSpans: richSpans,
          ...typoPatch,
        });
      } else {
        api.patchObject(fl.frameId, { _designerOverflow: fl.hasOverflow, _designerThreadInfo: threadInfo });
      }
    }
  }, []);

  useEffect(() => {
    clearTimeout(layoutSyncTimerRef.current);
    layoutSyncTimerRef.current = setTimeout(syncTextFrameLayouts, 60);
    return () => clearTimeout(layoutSyncTimerRef.current);
  }, [pages, activePageIndex, syncTextFrameLayouts]);

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
      const p = pagesRef.current[idx];
      if (!p) return;

      const stories = p.stories ?? [];
      const textFrames = p.textFrames ?? [];
      const story = stories.find(s => s.id === storyId);
      if (!story) return;

      // Parse rich HTML into StoryNodes if provided
      const newNodes = richHtml ? htmlToStoryNodes(richHtml) : plainTextToStoryNodes(newText);

      let updatedStories: Story[];

      if (story.frames.length <= 1) {
        updatedStories = stories.map(s =>
          s.id === storyId ? { ...s, content: newNodes } : s,
        );
      } else {
        const layouts = layoutPageStories(stories, textFrames);
        const frameLayout = layouts.find(l => l.frameId === frameId);

        if (frameLayout) {
          const before = sliceStoryContent(story.content, 0, frameLayout.contentRange.start);
          const fullText = serializeStoryContent(story.content);
          const after = sliceStoryContent(story.content, frameLayout.contentRange.end, fullText.length);
          const merged = [...before, ...newNodes, ...after];
          updatedStories = stories.map(s =>
            s.id === storyId ? { ...s, content: merged } : s,
          );
        } else {
          updatedStories = stories.map(s =>
            s.id === storyId ? { ...s, content: newNodes } : s,
          );
        }
      }

      setPages((prev) => {
        const n = [...prev];
        n[idx] = { ...prev[idx]!, stories: updatedStories };
        return n;
      });

      const api = studioApiRef.current;
      if (api) {
        const newLayouts = layoutPageStories(updatedStories, textFrames);
        for (const fl of newLayouts) {
          if (fl.storyId !== storyId) continue;
          const st = updatedStories.find(s => s.id === fl.storyId);
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
    [],
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
      const prevKey = (frameObj as { imageFrameContent?: { s3Key?: string } } | undefined)
        ?.imageFrameContent?.s3Key;

      const formData = new FormData();
      formData.append("file", file);
      let uploadRes: Response;
      try {
        uploadRes = await fetch("/api/runway/upload", { method: "POST", body: formData });
      } catch (e) {
        console.error("[Designer] image upload:", e);
        alert("No se pudo subir la imagen (red). Vuelve a intentarlo.");
        return;
      }
      const json = await readResponseJson<{ url?: string; s3Key?: string; error?: string }>(
        uploadRes,
        "POST /api/runway/upload (Designer)",
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
      deleteSupersededS3Key(prevKey, json.s3Key);

      const persistedUrl = json.url;
      let iw = 100;
      let ih = 100;
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

      const fw = frameObj?.width ?? 200;
      const fh = frameObj?.height ?? 200;
      const layout = computeFittingLayout(fw, fh, iw, ih, "fill-proportional");

      const content = {
        src: persistedUrl,
        s3Key: json.s3Key,
        originalWidth: iw,
        originalHeight: ih,
        ...layout,
        fittingMode: "fill-proportional" as const,
      };

      api?.patchObject(frameId, { imageFrameContent: content });

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
        return n;
      });
    },
    [],
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
      queueMicrotask(() => setActivePageIndex(next.length - 1));
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

  const movePage = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      if (fromIndex < 0 || toIndex < 0) return;
      const len = pagesRef.current.length;
      if (fromIndex >= len || toIndex >= len) return;
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
            const fullTxt = serializeStoryContent(st.content);
            const frameTxt = fullTxt.slice(fl.contentRange.start, fl.contentRange.end);
            api.patchObject(fl.frameId, {
              text: frameTxt,
              _designerOverflow: fl.hasOverflow,
              _designerThreadInfo: { index: Math.max(0, st.frames.indexOf(fl.frameId)), total: st.frames.length },
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

      const newNodes = htmlToStoryNodes(richHtml);
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
    [],
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

  const handleExportMultiPageVectorPdf = useCallback(async () => {
    if (multiPdfBusy) return;
    const pageCount = pagesRef.current.length;
    if (pageCount === 0) return;
    setMultiPdfBusy(true);
    const savedIdx = activeIdxRef.current;
    const markups: string[] = [];
    try {
      const { downloadMultiPageVectorPdf } = await import("./freehand/download-vector-pdf");
      for (let i = 0; i < pageCount; i++) {
        const pg = pagesRef.current[i];
        if (!pg) continue;
        // Debe coincidir con `studioKey` / `nodeId` en FreehandStudio: `${pageId}_${index}_${w}_${h}`
        const pd = getPageDimensions(pg);
        const expectedKey = `${pg.id}_${i}_${Math.round(pd.width)}_${Math.round(pd.height)}`;
        flushSync(() => {
          setActivePageIndex(i);
        });
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
          m = await api.getVectorPdfMarkupForCurrentPage();
          if (m.length > 0) break;
          await new Promise((res) => setTimeout(res, 40));
        }
        if (m) markups.push(m);
      }
      if (markups.length === 0) {
        alert("No se pudo preparar ninguna página para el PDF (el lienzo no estaba listo). Cierra el diálogo de exportación e inténtalo de nuevo.");
        return;
      }
      await downloadMultiPageVectorPdf(markups, `diseno-${Date.now()}.pdf`);
    } catch (e) {
      console.error("[Designer] PDF multipágina:", e);
      const msg = e instanceof Error ? e.message : String(e);
      alert(`No se pudo generar el PDF: ${msg}`);
    } finally {
      flushSync(() => {
        setActivePageIndex(savedIdx);
      });
      setMultiPdfBusy(false);
    }
  }, [multiPdfBusy]);

  /** Miniatura del nodo en el grafo: siempre la 1.ª página (con imágenes vía raster SVG). */
  const captureFirstPageThumbnail = useCallback(async () => {
    const list = pagesRef.current;
    if (list.length === 0) return;
    const pg0 = list[0];
    if (!pg0) return;
    const pd = getPageDimensions(pg0);
    const expectedKey = `${pg0.id}_0_${Math.round(pd.width)}_${Math.round(pd.height)}`;

    flushSync(() => {
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
    try {
      const url = await studioApiRef.current!.getNodePreviewPngDataUrl!();
      if (url) onExport(url);
    } catch (e) {
      console.error("[Designer] Preview página 1:", e);
    }
  }, [onExport]);

  const handleCloseWithFirstPagePreview = useCallback(async () => {
    await captureFirstPageThumbnail();
    onClose();
  }, [captureFirstPageThumbnail, onClose]);

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-[#0b0d10]">
      <FreehandStudio
        key={studioKey}
        nodeId={studioKey}
        initialObjects={activePage?.objects ?? []}
        initialArtboards={initialArtboards}
        initialLayoutGuides={activePage?.layoutGuides}
        onClose={handleCloseWithFirstPagePreview}
        onExport={onExport}
        onUpdateObjects={handleUpdateObjects}
        onUpdateLayoutGuides={handleUpdateLayoutGuides}
        designerMode
        designerSkipAutoNodeExportOnClose
        onDesignerTextFrameCreate={handleDesignerTextFrameCreate}
        onDesignerImageFramePlace={handleDesignerImageFramePlace}
        studioApiRef={studioApiRef}
        onDesignerTextFrameEdit={handleDesignerTextFrameEdit}
        onDesignerAppendThreadedFrame={handleAppendThreadedFrame}
        designerStoryMap={designerStoryMap}
        designerStoryHtmlMap={designerStoryHtmlMap}
        onDesignerStoryTextChange={handleDesignerStoryTextChange}
        onDesignerStoryRichChange={handleDesignerStoryRichChange}
        onDesignerUnlinkTextFrame={handleDesignerUnlinkTextFrame}
        onDesignerTypographyChange={handleDesignerTypographyChange}
        designerHistoryBridge={designerHistoryBridge}
        designerClipboardRef={designerClipboardRef}
        designerMultipageVectorPdfExport={{
          pageCount: pages.length,
          busy: multiPdfBusy,
          onExport: handleExportMultiPageVectorPdf,
        }}
        designerFitToViewNonce={designerFitToViewNonce}
        designerPagesRail={
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 items-center justify-center border-b border-white/[0.08] py-2">
              <Layers className="h-3.5 w-3.5 text-violet-300/70" strokeWidth={2} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1 py-1.5">
              <div className="flex flex-col gap-2">
                {pages.map((p, i) => {
                  const pd = getPageDimensions(p);
                  const pf = formatById(p.format);
                  const active = i === activePageIndex;
                  const resLabel = `${Math.round(pd.width)}×${Math.round(pd.height)}`;
                  const railThumb = pageThumbnails[p.id];
                  return (
                    <div
                      key={p.id}
                      className="rounded-[2px] border border-white/[0.08] bg-black/15 px-0.5 py-1"
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const raw = e.dataTransfer.getData("text/plain");
                        const from = dragPageIndexRef.current ?? (raw ? Number.parseInt(raw, 10) : NaN);
                        dragPageIndexRef.current = null;
                        if (Number.isNaN(from) || from === i) return;
                        movePage(from, i);
                      }}
                    >
                      <div className="flex w-full flex-col gap-0.5">
                        <button
                          type="button"
                          draggable
                          title={`${i + 1}. ${pf.label} · ${resLabel} — arrastra para reordenar; clic para ver en pantalla`}
                          className={`relative flex w-full cursor-grab touch-none flex-col items-center gap-0.5 rounded-[2px] border px-0.5 py-0.5 text-left transition active:cursor-grabbing ${
                            active
                              ? "border-violet-400/45 bg-violet-950/35 shadow-[0_0_0_1px_rgba(167,139,250,0.15)]"
                              : "border-white/[0.08] bg-black/20 hover:border-white/15"
                          }`}
                          onDragStart={(e) => {
                            suppressPageThumbClickRef.current = false;
                            dragPageIndexRef.current = i;
                            e.dataTransfer.setData("text/plain", String(i));
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDrag={() => {
                            suppressPageThumbClickRef.current = true;
                          }}
                          onDragEnd={() => {
                            dragPageIndexRef.current = null;
                          }}
                          onClick={() => {
                            if (suppressPageThumbClickRef.current) {
                              suppressPageThumbClickRef.current = false;
                              return;
                            }
                            setActivePageIndex(i);
                            requestDesignerFitToView();
                          }}
                          onDoubleClick={(e) => {
                            e.preventDefault();
                            suppressPageThumbClickRef.current = false;
                            setActivePageIndex(i);
                            requestDesignerFitToView();
                          }}
                        >
                          <div className="flex h-[72px] w-full items-stretch justify-center overflow-hidden rounded-[2px] bg-zinc-950/90 ring-1 ring-inset ring-white/[0.06]">
                            {railThumb ? (
                              // Data URL del export del lienzo; `<Image>` no aporta aquí.
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={railThumb}
                                alt=""
                                className="h-full w-full object-contain"
                                draggable={false}
                              />
                            ) : (
                              <DesignerPagePreview
                                objects={p.objects ?? []}
                                pageWidth={pd.width}
                                pageHeight={pd.height}
                              />
                            )}
                          </div>
                          <span className="font-mono text-[8px] font-bold tabular-nums text-zinc-500">
                            {i + 1}
                          </span>
                          <span className="max-w-full truncate px-0.5 text-center font-mono text-[6px] leading-tight text-zinc-500">
                            {resLabel}
                          </span>
                        </button>
                      </div>
                      <div className="mt-1 flex w-full justify-center gap-0.5">
                        <button
                          type="button"
                          title="Intercambiar orientación"
                          className="rounded-[2px] border border-white/[0.12] bg-white/[0.06] p-0.5 text-white transition hover:bg-white/12"
                          onClick={(e) => {
                            e.stopPropagation();
                            swapOrientation(i);
                          }}
                        >
                          <ArrowLeftRight className="h-2.5 w-2.5" strokeWidth={2} />
                        </button>
                        <button
                          type="button"
                          title="Tamaño del pliego (preset)"
                          className="rounded-[2px] border border-white/[0.12] bg-white/[0.06] p-0.5 text-white transition hover:bg-white/12"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingFormat(pages[i]?.format ?? DEFAULT_DESIGNER_PAGE_FORMAT);
                            setFormatModal({ kind: "resize", pageIndex: i });
                          }}
                        >
                          <Maximize2 className="h-2.5 w-2.5" strokeWidth={2} />
                        </button>
                        <button
                          type="button"
                          title="Eliminar página"
                          disabled={pages.length <= 1}
                          className="rounded-[2px] border border-white/25 bg-white/[0.12] p-0.5 text-white transition hover:bg-white/20 disabled:pointer-events-none disabled:opacity-35"
                          onClick={(e) => {
                            e.stopPropagation();
                            deletePage(i);
                          }}
                        >
                          <Trash2 className="h-2.5 w-2.5" strokeWidth={2} />
                        </button>
                      </div>
                    </div>
                  );
                })}
                <button
                  type="button"
                  title="Añadir página"
                  onClick={() => {
                    setPendingFormat(activePage?.format ?? pages[0]?.format ?? DEFAULT_DESIGNER_PAGE_FORMAT);
                    setFormatModal({ kind: "add" });
                  }}
                  className="flex w-full items-center justify-center gap-1 rounded-[2px] border border-dashed border-white/18 bg-white/[0.02] py-1.5 text-[10px] font-medium text-zinc-400 transition hover:border-violet-400/35 hover:bg-violet-500/10 hover:text-zinc-200"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                  Nueva
                </button>
              </div>
            </div>
          </div>
        }
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

      {/* Barra inferior: saltar de página y añadir (misma interacción que antes) */}
      <div className="pointer-events-auto fixed bottom-0 left-1/2 z-[10001] -translate-x-1/2 flex items-center gap-1 rounded-t-xl border border-b-0 border-white/[0.08] bg-[#0e1015]/90 px-3 py-1.5 backdrop-blur-md">
        {pages.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setActivePageIndex(i);
              requestDesignerFitToView();
            }}
            className={`min-w-[1.75rem] rounded-md px-2 py-1 text-[10px] font-bold tabular-nums transition ${
              i === activePageIndex
                ? "bg-violet-500/25 text-violet-200 ring-1 ring-violet-400/30"
                : "text-zinc-600 hover:bg-white/[0.06] hover:text-zinc-300"
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {/* Formato: nueva página o cambiar tamaño de pliego */}
      {formatModal && (
        <div
          className="fixed inset-0 z-[10060] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-2xl border border-white/12 bg-gradient-to-b from-zinc-900/98 to-[#12121a] p-5 shadow-2xl shadow-black/60 ring-1 ring-white/[0.06]">
            <p className="text-sm font-bold tracking-tight text-zinc-100">
              {formatModal.kind === "add" ? "Nueva página" : "Tamaño del pliego"}
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              {formatModal.kind === "add"
                ? "Elige el preset del pliego que se añadirá al final."
                : "Aplica un preset de tamaño a esta página (se sustituyen ancho y alto personalizados)."}
            </p>
            <div className="mt-4 space-y-2">
              {INDESIGN_PAGE_FORMATS.map((f) => (
                <label
                  key={f.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-xs transition ${
                    pendingFormat === f.id
                      ? "border-violet-400/40 bg-violet-500/10 text-zinc-100"
                      : "border-white/[0.08] bg-black/20 text-zinc-400 hover:border-white/15"
                  }`}
                >
                  <input
                    type="radio"
                    name="fmt"
                    className="accent-violet-500"
                    checked={pendingFormat === f.id}
                    onChange={() => setPendingFormat(f.id)}
                  />
                  <span>
                    {f.label}{" "}
                    <span className="text-zinc-600">
                      ({f.width}×{f.height})
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-white/12 px-4 py-2 text-xs font-medium text-zinc-300 transition hover:bg-white/5"
                onClick={() => setFormatModal(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-lg bg-gradient-to-b from-violet-500 to-purple-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-violet-950/40"
                onClick={formatModal.kind === "add" ? addPage : applyPageFormatPreset}
              >
                {formatModal.kind === "add" ? "Añadir" : "Aplicar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
