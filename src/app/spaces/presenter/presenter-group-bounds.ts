import type { FreehandObject } from "../FreehandStudio";
import { getVisualAABB } from "../FreehandStudio";

function visualBounds(
  o: FreehandObject,
  allObjects: FreehandObject[],
): { x: number; y: number; width: number; height: number } {
  const b = getVisualAABB(o, allObjects);
  return { x: b.x, y: b.y, width: b.w, height: b.h };
}

function unionBounds(
  items: FreehandObject[],
  allObjects: FreehandObject[],
): { x: number; y: number; width: number; height: number } | null {
  if (!items.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const o of items) {
    const b = visualBounds(o, allObjects);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return { x: minX, y: minY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
}

/** Rectángulo envolvente (eje alineado) de todos los objetos con ese `groupId` en la página. */
export function boundsForGroupId(
  objects: FreehandObject[],
  groupId: string,
): { x: number; y: number; width: number; height: number } | null {
  const parts = objects.filter((o) => o.groupId === groupId);
  return unionBounds(parts, objects);
}

/** Bounds de un objeto por id (incluye máscara de clip o miembro suelto). */
/** Cuántos objetos comparten ese `groupId` (para mostrar en el panel Animations). */
export function countObjectsInGroup(objects: FreehandObject[], groupId: string): number {
  return objects.filter((o) => o.groupId === groupId).length;
}

export function boundsForObjectId(
  objects: FreehandObject[],
  objectId: string,
): { x: number; y: number; width: number; height: number } | null {
  const o = objects.find((x) => x.id === objectId);
  if (!o) return null;
  if (o.isClipMask) {
    const members = objects.filter((m) => m.clipMaskId === objectId);
    return unionBounds([o, ...members], objects);
  }
  return unionBounds([o], objects);
}
