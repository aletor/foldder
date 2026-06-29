import type { FreehandObject } from "../FreehandStudio";

export type FreehandHistoryEntryContent = {
  objects: FreehandObject[];
  sel: string[];
};

/** Clave estable para comparar dos instantáneas de lienzo (objetos + selección). */
export function freehandHistoryContentKey(objects: FreehandObject[], sel: Iterable<string>): string {
  return JSON.stringify({ objects, sel: Array.from(sel).sort() });
}

export function freehandHistoryEntriesEqual(
  a: FreehandHistoryEntryContent,
  b: FreehandHistoryEntryContent,
): boolean {
  return freehandHistoryContentKey(a.objects, a.sel) === freehandHistoryContentKey(b.objects, b.sel);
}
