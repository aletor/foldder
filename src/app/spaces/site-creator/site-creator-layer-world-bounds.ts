import type { PageRect } from "./site-creator-coordinate-space";
import { unionPageRects } from "./site-creator-coordinate-space";
import type { SiteCreatorSelectionIndex } from "./site-creator-selection-types";

/**
 * Bounds de página para layout preserve.
 * En Designer, `groupContainer` no es un sistema de coordenadas: hijos y carpeta
 * comparten espacio de página (`getVisualAABB` / `getGroupBounds`). No sumar
 * offsets de ancestros — eso infla el origen y rompe filas a sangre.
 */
export function sourceWorldVisualBounds(
  layerId: string,
  index: SiteCreatorSelectionIndex,
): PageRect | null {
  const bounds = index.byId[layerId]?.visualBounds;
  return bounds ? { ...bounds } : null;
}

/**
 * Hijos de `groupContainer` (y raíces de página) viven en coords de página.
 * Máscara/contenido de clip y boolean están en espacio local: su `x/y` no es de página.
 */
export function isWorldSpaceLayerId(id: string, index: SiteCreatorSelectionIndex): boolean {
  const parentId = index.byId[id]?.parentLayerId;
  if (!parentId) return true;
  return index.byId[parentId]?.type === "groupContainer";
}

export function worldSpaceAncestorId(id: string, index: SiteCreatorSelectionIndex): string {
  let walk = id;
  const seen = new Set<string>();
  while (walk && !isWorldSpaceLayerId(walk, index)) {
    if (seen.has(walk)) break;
    seen.add(walk);
    const parent = index.byId[walk]?.parentLayerId;
    if (!parent) break;
    walk = parent;
  }
  return walk;
}

/** AABB de página: capas locales (clip/boolean) se desplazan por el origen del padre. */
export function worldVisualBoundsForLayer(
  layerId: string,
  index: SiteCreatorSelectionIndex,
): PageRect | null {
  const entry = index.byId[layerId];
  if (!entry?.object) return sourceWorldVisualBounds(layerId, index);
  if (isWorldSpaceLayerId(layerId, index)) return sourceWorldVisualBounds(layerId, index);
  let x = entry.object.x;
  let y = entry.object.y;
  let walk = layerId;
  while (!isWorldSpaceLayerId(walk, index)) {
    const parentId = index.byId[walk]?.parentLayerId;
    if (!parentId) break;
    const parent = index.byId[parentId]?.object;
    if (!parent) break;
    x += parent.x;
    y += parent.y;
    walk = parentId;
  }
  return {
    x,
    y,
    width: Math.max(0, entry.object.width),
    height: Math.max(0, entry.object.height),
  };
}

export function sourceWorldBoundsOfIds(
  ids: string[],
  index: SiteCreatorSelectionIndex,
): PageRect | null {
  const seen = new Set<string>();
  const rects: PageRect[] = [];
  for (const id of ids) {
    const worldId = worldSpaceAncestorId(id, index);
    if (seen.has(worldId)) continue;
    seen.add(worldId);
    const bounds = sourceWorldVisualBounds(worldId, index);
    if (bounds) rects.push(bounds);
  }
  return unionPageRects(rects);
}
