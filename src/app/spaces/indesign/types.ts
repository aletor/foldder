import type { IndesignPageFormatId } from "./page-formats";
import type { Story, TextFrame } from "./text-model";
import type { ImageFrameRecord } from "./image-frame-model";

export type { Story, TextFrame, Typography, StoryNode } from "./text-model";
export type { ImageFrameRecord, FrameImageContent, ImageFittingMode, ContentAlignment } from "./image-frame-model";

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
  /** Marco vs contenido: datos de cajas de imagen enlazados por `id` = `indesignUid` del marco en Fabric. */
  imageFrames?: ImageFrameRecord[];
};

export const INDESIGN_CUSTOM_PROPS = [
  "indesignType",
  "shapeKind",
  "indesignBoxW",
  "indesignBoxH",
  "imageFit",
  "frameId",
  "storyId",
  "indesignUid",
  "frameUid",
  "hasImage",
  "lineIndex",
  "indesignLocked",
  "indesignImageContentId",
] as const;
