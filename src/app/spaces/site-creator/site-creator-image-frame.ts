import type { FreehandObject } from "../FreehandStudio";
import type { ResponsiveMediaTuneV1 } from "./site-creator-types";
import {
  imageFrameHasPhoto,
  isDesignerImageFrame,
} from "./site-creator-display-labels";

type ImageFrameContent = NonNullable<FreehandObject["imageFrameContent"]>;

export type SiteCreatorImageFrameGeometry = {
  rotation: number;
  mask: { x: number; y: number; width: number; height: number };
  image: { x: number; y: number; width: number; height: number };
};

function clamp(min: number, value: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function imageFrameContentForSiteCreator(
  object: FreehandObject | null | undefined,
): ImageFrameContent | null {
  if (!object || !isDesignerImageFrame(object) || !imageFrameHasPhoto(object)) {
    return null;
  }
  return object.imageFrameContent ?? null;
}

export function imageFrameGeometryForSiteCreator(
  object: FreehandObject | null | undefined,
): SiteCreatorImageFrameGeometry | null {
  const content = imageFrameContentForSiteCreator(object);
  if (!object || !content) return null;
  return {
    rotation: object.rotation ?? 0,
    mask: {
      x: 0,
      y: 0,
      width: Math.max(1, object.width),
      height: Math.max(1, object.height),
    },
    image: {
      x: content.offsetX,
      y: content.offsetY,
      width: Math.max(1, content.originalWidth * content.scaleX),
      height: Math.max(1, content.originalHeight * content.scaleY),
    },
  };
}

export function imageFrameTuneForSiteCreator(
  object: FreehandObject | null | undefined,
): { focal: { x: number; y: number }; zoom: number } | null {
  const content = imageFrameContentForSiteCreator(object);
  if (!object || !content) return null;
  const frameWidth = Math.max(1, object.width);
  const frameHeight = Math.max(1, object.height);
  const originalWidth = Math.max(1, content.originalWidth);
  const originalHeight = Math.max(1, content.originalHeight);
  const baseScale = Math.max(
    frameWidth / originalWidth,
    frameHeight / originalHeight,
  );
  const actualScale = Math.max(
    Math.abs(content.scaleX),
    Math.abs(content.scaleY),
  );
  const zoom = clamp(1, actualScale / Math.max(baseScale, 1e-9), 4);
  const imageWidth = originalWidth * baseScale * zoom;
  const imageHeight = originalHeight * baseScale * zoom;
  return {
    focal: {
      x: clamp(0, (frameWidth / 2 - content.offsetX) / imageWidth, 1),
      y: clamp(0, (frameHeight / 2 - content.offsetY) / imageHeight, 1),
    },
    zoom,
  };
}

/**
 * Traslada el encuadre inicial de Designer a un marco responsive ya resuelto.
 * Solo muta la copia de display de Site Creator.
 */
export function adaptDesignerImageFrameForSiteCreator(
  object: FreehandObject,
  source: FreehandObject,
): void {
  const content = imageFrameContentForSiteCreator(source);
  if (!content || !imageFrameContentForSiteCreator(object)) return;
  const sourceWidth = Math.max(1, source.width);
  const sourceHeight = Math.max(1, source.height);
  const targetWidth = Math.max(1, object.width);
  const targetHeight = Math.max(1, object.height);
  const ratioX = targetWidth / sourceWidth;
  const ratioY = targetHeight / sourceHeight;

  if (
    content.fittingMode === "fill-stretch" ||
    content.fittingMode === "fit-stretch"
  ) {
    object.imageFrameContent = {
      ...content,
      scaleX: content.scaleX * ratioX,
      scaleY: content.scaleY * ratioY,
      offsetX: content.offsetX * ratioX,
      offsetY: content.offsetY * ratioY,
    };
    return;
  }

  const sourceImageWidth = Math.max(
    1,
    content.originalWidth * content.scaleX,
  );
  const sourceImageHeight = Math.max(
    1,
    content.originalHeight * content.scaleY,
  );
  const focalX = clamp(
    0,
    (sourceWidth / 2 - content.offsetX) / sourceImageWidth,
    1,
  );
  const focalY = clamp(
    0,
    (sourceHeight / 2 - content.offsetY) / sourceImageHeight,
    1,
  );
  const fill = content.fittingMode === "fill-proportional";
  const uniform = fill
    ? Math.max(ratioX, ratioY)
    : Math.min(ratioX, ratioY);
  const imageWidth = sourceImageWidth * uniform;
  const imageHeight = sourceImageHeight * uniform;
  const rawX = targetWidth / 2 - focalX * imageWidth;
  const rawY = targetHeight / 2 - focalY * imageHeight;

  object.imageFrameContent = {
    ...content,
    scaleX: content.scaleX * uniform,
    scaleY: content.scaleY * uniform,
    offsetX: fill
      ? clamp(Math.min(0, targetWidth - imageWidth), rawX, 0)
      : rawX,
    offsetY: fill
      ? clamp(Math.min(0, targetHeight - imageHeight), rawY, 0)
      : rawY,
  };
}

/**
 * Reencuadra únicamente la copia de presentación de Site Creator.
 * El marco rectangular sigue siendo la máscara y el Designer no se modifica.
 */
export function reframeDesignerImageFrameForSiteCreator(
  object: FreehandObject,
  tune: Pick<ResponsiveMediaTuneV1, "focal" | "zoom">,
): void {
  const content = imageFrameContentForSiteCreator(object);
  if (!content) return;
  const frameWidth = Math.max(1, object.width);
  const frameHeight = Math.max(1, object.height);
  const originalWidth = Math.max(1, content.originalWidth);
  const originalHeight = Math.max(1, content.originalHeight);
  const focalX = clamp(0, tune.focal?.x ?? 0.5, 1);
  const focalY = clamp(0, tune.focal?.y ?? 0.5, 1);
  const zoom = clamp(1, tune.zoom ?? 1, 4);
  const scale =
    Math.max(frameWidth / originalWidth, frameHeight / originalHeight) * zoom;
  const imageWidth = originalWidth * scale;
  const imageHeight = originalHeight * scale;
  const minX = Math.min(0, frameWidth - imageWidth);
  const minY = Math.min(0, frameHeight - imageHeight);

  object.imageFrameContent = {
    ...content,
    scaleX: scale,
    scaleY: scale,
    offsetX: clamp(minX, frameWidth / 2 - focalX * imageWidth, 0),
    offsetY: clamp(minY, frameHeight / 2 - focalY * imageHeight, 0),
    fittingMode: "fill-proportional",
  };
}
