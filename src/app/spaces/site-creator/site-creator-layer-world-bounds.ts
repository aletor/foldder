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

export function sourceWorldBoundsOfIds(
  ids: string[],
  index: SiteCreatorSelectionIndex,
): PageRect | null {
  const rects = ids
    .map((id) => sourceWorldVisualBounds(id, index))
    .filter((r): r is PageRect => Boolean(r));
  return unionPageRects(rects);
}
