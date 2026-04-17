import type { FreehandObject } from "../FreehandStudio";
import { parsePresenterStepKey, revealTargetKey } from "./presenter-group-animations";

/** Incluye máscara + miembros si el id es una máscara de clip. */
function expandClipUnit(objects: FreehandObject[], id: string): string[] {
  const o = objects.find((x) => x.id === id);
  if (o?.isClipMask) {
    const members = objects.filter((m) => m.clipMaskId === id).map((m) => m.id);
    return [id, ...members];
  }
  return [id];
}

/**
 * Resuelve claves de selección del Presenter (`object:` / `group:`) a ids de objetos
 * que deben compartir el mismo `groupId`.
 */
export function objectIdsForSoftGroup(keys: string[], objects: FreehandObject[]): Set<string> {
  const ids = new Set<string>();
  for (const key of keys) {
    const p = parsePresenterStepKey(key);
    if (!p) continue;
    if (p.kind === "object") {
      for (const id of expandClipUnit(objects, p.objectId)) ids.add(id);
    } else {
      for (const o of objects) {
        if (o.groupId === p.groupId) ids.add(o.id);
      }
    }
  }
  return ids;
}

export function newPresenterSoftGroupId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `pg_${crypto.randomUUID()}`;
  }
  return `pg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Asigna el mismo `groupId` a todos los ids indicados (resto intacto). */
export function applySoftGroupIdToObjects(
  objects: FreehandObject[],
  targetIds: Set<string>,
  groupId: string,
): FreehandObject[] {
  return objects.map((o) => (targetIds.has(o.id) ? { ...o, groupId } : o));
}

/** Quita un `groupId` concreto de los objetos (p. ej. al borrar el paso de grupo en Order). */
export function stripSoftGroupIdFromObjects(objects: FreehandObject[], groupId: string): FreehandObject[] {
  return objects.map((o) => {
    if (o.groupId !== groupId) return o;
    const next = { ...o };
    delete next.groupId;
    return next;
  });
}

/**
 * Claves de paso de animación que dejan de aplicar tras agrupar (antes del patch de objetos).
 */
export function presenterStepKeysToReplaceForIds(objects: FreehandObject[], ids: Set<string>): Set<string> {
  const keys = new Set<string>();
  for (const id of ids) {
    const o = objects.find((x) => x.id === id);
    if (o) keys.add(revealTargetKey(o));
  }
  return keys;
}

