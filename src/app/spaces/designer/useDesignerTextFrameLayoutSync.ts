"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, type MutableRefObject } from "react";
import type { DesignerStudioApi, FreehandObject } from "../FreehandStudio";
import type { DesignerPageState } from "./DesignerNode";
import { layoutPageStories } from "../indesign/text-layout";
import type { Story, Typography } from "../indesign/text-model";
import { serializeStoryContent, sliceStoryContent } from "../indesign/text-model";
import { buildRichSpansForFrame } from "./designer-studio-pure";

type Params = {
  studioApiRef: MutableRefObject<DesignerStudioApi | null>;
  pagesRef: MutableRefObject<DesignerPageState[]>;
  activeIdxRef: MutableRefObject<number>;
  pages: DesignerPageState[];
  activePageIndex: number;
};

type DesignerRichSpan = ReturnType<typeof buildRichSpansForFrame>[number];

function threadInfoEqual(
  a: FreehandObject["_designerThreadInfo"] | undefined,
  b: FreehandObject["_designerThreadInfo"] | undefined,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.index === b.index && a.total === b.total;
}

function spanStyleEqual(a: DesignerRichSpan["style"], b: DesignerRichSpan["style"]): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.fontWeight === b.fontWeight &&
    a.fontStyle === b.fontStyle &&
    a.textUnderline === b.textUnderline &&
    a.textStrikethrough === b.textStrikethrough &&
    a.fontSize === b.fontSize &&
    a.color === b.color &&
    a.fontFamily === b.fontFamily &&
    a.letterSpacing === b.letterSpacing &&
    a.linkHref === b.linkHref
  );
}

function richSpansEqual(a: DesignerRichSpan[] | undefined, b: DesignerRichSpan[] | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x.text !== y.text || !spanStyleEqual(x.style, y.style)) return false;
  }
  return true;
}

function solidFillColor(value: unknown): string | null {
  if (typeof value === "string") return value === "none" ? null : value;
  const fill = value as { type?: string; color?: string } | undefined;
  return fill?.type === "solid" && fill.color ? fill.color : null;
}

function patchValueEqual(obj: FreehandObject, key: string, value: unknown): boolean {
  if (key === "_designerThreadInfo") {
    return threadInfoEqual(
      obj._designerThreadInfo,
      value as FreehandObject["_designerThreadInfo"] | undefined,
    );
  }
  if (key === "_designerRichSpans") {
    return richSpansEqual(obj._designerRichSpans, value as DesignerRichSpan[] | undefined);
  }
  if (key === "fill") {
    return solidFillColor(obj.fill) === solidFillColor(value);
  }
  return Object.is((obj as unknown as Record<string, unknown>)[key], value);
}

function patchObjectIfChanged(
  api: DesignerStudioApi,
  obj: FreehandObject | undefined,
  id: string,
  patch: Partial<FreehandObject>,
): void {
  if (!obj) {
    api.patchObject(id, patch);
    return;
  }
  const filteredPatch: Partial<FreehandObject> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!patchValueEqual(obj, key, value)) {
      (filteredPatch as Record<string, unknown>)[key] = value;
    }
  }
  if (Object.keys(filteredPatch).length > 0) {
    api.patchObject(id, filteredPatch);
  }
}

/**
 * Reparto de texto entre marcos encadenados, overflow y `_designerRichSpans` en el lienzo.
 * Expone ref para forzar sync antes del PDF multipágina (el efecto va con ~60 ms de debounce).
 */
export function useDesignerTextFrameLayoutSync({
  studioApiRef,
  pagesRef,
  activeIdxRef,
  pages,
  activePageIndex,
}: Params): { syncTextFrameLayoutsRef: MutableRefObject<() => void> } {
  const layoutSyncTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const syncTextFrameLayoutsRef = useRef<() => void>(() => {});

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
    const objectById = new Map(currentObjs.map((obj) => [obj.id, obj]));
    const storyById = new Map(stories.map((story) => [story.id, story]));

    const textFramesForLayout = textFrames.map((tf) => {
      const o = objectById.get(tf.id);
      if (!o || !(o as { isTextFrame?: boolean }).isTextFrame) return tf;
      return {
        ...tf,
        x: o.x,
        y: o.y,
        width: o.width,
        height: o.height,
      };
    });

    const typographyForLayout = (s: Story): Typography => {
      const typo = s.typography;
      for (const fid of s.frames) {
        const o = objectById.get(fid);
        if (!o || !(o as { isTextFrame?: boolean }).isTextFrame) continue;
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

    const selectedFrameId = (() => {
      for (const o of currentObjs) {
        if (!o.isTextFrame) continue;
        const sid = (o as { storyId?: string }).storyId as string | undefined;
        if (!sid) continue;
        const s = storyById.get(sid);
        if (!s) continue;
        const typo = s.typography;
        const a = o as FreehandObject & {
          fontSize?: number;
          fontFamily?: string;
          lineHeight?: number;
          letterSpacing?: number;
        };
        if (
          a.fontSize !== typo.fontSize ||
          a.fontFamily !== typo.fontFamily ||
          a.lineHeight !== typo.lineHeight ||
          a.letterSpacing !== typo.letterSpacing
        ) {
          return o.id;
        }
      }
      return null;
    })();

    let liveTypoSource: Record<string, unknown> | null = null;
    let liveTypoStoryId: string | null = null;
    if (selectedFrameId) {
      const obj = objectById.get(selectedFrameId) as FreehandObject & {
        storyId?: string;
        fontFamily?: string;
        fontSize?: number;
        lineHeight?: number;
        letterSpacing?: number;
        textAlign?: string;
        fontKerning?: string;
        paragraphIndent?: number;
        fontVariantCaps?: string;
        fontFeatureSettings?: string;
        fill?: unknown;
      };
      if (obj) {
        liveTypoStoryId = obj.storyId ?? null;
        const fillStr =
          typeof obj.fill === "string" ? obj.fill : (obj.fill as { type?: string; color?: string })?.type === "solid"
            ? (obj.fill as { color?: string }).color
            : null;
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
      const story = storyById.get(fl.storyId);
      const total = story?.frames.length ?? 1;
      const index = story ? story.frames.indexOf(fl.frameId) : 0;
      const threadInfo = total > 1 ? { index: Math.max(0, index), total } : undefined;
      const frameObj = objectById.get(fl.frameId);

      const typoPatch: Record<string, unknown> = {};
      if (story && story.frames.length > 1 && fl.frameId !== selectedFrameId) {
        const src = liveTypoStoryId === story.id && liveTypoSource ? liveTypoSource : null;
        if (src) {
          const obj = frameObj as FreehandObject & {
            fontFamily?: string;
            fontSize?: number;
            lineHeight?: number;
            letterSpacing?: number;
            textAlign?: string;
            fontKerning?: string;
            paragraphIndent?: number;
            fontVariantCaps?: string;
            fontFeatureSettings?: string;
            fill?: unknown;
          };
          if (obj) {
            if (src.fontFamily != null && obj.fontFamily !== src.fontFamily) typoPatch.fontFamily = src.fontFamily;
            if (src.fontSize != null && obj.fontSize !== src.fontSize) typoPatch.fontSize = src.fontSize;
            if (src.lineHeight != null && obj.lineHeight !== src.lineHeight) typoPatch.lineHeight = src.lineHeight;
            if (src.letterSpacing != null && obj.letterSpacing !== src.letterSpacing) typoPatch.letterSpacing = src.letterSpacing;
            if (src.textAlign != null && obj.textAlign !== src.textAlign) typoPatch.textAlign = src.textAlign;
            if (src.fontKerning != null && obj.fontKerning !== src.fontKerning) typoPatch.fontKerning = src.fontKerning;
            if (src.paragraphIndent != null && obj.paragraphIndent !== src.paragraphIndent)
              typoPatch.paragraphIndent = src.paragraphIndent;
            if (src.fontVariantCaps != null && obj.fontVariantCaps !== src.fontVariantCaps)
              typoPatch.fontVariantCaps = src.fontVariantCaps;
            if (src.fontFeatureSettings != null && obj.fontFeatureSettings !== src.fontFeatureSettings)
              typoPatch.fontFeatureSettings = src.fontFeatureSettings;
            if (src.fill != null) {
              const objFill =
                typeof obj.fill === "string" ? obj.fill : (obj.fill as { type?: string; color?: string })?.type === "solid"
                  ? (obj.fill as { color?: string }).color
                  : null;
              if (objFill !== src.fill) typoPatch.fill = { type: "solid", color: src.fill };
            }
          }
        }
      }

      if (fl.frameId === editingId) {
        patchObjectIfChanged(api, frameObj, fl.frameId, {
          _designerOverflow: fl.hasOverflow,
          _designerThreadInfo: threadInfo,
        });
        continue;
      }
      if (story) {
        const frameContent = sliceStoryContent(story.content, fl.contentRange.start, fl.contentRange.end);
        const frameText = serializeStoryContent(frameContent);
        const richSpans = buildRichSpansForFrame(frameContent);
        patchObjectIfChanged(api, frameObj, fl.frameId, {
          text: frameText,
          _designerOverflow: fl.hasOverflow,
          _designerThreadInfo: threadInfo,
          _designerRichSpans: richSpans,
          ...typoPatch,
        });
      } else {
        patchObjectIfChanged(api, frameObj, fl.frameId, {
          _designerOverflow: fl.hasOverflow,
          _designerThreadInfo: threadInfo,
        });
      }
    }
  }, [studioApiRef, pagesRef, activeIdxRef]);

  useLayoutEffect(() => {
    syncTextFrameLayoutsRef.current = syncTextFrameLayouts;
  }, [syncTextFrameLayouts]);

  useEffect(() => {
    clearTimeout(layoutSyncTimerRef.current);
    layoutSyncTimerRef.current = setTimeout(syncTextFrameLayouts, 60);
    return () => clearTimeout(layoutSyncTimerRef.current);
  }, [pages, activePageIndex, syncTextFrameLayouts]);

  return { syncTextFrameLayoutsRef };
}
