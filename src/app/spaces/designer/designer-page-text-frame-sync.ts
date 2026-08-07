import type { FreehandObject } from "@/app/spaces/FreehandStudio";
import { collectVisibleTextObjectsDeep } from "@/app/spaces/FreehandStudio";
import type { DesignerPageState } from "./DesignerNode";
import { buildRichSpansForFrame } from "./designer-studio-pure";
import { mapDesignerObjectTree } from "./designer-object-tree";
import { forEachTree } from "@/app/spaces/freehand/group-container";
import { layoutPageStories } from "@/app/spaces/indesign/text-layout";
import {
  serializeStoryContent,
  sliceStoryContent,
  type Story,
  type TextFrame,
  type Typography,
} from "@/app/spaces/indesign/text-model";

function objectByIdFromTree(objects: FreehandObject[]): Map<string, FreehandObject> {
  const map = new Map<string, FreehandObject>();
  forEachTree(objects, (o) => map.set(o.id, o));
  return map;
}

function typographyForLayout(story: Story, objectById: Map<string, FreehandObject>): Typography {
  const typo = story.typography;
  for (const fid of story.frames) {
    const o = objectById.get(fid);
    if (!o?.isTextFrame || o.type !== "text") continue;
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
      ox.letterSpacing !== typo.letterSpacing ||
      (ox.fontWeight != null && String(ox.fontWeight) !== String(typo.fontWeight)) ||
      (ox.textAlign != null && ox.textAlign !== typo.align)
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
        fontKerning:
          (ox.fontKerning === "none" || ox.fontKerning === "auto" ? ox.fontKerning : null) ??
          typo.fontKerning,
        fontVariantCaps:
          ox.fontVariantCaps === "normal" || ox.fontVariantCaps === "small-caps"
            ? ox.fontVariantCaps
            : typo.fontVariantCaps,
        fontFeatureSettings: ox.fontFeatureSettings ?? typo.fontFeatureSettings,
      };
    }
  }
  return typo;
}

function typographyToObjectPatch(typo: Typography): Partial<FreehandObject> {
  return {
    fontFamily: typo.fontFamily,
    fontSize: typo.fontSize,
    lineHeight: typo.lineHeight,
    letterSpacing: typo.letterSpacing,
    textAlign: typo.align,
    fontWeight: Number(typo.fontWeight) || typo.fontWeight,
    fontStyle: typo.fontStyle,
    paragraphIndent: typo.paragraphIndent,
    fontKerning: typo.fontKerning,
    fontVariantCaps: typo.fontVariantCaps,
    fontFeatureSettings: typo.fontFeatureSettings,
    fill: { type: "solid", color: typo.color },
  } as Partial<FreehandObject>;
}

/**
 * Reparte stories en marcos de texto y rehace `_designerRichSpans` + tipografía en el árbol.
 * Necesario tras congelar valores de Populate (antes se borraban los rich spans).
 */
export function syncDesignerPageTextFrameLayouts(page: DesignerPageState): DesignerPageState {
  const stories = page.stories ?? [];
  const textFrames = page.textFrames ?? [];
  const objects = page.objects ?? [];
  if (stories.length === 0 || textFrames.length === 0) return page;

  const objectById = objectByIdFromTree(objects);
  const storyById = new Map(stories.map((story) => [story.id, story]));

  const textFramesForLayout: TextFrame[] = textFrames.map((tf) => {
    const o = objectById.get(tf.id);
    if (!o?.isTextFrame) return tf;
    return { ...tf, x: o.x, y: o.y, width: o.width, height: o.height };
  });

  const storiesForLayout = stories.map((s) => ({
    ...s,
    typography: typographyForLayout(s, objectById),
  }));
  const layouts = layoutPageStories(storiesForLayout, textFramesForLayout);
  const layoutByFrameId = new Map(layouts.map((fl) => [fl.frameId, fl]));

  const nextObjects = mapDesignerObjectTree(objects, (obj) => {
    const fl = layoutByFrameId.get(obj.id);
    if (!fl || obj.type !== "text" || !obj.isTextFrame) return obj;
    const story = storyById.get(fl.storyId);
    if (!story) {
      return {
        ...obj,
        _designerOverflow: fl.hasOverflow,
      } as FreehandObject;
    }

    const typo = typographyForLayout(story, objectById);
    const frameContent = sliceStoryContent(story.content, fl.contentRange.start, fl.contentRange.end);
    const frameText = serializeStoryContent(frameContent);
    const richSpans = buildRichSpansForFrame(frameContent);
    const total = story.frames.length;
    const index = story.frames.indexOf(fl.frameId);
    const threadInfo = total > 1 ? { index: Math.max(0, index), total } : undefined;

    return {
      ...obj,
      ...typographyToObjectPatch(typo),
      text: frameText,
      _designerRichSpans: richSpans,
      _designerOverflow: fl.hasOverflow,
      _designerThreadInfo: threadInfo,
    } as FreehandObject;
  });

  if (nextObjects === objects) return page;
  return { ...page, objects: nextObjects };
}

function primaryFontFamily(fontFamily: string | undefined): string {
  return (fontFamily ?? "").split(",")[0]?.replace(/['"]/g, "").trim() ?? "";
}

/** Familias tipográficas usadas en una página (objetos + stories). */
export function collectDesignerPageFontFamilies(page: DesignerPageState): string[] {
  const families = new Set<string>();
  for (const text of collectVisibleTextObjectsDeep(page.objects ?? [])) {
    const fam = primaryFontFamily(text.fontFamily);
    if (fam) families.add(fam);
    for (const span of text._designerRichSpans ?? []) {
      const sf = primaryFontFamily(span.style?.fontFamily);
      if (sf) families.add(sf);
    }
  }
  for (const story of page.stories ?? []) {
    const fam = primaryFontFamily(story.typography?.fontFamily);
    if (fam) families.add(fam);
  }
  return Array.from(families);
}
