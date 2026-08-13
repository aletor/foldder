import { pointInPageRect, type PagePoint, type PageRect, pageRectFullyContains } from "./site-creator-coordinate-space";
import {
  isolationUnits,
  isContainerEntry,
  sortFrontToBack,
} from "./build-site-selection-index";
import type {
  SiteCreatorSelectionIndex,
  SiteCreatorSelectionIndexEntry,
} from "./site-creator-selection-types";

export function entriesUnderPoint(
  units: SiteCreatorSelectionIndexEntry[],
  point: PagePoint,
  options?: { directClickOnly?: boolean },
): SiteCreatorSelectionIndexEntry[] {
  const hits = units.filter((entry) => {
    if (!entry.selectableFromCanvas) return false;
    if (options?.directClickOnly && !entry.directClickable) return false;
    return pointInPageRect(point, entry.visualBounds);
  });
  return sortFrontToBack(hits);
}

/**
 * Elige la capa frontal “útil” bajo el cursor.
 *
 * Una imagen a pantalla completa (o con transparencia) suele quedar por encima en
 * el stack y, con hit-test solo por AABB, se come todos los clics. Si hay otra
 * capa seleccionable bajo el mismo punto, la imagen se atraviesa (como el alpha
 * hit de Freehand/Designer). Para seleccionar la imagen: clic donde no haya
 * otra capa, o el menú “Elegir capa”.
 */
export function resolveFrontmostHit(
  hitsFrontToBack: SiteCreatorSelectionIndexEntry[],
): SiteCreatorSelectionIndexEntry | null {
  if (hitsFrontToBack.length === 0) return null;
  for (let i = 0; i < hitsFrontToBack.length; i++) {
    const hit = hitsFrontToBack[i]!;
    const behind = hitsFrontToBack.slice(i + 1);
    if (behind.length === 0) return hit;
    if (hit.type === "image") continue;
    return hit;
  }
  return hitsFrontToBack[0] ?? null;
}

export function frontmostDirectHit(
  index: SiteCreatorSelectionIndex,
  isolationIds: string[],
  point: PagePoint,
): SiteCreatorSelectionIndexEntry | null {
  const units = isolationUnits(index, isolationIds);
  const hits = entriesUnderPoint(units, point, { directClickOnly: true });
  return resolveFrontmostHit(hits);
}

/** Capas bajo el punto, de frontal a posterior, para el menú Elegir capa. */
export function layerPickerHitsAtPoint(
  index: SiteCreatorSelectionIndex,
  isolationIds: string[],
  point: PagePoint,
): SiteCreatorSelectionIndexEntry[] {
  const units = isolationUnits(index, isolationIds);
  const unitHits = entriesUnderPoint(units, point, { directClickOnly: false });
  const seen = new Set(unitHits.map((entry) => entry.layerId));
  const extras: SiteCreatorSelectionIndexEntry[] = [];
  const top = resolveFrontmostHit(unitHits) ?? unitHits[0];
  if (top) {
    for (const ancestorId of [...top.ancestorIds].reverse()) {
      const ancestor = index.byId[ancestorId];
      if (!ancestor || seen.has(ancestorId)) continue;
      extras.push(ancestor);
      seen.add(ancestorId);
    }
  }
  // Imágenes atravesadas primero en el picker para poder elegirlas a propósito
  return [...unitHits, ...extras];
}

export function marqueeHits(
  index: SiteCreatorSelectionIndex,
  isolationIds: string[],
  rect: PageRect,
): SiteCreatorSelectionIndexEntry[] {
  const units = isolationUnits(index, isolationIds);
  return units.filter(
    (entry) => entry.selectableFromCanvas && pageRectFullyContains(rect, entry.visualBounds),
  );
}

export function collapseContainerDescendants(ids: string[], index: SiteCreatorSelectionIndex): string[] {
  const idSet = new Set(ids);
  return ids.filter((id) => {
    const entry = index.byId[id];
    if (!entry) return false;
    return !entry.ancestorIds.some((ancestorId) => idSet.has(ancestorId));
  });
}

export function isolationBreadcrumbLabels(
  index: SiteCreatorSelectionIndex,
  isolationIds: string[],
): { id: string | null; label: string }[] {
  const items: { id: string | null; label: string }[] = [{ id: null, label: "Página" }];
  for (const id of isolationIds) {
    const entry = index.byId[id];
    items.push({ id, label: entry?.name ?? id });
  }
  return items;
}

export function canEnterContainer(entry: SiteCreatorSelectionIndexEntry | null): boolean {
  return isContainerEntry(entry ?? undefined);
}
