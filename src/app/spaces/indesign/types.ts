import type { IndesignPageFormatId } from "./page-formats";
import type { Story, TextFrame } from "./text-model";

export type { Story, TextFrame, Typography, StoryNode } from "./text-model";

/** Estado serializable de una página (Fabric: fondo + marcos imagen; texto en stories/textFrames). */
export type IndesignPageState = {
  id: string;
  format: IndesignPageFormatId;
  /** Si se definen, sustituyen al ancho/alto del preset `format`. */
  customWidth?: number;
  customHeight?: number;
  fabricJSON: Record<string, unknown> | null;
  stories?: Story[];
  textFrames?: TextFrame[];
};

export const INDESIGN_CUSTOM_PROPS = [
  "indesignType",
  "indesignBoxW",
  "indesignBoxH",
  "imageFit",
  "frameId",
  "storyId",
  "indesignUid",
  "frameUid",
  "hasImage",
  "lineIndex",
] as const;
