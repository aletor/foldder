import type {
  ClippingContainerObject,
  FreehandObject,
  PathObject,
} from "../FreehandStudio";
import type { PageRect } from "./site-creator-coordinate-space";
import type { NormalizedFocalPoint } from "./site-creator-background-cover";
import { clampNumber } from "./site-creator-responsive-math";
import {
  scalePathPointsUniform,
  transformPathObjectRelative,
} from "./site-creator-responsive-matrix";

function scaleStroke(obj: FreehandObject, scale: number): void {
  if (typeof obj.strokeWidth === "number") obj.strokeWidth *= scale;
}

function scaleNestedGeometry(obj: FreehandObject, scale: number): void {
  scaleStroke(obj, scale);
  if (obj.type === "path") {
    scalePathPointsUniform((obj as PathObject).points, scale);
    return;
  }
  if (obj.type === "text" || obj.type === "textOnPath") {
    const text = obj as FreehandObject & { fontSize?: number };
    if (typeof text.fontSize === "number") text.fontSize *= scale;
  }
  if (obj.type === "groupContainer" || obj.type === "booleanGroup") {
    for (const child of obj.children) transformLocalObjectUniform(child, scale, 0, 0);
    return;
  }
  if (obj.type === "clippingContainer") {
    transformLocalObjectUniform(obj.mask, scale, 0, 0);
    for (const child of obj.content) transformLocalObjectUniform(child, scale, 0, 0);
  }
}

function transformLocalObjectUniform(
  obj: FreehandObject,
  scale: number,
  offsetX: number,
  offsetY: number,
): void {
  obj.x = obj.x * scale + offsetX;
  obj.y = obj.y * scale + offsetY;
  obj.width = Math.max(1, obj.width * scale);
  obj.height = Math.max(1, obj.height * scale);
  if (obj.type === "path") {
    scaleStroke(obj, scale);
    scalePathPointsUniform((obj as PathObject).points, scale, offsetX, offsetY);
    return;
  }
  scaleNestedGeometry(obj, scale);
}

/**
 * Amplía el marco de una máscara que funciona como fondo de sección.
 * La forma de recorte se adapta al nuevo marco; su contenido usa cover
 * uniforme alrededor del centro actual, sin estiramiento no proporcional.
 */
export function resizeSectionCoverClip(
  obj: ClippingContainerObject,
  target: PageRect,
): void {
  const oldWidth = Math.max(1, obj.width);
  const oldHeight = Math.max(1, obj.height);
  const scaleX = target.width / oldWidth;
  const scaleY = target.height / oldHeight;
  const coverScale = Math.max(scaleX, scaleY);
  const oldCenterX = oldWidth / 2;
  const oldCenterY = oldHeight / 2;
  const nextCenterX = target.width / 2;
  const nextCenterY = target.height / 2;
  const offsetX = nextCenterX - oldCenterX * coverScale;
  const offsetY = nextCenterY - oldCenterY * coverScale;

  for (const child of obj.content) {
    transformLocalObjectUniform(child, coverScale, offsetX, offsetY);
  }

  const mask = obj.mask;
  if (mask.type === "path") {
    transformPathObjectRelative(
      mask as PathObject,
      { x: 0, y: 0, width: oldWidth, height: oldHeight },
      { x: 0, y: 0, scaleX, scaleY },
    );
    scaleStroke(mask, Math.min(scaleX, scaleY));
  }
  mask.x *= scaleX;
  mask.y *= scaleY;
  mask.width = Math.max(1, mask.width * scaleX);
  mask.height = Math.max(1, mask.height * scaleY);

  obj.x = target.x;
  obj.y = target.y;
  obj.width = Math.max(1, target.width);
  obj.height = Math.max(1, target.height);
}

export const CLIP_IMAGE_ZOOM_MAX = 4;
/** Suelo absoluto al persistir; el cover de la máscara puede subir este mínimo. */
export const CLIP_IMAGE_ZOOM_FLOOR = 0.05;

export function clipImageCoverScale(
  image: { width: number; height: number },
  mask: { width: number; height: number },
): number {
  return Math.max(
    Math.max(1, mask.width) / Math.max(1, image.width),
    Math.max(1, mask.height) / Math.max(1, image.height),
  );
}

/**
 * Zoom mínimo respecto al tamaño actual para seguir cubriendo la máscara.
 * Si la foto ya es más grande que el recorte, puede ser < 1.
 */
export function clipImageMinZoom(
  image: { width: number; height: number },
  mask: { width: number; height: number },
): number {
  const coverScale = clipImageCoverScale(image, mask);
  const fit = Math.max(1, coverScale);
  return clampNumber(CLIP_IMAGE_ZOOM_FLOOR, coverScale / fit, CLIP_IMAGE_ZOOM_MAX);
}

/**
 * Mínimo de zoom guardado a partir del tamaño ya pintado y el zoom actual.
 * Tras un reframe, el display cambia; esto recupera el suelo estable.
 */
export function clipImageMinZoomFromRendered(args: {
  image: { width: number; height: number };
  mask: { width: number; height: number };
  currentZoom: number;
}): number {
  const zoom =
    Number.isFinite(args.currentZoom) && args.currentZoom > 0 ? args.currentZoom : 1;
  return clampNumber(
    CLIP_IMAGE_ZOOM_FLOOR,
    zoom * clipImageCoverScale(args.image, args.mask),
    CLIP_IMAGE_ZOOM_MAX,
  );
}

export function clampClipImageZoom(zoom: number, minZoom: number): number {
  const min = clampNumber(CLIP_IMAGE_ZOOM_FLOOR, minZoom, CLIP_IMAGE_ZOOM_MAX);
  const requested = Number.isFinite(zoom) ? zoom : 1;
  return clampNumber(min, requested, CLIP_IMAGE_ZOOM_MAX);
}

/**
 * Reencuadra una imagen directa del contenido de una máscara.
 * Mantiene cover, conserva la proporción y limita la traslación para que nunca
 * aparezcan huecos dentro del marco de recorte.
 * `zoom: 1` es el encuadre de origen; se puede bajar hasta el cover real.
 */
export function reframeClippingImage(
  obj: ClippingContainerObject,
  imageId: string,
  tune: { focal?: NormalizedFocalPoint | null; zoom?: number | null },
): boolean {
  const image = obj.content.find((child) => child.id === imageId && child.type === "image");
  if (!image) return false;

  const mask = obj.mask;
  const target: PageRect = {
    x: mask.x,
    y: mask.y,
    width: Math.max(1, mask.width),
    height: Math.max(1, mask.height),
  };
  const currentWidth = Math.max(1, image.width);
  const currentHeight = Math.max(1, image.height);
  const coverScale = clipImageCoverScale(
    { width: currentWidth, height: currentHeight },
    target,
  );
  const fit = Math.max(1, coverScale);
  const zoom = clampClipImageZoom(tune.zoom ?? 1, coverScale / fit);
  const width = currentWidth * fit * zoom;
  const height = currentHeight * fit * zoom;
  const focal = {
    x: clampNumber(0, Number.isFinite(tune.focal?.x) ? (tune.focal?.x ?? 0.5) : 0.5, 1),
    y: clampNumber(0, Number.isFinite(tune.focal?.y) ? (tune.focal?.y ?? 0.5) : 0.5, 1),
  };
  const centerX = target.x + target.width / 2;
  const centerY = target.y + target.height / 2;

  image.x = clampNumber(target.x + target.width - width, centerX - focal.x * width, target.x);
  image.y = clampNumber(target.y + target.height - height, centerY - focal.y * height, target.y);
  image.width = width;
  image.height = height;
  return true;
}
