import { pointInPageRect, pageRectsIntersect, type PagePoint, type PageRect } from "./site-creator-coordinate-space";
import {
  isolationUnits,
  isContainerEntry,
  sortFrontToBack,
} from "./build-site-selection-index";
import { isDesignerContainerMirrorDismissed } from "./site-creator-designer-group-dismiss";
import type {
  SiteCreatorSelectionIndex,
  SiteCreatorSelectionIndexEntry,
} from "./site-creator-selection-types";
import type { SiteBlueprintV1 } from "./site-creator-types";
import { isLayerCanvasLocked } from "./site-creator-canvas-locks";

function isClipMaskChild(entry: SiteCreatorSelectionIndexEntry): boolean {
  return (
    entry.containerKind == null &&
    (entry.parentContainerType === "clippingContainer" || entry.parentContainerType === "clippingContent")
  );
}

/** Expone hijos de carpetas Designer cuyo espejo fue desagrupado en Site Creator. */
function collectDismissedFolderPromotedUnits(
  containerId: string,
  index: SiteCreatorSelectionIndex,
  blueprint: SiteBlueprintV1,
  into: SiteCreatorSelectionIndexEntry[],
  seen: Set<string>,
): void {
  for (const entry of index.entries) {
    if (entry.parentLayerId !== containerId) continue;
    if (!entry.selectableFromCanvas) continue;
    if (isClipMaskChild(entry)) continue;

    if (entry.type === "groupContainer") {
      if (isDesignerContainerMirrorDismissed(blueprint, entry.layerId)) {
        collectDismissedFolderPromotedUnits(entry.layerId, index, blueprint, into, seen);
      } else if (!seen.has(entry.layerId)) {
        seen.add(entry.layerId);
        into.push(entry);
      }
      continue;
    }

    if (seen.has(entry.layerId)) continue;
    seen.add(entry.layerId);
    into.push(entry);
  }
}

function withoutCanvasLocks(
  units: SiteCreatorSelectionIndexEntry[],
  index: SiteCreatorSelectionIndex,
  blueprint: SiteBlueprintV1,
): SiteCreatorSelectionIndexEntry[] {
  return units.filter((entry) => !isLayerCanvasLocked(blueprint, entry.layerId, index));
}

/**
 * Unidades hittables en el lienzo. Cuando una carpeta Designer fue desagrupada
 * en Site Creator, sus hijos pasan al mismo nivel de hit-test (sin tocar Designer).
 */
export function canvasHitTestUnits(
  index: SiteCreatorSelectionIndex,
  isolationIds: string[],
  blueprint?: SiteBlueprintV1 | null,
): SiteCreatorSelectionIndexEntry[] {
  const base = isolationUnits(index, isolationIds);
  if (!blueprint) return base;

  const unlocked = withoutCanvasLocks(base, index, blueprint);
  const dismissedAtScope = unlocked.filter(
    (entry) =>
      entry.type === "groupContainer" &&
      isDesignerContainerMirrorDismissed(blueprint, entry.layerId),
  );
  if (dismissedAtScope.length === 0) return unlocked;

  const dismissedAtScopeIds = new Set(dismissedAtScope.map((entry) => entry.layerId));
  const filtered = unlocked.filter((entry) => !dismissedAtScopeIds.has(entry.layerId));
  const promoted: SiteCreatorSelectionIndexEntry[] = [];
  const seen = new Set(filtered.map((entry) => entry.layerId));

  for (const container of dismissedAtScope) {
    collectDismissedFolderPromotedUnits(container.layerId, index, blueprint, promoted, seen);
  }

  return withoutCanvasLocks([...filtered, ...promoted], index, blueprint);
}

/** Capas elegibles para marquee: hojas visibles; en raíz atraviesa carpetas Designer. */
export function marqueeHitTestUnits(
  index: SiteCreatorSelectionIndex,
  isolationIds: string[],
  blueprint?: SiteBlueprintV1 | null,
): SiteCreatorSelectionIndexEntry[] {
  const units = isolationIds.length > 0
    ? canvasHitTestUnits(index, isolationIds, blueprint)
    : index.entries.filter((entry) => {
        if (!entry.selectableFromCanvas) return false;
        if (entry.type === "groupContainer") return false;
        return true;
      });
  return blueprint ? withoutCanvasLocks(units, index, blueprint) : units;
}

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
export type FrontmostHitOptions = {
  /** false al inspeccionar un contenedor: el clic debe poder elegir la imagen frontal. */
  passthroughImages?: boolean;
};

export function resolveFrontmostHit(
  hitsFrontToBack: SiteCreatorSelectionIndexEntry[],
  options?: FrontmostHitOptions,
): SiteCreatorSelectionIndexEntry | null {
  if (hitsFrontToBack.length === 0) return null;
  const passthroughImages = options?.passthroughImages !== false;
  if (!passthroughImages) return hitsFrontToBack[0] ?? null;
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
  blueprint?: SiteBlueprintV1 | null,
  options?: FrontmostHitOptions,
): SiteCreatorSelectionIndexEntry | null {
  const units = canvasHitTestUnits(index, isolationIds, blueprint);
  const hits = entriesUnderPoint(units, point, { directClickOnly: true });
  return resolveFrontmostHit(hits, options);
}

/** Capas bajo el punto, de frontal a posterior, para el menú Elegir capa. */
export function layerPickerHitsAtPoint(
  index: SiteCreatorSelectionIndex,
  isolationIds: string[],
  point: PagePoint,
  blueprint?: SiteBlueprintV1 | null,
): SiteCreatorSelectionIndexEntry[] {
  const units = canvasHitTestUnits(index, isolationIds, blueprint);
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
  const all = [...unitHits, ...extras];
  return blueprint ? withoutCanvasLocks(all, index, blueprint) : all;
}

export function marqueeHits(
  index: SiteCreatorSelectionIndex,
  isolationIds: string[],
  rect: PageRect,
  blueprint?: SiteBlueprintV1 | null,
): SiteCreatorSelectionIndexEntry[] {
  const units = marqueeHitTestUnits(index, isolationIds, blueprint);
  return units.filter(
    (entry) => entry.selectableFromCanvas && pageRectsIntersect(rect, entry.visualBounds),
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

export function canEnterContainer(
  entry: SiteCreatorSelectionIndexEntry | null,
  blueprint?: SiteBlueprintV1 | null,
): boolean {
  if (!isContainerEntry(entry ?? undefined)) return false;
  if (entry?.type === "clippingContainer") return false;
  if (
    blueprint &&
    entry?.type === "groupContainer" &&
    isDesignerContainerMirrorDismissed(blueprint, entry.layerId)
  ) {
    return false;
  }
  return true;
}
