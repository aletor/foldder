import type { FreehandObject } from "@/app/spaces/FreehandStudio";
import { flattenObjectsForGradientDefs, getVisualAABB } from "@/app/spaces/FreehandStudio";
import {
  bindingKind,
  isPendingDesignerBinding,
  normalizeDesignerFolderEntityId,
} from "@/app/spaces/designer/designer-dataset-binding";
import { walkDesignerObjectTree } from "@/app/spaces/designer/designer-object-tree";
import { forEachTree, isGroupContainer } from "@/app/spaces/freehand/group-container";
import { normalizePopulateEntityId } from "./populate-entity-groups";

export interface PopulateEntityPickTarget {
  entityId: string;
  label: string;
  /** `groupContainer` u objeto raíz que representa la entidad. */
  objectId: string;
  bounds: { x: number; y: number; width: number; height: number };
  zOrder: number;
}

function unionAabb(
  items: { x: number; y: number; width: number; height: number }[],
): { x: number; y: number; width: number; height: number } | null {
  if (!items.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of items) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
}

function aabbFromObject(obj: FreehandObject, flat: FreehandObject[]) {
  const b = getVisualAABB(obj, flat);
  if (b.w <= 0 || b.h <= 0) return null;
  return { x: b.x, y: b.y, width: b.w, height: b.h };
}

/**
 * Carpetas (`groupContainer` con nombre) y entidades legacy sin carpeta → rectángulos clicables
 * alineados con cada jugador/registro del formulario Populate.
 */
export function collectPopulateEntityPickTargets(
  objects: FreehandObject[],
  entityLabels: Map<string, string>,
): PopulateEntityPickTarget[] {
  if (entityLabels.size === 0) return [];
  const flat = flattenObjectsForGradientDefs(objects);
  const targets: PopulateEntityPickTarget[] = [];
  let z = 0;

  forEachTree(objects, (obj) => {
    z += 1;
    if (!isGroupContainer(obj)) return;
    const name = obj.name?.trim();
    if (!name) return;
    const entityId = normalizeDesignerFolderEntityId(name);
    if (!entityLabels.has(entityId)) return;
    const bounds = aabbFromObject(obj, flat);
    if (!bounds) return;
    targets.push({
      entityId,
      label: entityLabels.get(entityId) ?? name,
      objectId: obj.id,
      bounds,
      zOrder: z,
    });
  });

  const folderEntityIds = new Set(targets.map((t) => t.entityId));
  const legacyBounds = new Map<string, { x: number; y: number; width: number; height: number }[]>();

  walkDesignerObjectTree(objects, (obj, ctx) => {
    if (ctx.folderEntityId && folderEntityIds.has(ctx.folderEntityId)) return;
    const binding = obj._designerDatasetBinding;
    if (!binding || !isPendingDesignerBinding(binding)) return;
    if (!bindingKind(binding, obj)) return;
    const entityId = ctx.folderEntityId ?? normalizePopulateEntityId(binding.slotLabel);
    if (!entityLabels.has(entityId) || folderEntityIds.has(entityId)) return;
    const bounds = aabbFromObject(obj, flat);
    if (!bounds) return;
    const list = legacyBounds.get(entityId) ?? [];
    list.push(bounds);
    legacyBounds.set(entityId, list);
  });

  for (const [entityId, boxes] of legacyBounds) {
    const bounds = unionAabb(boxes);
    if (!bounds) continue;
    targets.push({
      entityId,
      label: entityLabels.get(entityId) ?? entityId,
      objectId: `legacy::${entityId}`,
      bounds,
      zOrder: 10_000 + targets.length,
    });
  }

  return targets.sort((a, b) => a.zOrder - b.zOrder);
}

export function populateEntityAtCanvasPoint(
  targets: PopulateEntityPickTarget[],
  x: number,
  y: number,
): PopulateEntityPickTarget | null {
  for (let i = targets.length - 1; i >= 0; i--) {
    const t = targets[i]!;
    const b = t.bounds;
    if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) {
      return t;
    }
  }
  return null;
}
