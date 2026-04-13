"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Layers,
  ArrowLeftRight,
  Type,
  ImageIcon,
} from "lucide-react";
import FreehandStudio, {
  type FreehandObject,
  type LayoutGuide,
  type DesignerStudioApi,
} from "./FreehandStudio";
import type { DesignerPageState } from "./DesignerNode";
import {
  INDESIGN_PAGE_FORMATS,
  type IndesignPageFormatId,
  formatById,
  getPageDimensions,
} from "./indesign/page-formats";
import { createArtboard, type Artboard } from "./freehand/artboard";
import { computeFittingLayout } from "./indesign/image-frame-layout";
import { layoutPageStories } from "./indesign/text-layout";
import type { Story, TextFrame } from "./indesign/text-model";
import {
  serializeStoryContent,
  plainTextToStoryNodes,
  DEFAULT_TYPOGRAPHY,
} from "./indesign/text-model";
import {
  patchStoryContentPlain,
  appendTextFrameAfter,
  findFollowUpFrameRect,
  unlinkFrameAt,
  updateStoryTypography,
} from "./indesign/text-threading";

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
            format: "a4v" as IndesignPageFormatId,
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

  const [addPageOpen, setAddPageOpen] = useState(false);
  const [pendingFormat, setPendingFormat] = useState<IndesignPageFormatId>("a4v");
  const [pagesPanelOpen, setPagesPanelOpen] = useState(true);

  const imageFrameInputRef = useRef<HTMLInputElement>(null);
  const imageFrameTargetIdRef = useRef<string | null>(null);

  const studioApiRef = useRef<DesignerStudioApi | null>(null);

  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const activeIdxRef = useRef(activePageIndex);
  activeIdxRef.current = activePageIndex;

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

    const layouts = layoutPageStories(stories, textFrames);
    const currentObjs = api.getObjects();

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
      if (story && story.frames.length > 1) {
        const fullText = serializeStoryContent(story.content);
        const frameText = fullText.slice(fl.contentRange.start, fl.contentRange.end);
        api.patchObject(fl.frameId, {
          text: frameText,
          _designerOverflow: fl.hasOverflow,
          _designerThreadInfo: threadInfo,
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

        const story: Story = {
          id: storyId,
          content: plainTextToStoryNodes(""),
          frames: [frameId],
          typography: { ...DEFAULT_TYPOGRAPHY },
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
    (frameId: string, storyId: string, newText: string) => {
      const idx = activeIdxRef.current;
      const p = pagesRef.current[idx];
      if (!p) return;

      const stories = p.stories ?? [];
      const textFrames = p.textFrames ?? [];
      const story = stories.find(s => s.id === storyId);
      if (!story) return;

      let updatedStories: Story[];

      if (story.frames.length <= 1) {
        updatedStories = patchStoryContentPlain(stories, storyId, newText);
      } else {
        const fullText = serializeStoryContent(story.content);
        const layouts = layoutPageStories(stories, textFrames);
        const frameLayout = layouts.find(l => l.frameId === frameId);

        let updatedFullText: string;
        if (frameLayout) {
          updatedFullText =
            fullText.slice(0, frameLayout.contentRange.start) +
            newText +
            fullText.slice(frameLayout.contentRange.end);
        } else {
          updatedFullText = newText;
        }
        updatedStories = patchStoryContentPlain(stories, storyId, updatedFullText);
      }

      setPages((prev) => {
        const n = [...prev];
        n[idx] = { ...prev[idx]!, stories: updatedStories };
        return n;
      });

      if (story.frames.length > 1) {
        const api = studioApiRef.current;
        if (api) {
          const newLayouts = layoutPageStories(updatedStories, textFrames);
          for (const fl of newLayouts) {
            if (fl.storyId !== storyId) continue;
            const st = updatedStories.find(s => s.id === fl.storyId);
            if (!st) continue;
            const ft = serializeStoryContent(st.content).slice(fl.contentRange.start, fl.contentRange.end);
            api.patchObject(fl.frameId, { text: ft, _designerOverflow: fl.hasOverflow });
          }
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

      const url = URL.createObjectURL(file);
      const img = new window.Image();
      img.src = url;
      await new Promise<void>((res) => {
        img.onload = () => res();
        img.onerror = () => res();
      });
      const iw = img.naturalWidth || 100;
      const ih = img.naturalHeight || 100;

      const frameObj = api?.getObjects().find(o => o.id === frameId);
      const fw = frameObj?.width ?? 200;
      const fh = frameObj?.height ?? 200;
      const layout = computeFittingLayout(fw, fh, iw, ih, "fill-proportional");

      const content = {
        src: url,
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
          objects: p.objects.map(o =>
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
    setAddPageOpen(false);
  }, [commitPages, pendingFormat]);

  const deletePage = useCallback(
    (idx: number) => {
      if (pagesRef.current.length <= 1) return;
      commitPages((prev) => prev.filter((_, i) => i !== idx));
      setActivePageIndex((i) => Math.min(i >= idx ? i - 1 : i, pagesRef.current.length - 2));
    },
    [commitPages],
  );

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

  const studioKey = `${activePage?.id ?? "none"}_${activePageIndex}`;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-[#0b0d10]">
      <FreehandStudio
        key={studioKey}
        nodeId={studioKey}
        initialObjects={activePage?.objects ?? []}
        initialArtboards={initialArtboards}
        initialLayoutGuides={activePage?.layoutGuides}
        onClose={onClose}
        onExport={onExport}
        onUpdateObjects={handleUpdateObjects}
        onUpdateLayoutGuides={handleUpdateLayoutGuides}
        designerMode
        onDesignerTextFrameCreate={handleDesignerTextFrameCreate}
        onDesignerImageFramePlace={handleDesignerImageFramePlace}
        studioApiRef={studioApiRef}
        onDesignerTextFrameEdit={handleDesignerTextFrameEdit}
        onDesignerAppendThreadedFrame={handleAppendThreadedFrame}
        designerStoryMap={designerStoryMap}
        onDesignerStoryTextChange={handleDesignerStoryTextChange}
        onDesignerUnlinkTextFrame={handleDesignerUnlinkTextFrame}
        onDesignerTypographyChange={handleDesignerTypographyChange}
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

      {/* Pages panel — right side overlay */}
      <div
        className={`pointer-events-auto fixed right-0 top-0 bottom-0 z-[10001] flex flex-col transition-transform duration-300 ${
          pagesPanelOpen ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ width: 220 }}
      >
        <div className="flex h-full flex-col border-l border-white/[0.08] bg-[#0e1015]/95 backdrop-blur-xl">
          <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] px-3 py-2.5">
            <Layers className="h-4 w-4 text-violet-300/70" strokeWidth={2} />
            <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-zinc-300">
              Páginas
            </span>
            <span className="ml-auto text-[10px] text-zinc-600">{pages.length}</span>
            <button
              type="button"
              onClick={() => setPagesPanelOpen(false)}
              className="ml-1 rounded-md p-1 text-zinc-600 hover:bg-white/10 hover:text-zinc-300"
            >
              <X size={14} />
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 py-2.5">
            {pages.map((p, i) => {
              const pd = getPageDimensions(p);
              const pf = formatById(p.format);
              const maxThumb = 44;
              const tw = pd.width >= pd.height ? maxThumb : Math.round((maxThumb * pd.width) / pd.height);
              const th = pd.height >= pd.width ? maxThumb : Math.round((maxThumb * pd.height) / pd.width);
              const storyCount = (p.stories ?? []).length;
              const imgFrameCount = (p.objects ?? []).filter(o => o.isImageFrame).length;
              return (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setActivePageIndex(i);
                    }
                  }}
                  className={`group relative flex cursor-pointer flex-col gap-2 rounded-xl border p-2.5 transition ${
                    i === activePageIndex
                      ? "border-violet-400/40 bg-gradient-to-b from-violet-950/40 to-zinc-950/60 shadow-[0_0_0_1px_rgba(167,139,250,0.12)]"
                      : "border-white/[0.08] bg-black/25 hover:border-white/18 hover:bg-black/35"
                  }`}
                  onClick={() => setActivePageIndex(i)}
                >
                  <div className="flex h-[3.25rem] w-full items-center justify-center rounded-lg bg-zinc-950/80 ring-1 ring-inset ring-white/[0.06]">
                    <div
                      className="rounded-sm bg-white shadow-md shadow-black/40 ring-1 ring-black/10"
                      style={{ width: tw, height: th }}
                    />
                  </div>
                  <div className="min-w-0">
                    <span className="block truncate font-mono text-[10px] font-semibold text-zinc-300">
                      {i + 1}. {pf.label}
                    </span>
                    <span className="text-[9px] text-zinc-600">
                      {pd.width}×{pd.height}
                      {storyCount > 0 && <> · {storyCount} <Type size={8} className="inline" /></>}
                      {imgFrameCount > 0 && <> · {imgFrameCount} <ImageIcon size={8} className="inline" /></>}
                    </span>
                  </div>

                  {i === activePageIndex && (
                    <button
                      type="button"
                      className="mt-1 flex w-full items-center justify-center gap-1 rounded-md border border-white/12 bg-white/[0.04] py-1 text-[9px] font-semibold text-zinc-400 transition hover:bg-white/10 hover:text-zinc-200"
                      onClick={(e) => {
                        e.stopPropagation();
                        swapOrientation(i);
                      }}
                    >
                      <ArrowLeftRight className="h-3 w-3" />
                      Orientación
                    </button>
                  )}

                  {pages.length > 1 && (
                    <div className="absolute right-1.5 top-1.5 flex flex-col gap-0.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                      <button
                        type="button"
                        title="Subir página"
                        disabled={i === 0}
                        className="rounded-md p-0.5 text-zinc-500 hover:bg-white/10 hover:text-zinc-200 disabled:pointer-events-none disabled:opacity-25"
                        onClick={(e) => {
                          e.stopPropagation();
                          movePage(i, i - 1);
                        }}
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        title="Bajar página"
                        disabled={i === pages.length - 1}
                        className="rounded-md p-0.5 text-zinc-500 hover:bg-white/10 hover:text-zinc-200 disabled:pointer-events-none disabled:opacity-25"
                        onClick={(e) => {
                          e.stopPropagation();
                          movePage(i, i + 1);
                        }}
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        title="Eliminar página"
                        className="rounded-md p-0.5 text-zinc-500 hover:bg-rose-500/25 hover:text-rose-200"
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePage(i);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            <button
              type="button"
              onClick={() => setAddPageOpen(true)}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/18 bg-white/[0.02] py-2.5 text-[11px] font-semibold text-zinc-500 transition hover:border-violet-400/35 hover:bg-violet-500/5 hover:text-zinc-300"
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              Añadir página
            </button>
          </div>
        </div>
      </div>

      {/* Pages panel toggle (when collapsed) */}
      {!pagesPanelOpen && (
        <button
          type="button"
          onClick={() => setPagesPanelOpen(true)}
          className="pointer-events-auto fixed right-3 top-1/2 z-[10001] -translate-y-1/2 flex flex-col items-center gap-1 rounded-xl border border-white/15 bg-[#0e1015]/90 px-2 py-3 text-zinc-500 backdrop-blur-md transition hover:border-violet-400/30 hover:text-zinc-200"
          title="Abrir panel de páginas"
        >
          <Layers size={16} />
          <span className="text-[8px] font-bold uppercase tracking-wider">{pages.length}p</span>
        </button>
      )}

      {/* Page indicator bar at bottom */}
      <div className="pointer-events-auto fixed bottom-0 left-1/2 z-[10001] -translate-x-1/2 flex items-center gap-1 rounded-t-xl border border-b-0 border-white/[0.08] bg-[#0e1015]/90 px-3 py-1.5 backdrop-blur-md">
        {pages.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setActivePageIndex(i)}
            className={`min-w-[1.75rem] rounded-md px-2 py-1 text-[10px] font-bold tabular-nums transition ${
              i === activePageIndex
                ? "bg-violet-500/25 text-violet-200 ring-1 ring-violet-400/30"
                : "text-zinc-600 hover:bg-white/[0.06] hover:text-zinc-300"
            }`}
          >
            {i + 1}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setAddPageOpen(true)}
          className="rounded-md px-1.5 py-1 text-zinc-600 transition hover:bg-white/[0.06] hover:text-zinc-300"
          title="Añadir página"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Add page modal */}
      {addPageOpen && (
        <div
          className="fixed inset-0 z-[10060] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-2xl border border-white/12 bg-gradient-to-b from-zinc-900/98 to-[#12121a] p-5 shadow-2xl shadow-black/60 ring-1 ring-white/[0.06]">
            <p className="text-sm font-bold tracking-tight text-zinc-100">Formato de página</p>
            <p className="mt-1 text-[11px] text-zinc-500">Elige el tamaño del nuevo pliego.</p>
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
                onClick={() => setAddPageOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-lg bg-gradient-to-b from-violet-500 to-purple-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-violet-950/40"
                onClick={addPage}
              >
                Añadir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
