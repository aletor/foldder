import type { FreehandObject } from "../FreehandStudio";
import { buildObjTransform } from "../FreehandStudio";
import { revealTargetKey } from "./presenter-group-animations";

export type PresenterImageTarget = {
  id: string;
  /** Clave de selección / pasos de animación (`object:…` / `group:…`), igual que en el lienzo. */
  pickKey: string;
  x: number;
  y: number;
  width: number;
  height: number;
  transform: string | undefined;
  /** URL del bitmap (imagen, marco con foto o boolean cacheado). */
  imageUrl: string | null;
};

function imageUrlForObject(o: FreehandObject): string | null {
  if (o.type === "image") {
    const s = (o as { src?: string }).src?.trim();
    return s || null;
  }
  if (o.type === "rect") {
    const r = o as FreehandObject & { isImageFrame?: boolean; imageFrameContent?: { src?: string } };
    if (r.isImageFrame && r.imageFrameContent?.src) {
      const s = r.imageFrameContent.src.trim();
      return s || null;
    }
  }
  if (o.type === "booleanGroup") {
    const bg = o as FreehandObject & { cachedResult?: string };
    if (bg.cachedResult) return bg.cachedResult;
  }
  return null;
}

function pushImageLike(
  o: FreehandObject,
  x: number,
  y: number,
  width: number,
  height: number,
  acc: PresenterImageTarget[],
): void {
  acc.push({
    id: o.id,
    pickKey: revealTargetKey(o),
    x,
    y,
    width,
    height,
    transform: buildObjTransform(o),
    imageUrl: imageUrlForObject(o),
  });
}

function walk(objects: FreehandObject[] | undefined, acc: PresenterImageTarget[]): void {
  if (!objects?.length) return;
  for (const o of objects) {
    if (!o.visible || o.isClipMask) continue;
    if (o.type === "image") {
      pushImageLike(o, o.x, o.y, o.width, o.height, acc);
    } else if (o.type === "rect") {
      const r = o as FreehandObject & { isImageFrame?: boolean };
      if (r.isImageFrame) {
        pushImageLike(o, o.x, o.y, o.width, o.height, acc);
      }
    } else if (o.type === "booleanGroup") {
      const bg = o as FreehandObject & { cachedResult?: string };
      if (bg.cachedResult) {
        pushImageLike(o, o.x, o.y, o.width, o.height, acc);
      }
    } else if (o.type === "clippingContainer") {
      walk(o.content, acc);
    }
  }
}

/** Objetos con bitmap visible en el lienzo del presenter (para anclar video). */
export function collectPresenterImageTargets(objects: FreehandObject[]): PresenterImageTarget[] {
  const acc: PresenterImageTarget[] = [];
  walk(objects, acc);
  return acc;
}
