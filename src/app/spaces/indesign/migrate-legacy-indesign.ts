import type { IndesignPageState } from "./types";
import type { Story, TextFrame, Typography } from "./text-model";
import { plainTextToStoryNodes, uid } from "./text-model";
import { DEFAULT_TYPOGRAPHY } from "./text-model";

type LegacyStory = {
  id: string;
  fullText?: string;
  frames: LegacyFrame[];
  typography?: Record<string, unknown>;
};

type LegacyFrame = {
  id: string;
  storyId?: string;
  box?: { x: number; y: number; width: number; height: number };
  prevFrameId?: string;
  nextFrameId?: string;
  renderedText?: string;
  hasOverflowOut?: boolean;
};

function mapTypo(t?: Record<string, unknown>): Typography {
  if (!t) return { ...DEFAULT_TYPOGRAPHY };
  const base = { ...DEFAULT_TYPOGRAPHY };
  return {
    ...base,
    fontFamily: (t.fontFamily as string) || base.fontFamily,
    fontSize: Number(t.fontSize) || base.fontSize,
    lineHeight: Number(t.lineHeight) || base.lineHeight,
    letterSpacing: Number(t.charSpacing ?? t.letterSpacing) || 0,
    align: (t.textAlign as Typography["align"]) || base.align,
    color: (t.fill as string) || (t.color as string) || base.color,
    fontWeight: (t.fontWeight as string) || base.fontWeight,
    fontStyle: (t.fontStyle as string) || base.fontStyle,
    paragraphIndent:
      t.paragraphIndent != null && String(t.paragraphIndent) !== ""
        ? Number(t.paragraphIndent)
        : base.paragraphIndent,
    fontKerning: (t.fontKerning as Typography["fontKerning"]) || base.fontKerning,
    fontVariantCaps: (t.fontVariantCaps as Typography["fontVariantCaps"]) || base.fontVariantCaps,
    textUnderline: t.textUnderline !== undefined ? Boolean(t.textUnderline) : base.textUnderline,
    textStrikethrough:
      t.textStrikethrough !== undefined ? Boolean(t.textStrikethrough) : base.textStrikethrough,
    fontFeatureSettings:
      typeof t.fontFeatureSettings === "string" ? t.fontFeatureSettings : base.fontFeatureSettings,
  };
}

/** Convierte páginas guardadas con el modelo antiguo (fullText + frames anidados). */
export function migrateIndesignPageState(page: IndesignPageState): IndesignPageState {
  const rawStories = page.stories;
  if (!rawStories?.length) {
    return {
      ...page,
      stories: [],
      textFrames: page.textFrames ?? [],
      imageFrames: page.imageFrames ?? [],
    };
  }

  const first = rawStories[0] as unknown as LegacyStory & Story;
  if (!("fullText" in first) && page.textFrames?.length) {
    return {
      ...page,
      textFrames: page.textFrames ?? [],
      stories: (page.stories ?? []).map((s) => ({
        ...s,
        typography: { ...DEFAULT_TYPOGRAPHY, ...s.typography },
      })),
    };
  }

  const newStories: Story[] = [];
  const allFrames: TextFrame[] = [];

  for (const os of rawStories as unknown as LegacyStory[]) {
    const content = plainTextToStoryNodes(typeof os.fullText === "string" ? os.fullText : "");
    const ids: string[] = [];
    for (const f of os.frames || []) {
      const lf = f as LegacyFrame;
      const box = lf.box ?? { x: 0, y: 0, width: 100, height: 100 };
      ids.push(lf.id);
      allFrames.push({
        id: lf.id,
        storyId: os.id,
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        padding: 4,
      });
    }
    newStories.push({
      id: os.id,
      content,
      frames: ids,
      typography: mapTypo(os.typography as Record<string, unknown>),
    });
  }

  return {
    ...page,
    stories: newStories,
    textFrames: allFrames.length ? allFrames : page.textFrames ?? [],
    imageFrames: page.imageFrames ?? [],
  };
}
