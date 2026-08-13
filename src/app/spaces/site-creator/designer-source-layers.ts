import type { FreehandObject } from "../FreehandStudio";
import type { DesignerPageState } from "../designer/DesignerNode";
import { walkDesignerObjectTree } from "../designer/designer-object-tree";

/** Recorre el árbol y devuelve IDs únicos en orden de visita (sin duplicar). */
export function collectSnapshotLayerIds(objects: FreehandObject[] | undefined): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  walkDesignerObjectTree(objects, (obj) => {
    if (!obj.id || seen.has(obj.id)) return;
    seen.add(obj.id);
    ordered.push(obj.id);
  });
  return ordered;
}

export function countSnapshotLayers(page: Pick<DesignerPageState, "objects">): number {
  return collectSnapshotLayerIds(page.objects).length;
}

function findLayerInObjects(objects: FreehandObject[] | undefined, layerId: string): FreehandObject | null {
  let found: FreehandObject | null = null;
  walkDesignerObjectTree(objects, (obj) => {
    if (found) return;
    if (obj.id === layerId) found = obj;
  });
  return found;
}

/** Resuelve una capa por ID dentro del snapshot (incluye anidadas, máscaras y clips). */
export function resolveSnapshotLayerById(
  page: Pick<DesignerPageState, "objects">,
  layerId: string,
): FreehandObject | null {
  return findLayerInObjects(page.objects, layerId);
}
